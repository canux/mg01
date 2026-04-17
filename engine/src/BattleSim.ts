// 战斗主循环：固定步长 tick
// Unity 迁移：放进 MonoBehaviour.FixedUpdate 或 ECS System

import { Vec2 } from "./Vec2.ts";
import { Unit } from "./Unit.ts";
import { Building } from "./Building.ts";
import { Side } from "./Enums.ts";
import type { UnitTemplate, BuildingTemplate, BalanceDef } from "./Templates.ts";
import { DamageCalc } from "./DamageCalc.ts";

export interface SimEvent {
  t: number;
  kind: "spawn" | "attack" | "death" | "building_down" | "castle_down" | "end";
  msg: string;
}

export interface SimConfig {
  balance: BalanceDef;
  verbose?: boolean;
  /** 战场纵向长度（默认从 balance.laneLength 取） */
  laneLength?: number;
}

export class BattleSim {
  readonly cfg: SimConfig;
  readonly balance: BalanceDef;

  now = 0;                                // 秒
  readonly dt: number;                    // 每 tick 秒数
  units: Unit[] = [];
  buildings: Building[] = [];
  events: SimEvent[] = [];
  winner: Side | null = null;
  ended = false;
  private _hasLeftCastleEver = false;
  private _hasRightCastleEver = false;

  constructor(cfg: SimConfig) {
    this.cfg = cfg;
    this.balance = cfg.balance;
    this.dt = 1 / this.balance.tickRate;
  }

  log(ev: SimEvent) {
    this.events.push(ev);
    if (this.cfg.verbose) {
      console.log(`[t=${ev.t.toFixed(2)}s] ${ev.kind.padEnd(14)} ${ev.msg}`);
    }
  }

  /** 放置建筑（castle/tower/barracks/special/legendary） */
  placeBuilding(tpl: BuildingTemplate, side: Side, pos: Vec2): Building {
    const b = new Building(tpl, side, pos, this.now);
    this.buildings.push(b);
    if (tpl.kind === "castle") {
      if (side === Side.Left) this._hasLeftCastleEver = true;
      else this._hasRightCastleEver = true;
    }
    return b;
  }

  /** 直接投放一个单位（测试用；正式走建筑 spawn） */
  placeUnit(tpl: UnitTemplate, side: Side, pos: Vec2): Unit {
    const u = new Unit(tpl, side, pos);
    this.units.push(u);
    return u;
  }

  castle(side: Side): Building | undefined {
    return this.buildings.find(b => b.side === side && b.tpl.kind === "castle" && b.alive);
  }

  run(maxSec?: number): void {
    const cap = maxSec ?? this.balance.rules.maxBattleSec;
    while (!this.ended && this.now < cap) {
      this.tick();
    }
    if (!this.ended) {
      this.log({ t: this.now, kind: "end", msg: `timeout at ${this.now.toFixed(1)}s (draw)` });
      this.ended = true;
    }
  }

  tick(): void {
    this.now += this.dt;

    // 1. 建筑出兵
    for (const b of this.buildings) {
      if (!b.alive) continue;
      if (!b.isReady(this.now)) continue;
      if (!b.tpl.spawns || !b.tpl.spawnIntervalSec) continue;
      if (this.now < b.nextSpawnAt) continue;
      const tpl = this._lookupUnit(b.tpl.spawns);
      if (!tpl) { b.nextSpawnAt += b.tpl.spawnIntervalSec; continue; }
      // 在建筑前方一个身位生成
      const offset = 60 * (b.side === Side.Left ? 1 : -1);
      const u = new Unit(tpl, b.side, new Vec2(b.pos.x, b.pos.y + offset));
      this.units.push(u);
      this.log({ t: this.now, kind: "spawn", msg: `${sideTag(b.side)} ${tpl.nameCn} #${u.id}` });
      b.nextSpawnAt = this.now + b.tpl.spawnIntervalSec;
    }

    // 2. 单位 AI
    for (const u of this.units) {
      if (!u.alive) continue;
      this._unitStep(u);
    }

    // 3. 建筑自卫 (Castle + Tower)
    for (const b of this.buildings) {
      if (!b.alive || !b.isReady(this.now)) continue;
      if (b.tpl.kind === "castle") this._buildingAttackStep(b, this.balance.castle.attackDamage, this.balance.castle.attackType, this.balance.castle.attackRange, this.balance.castle.attackSpeed);
      else if (b.tpl.kind === "tower") this._buildingAttackStep(b, this.balance.tower.attackDamage, this.balance.tower.attackType, this.balance.tower.attackRange, this.balance.tower.attackSpeed);
    }

    // 4. 清尸体（简化：立即移除死亡单位）
    this.units = this.units.filter(u => u.alive || (this.now - u.deadAt) < this.balance.rules.deathDissipateSec);

    // 5. 判胜 (仅当双方都放过主城时才触发)
    if (this._hasLeftCastleEver && this._hasRightCastleEver) {
      const leftCastle = this.castle(Side.Left);
      const rightCastle = this.castle(Side.Right);
      if (!leftCastle && rightCastle) { this.winner = Side.Right; this.ended = true; this.log({ t: this.now, kind: "end", msg: "Right wins!" }); }
      else if (!rightCastle && leftCastle) { this.winner = Side.Left; this.ended = true; this.log({ t: this.now, kind: "end", msg: "Left wins!" }); }
      else if (!leftCastle && !rightCastle) { this.winner = null; this.ended = true; this.log({ t: this.now, kind: "end", msg: "Both castles down (draw)" }); }
    }
  }

  // ---- 内部 ----

  /** 查模板（避免 BattleSim 直接 import DataLoader 造成测试耦合） */
  private _unitLookup?: (id: string) => UnitTemplate | undefined;
  setUnitLookup(f: (id: string) => UnitTemplate | undefined) { this._unitLookup = f; }
  private _lookupUnit(id: string): UnitTemplate | undefined {
    return this._unitLookup ? this._unitLookup(id) : undefined;
  }

  private _unitStep(u: Unit): void {
    // 正在挥击中：到帧触发伤害
    if (u.swingAt !== null && u.swingTarget) {
      if (this.now >= u.swingAt) {
        const t = u.swingTarget;
        if (t.alive && u.distTo(t) <= u.tpl.attack.range + 30) {
          const actual = t.takeDamage(u.tpl.attack.damage, u.tpl.attack.damageType);
          this.log({ t: this.now, kind: "attack",
            msg: `${sideTag(u.side)} ${u.tpl.nameCn}#${u.id} -> ${sideTag(t.side)} ${t.tpl.nameCn}#${t.id} for ${actual.toFixed(1)}` });
          if (!t.alive) {
            t.deadAt = this.now;
            this.log({ t: this.now, kind: "death", msg: `${sideTag(t.side)} ${t.tpl.nameCn}#${t.id} died` });
          }
        }
        u.swingAt = null;
        u.swingTarget = null;
      }
      return;
    }

    // 找最近目标（单位 + 敌方建筑）
    const target = this._findTarget(u);
    if (target) {
      const dist = "pos" in target ? Vec2.distance(u.pos, target.pos) : Infinity;
      if (dist <= u.tpl.attack.range + 1) {
        if (this.now >= u.nextAttackReadyAt) {
          u.swingAt = this.now + u.tpl.attack.attackPoint;
          u.swingTarget = target as Unit; // 为简化，建筑复用 takeDamage 路径
          u.nextAttackReadyAt = this.now + u.tpl.attack.speed;
        }
        return;
      }
      // 向目标移动
      const dir = new Vec2(target.pos.x - u.pos.x, target.pos.y - u.pos.y).normalize();
      u.pos = u.pos.add(dir.mul(u.tpl.movement.speed * this.dt));
      return;
    }

    // 无目标：向敌方主城方向推进
    const dy = u.forwardSign() * u.tpl.movement.speed * this.dt;
    u.pos = new Vec2(u.pos.x, u.pos.y + dy);
  }

  private _findTarget(u: Unit): Unit | Building | null {
    let best: Unit | Building | null = null;
    let bestD = Infinity;
    for (const e of this.units) {
      if (!e.alive || e.side === u.side) continue;
      const d = Vec2.distance(u.pos, e.pos);
      if (d < bestD) { bestD = d; best = e; }
    }
    for (const b of this.buildings) {
      if (!b.alive || b.side === u.side) continue;
      const d = Vec2.distance(u.pos, b.pos);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  private _buildingAttackStep(b: Building, dmg: number, atkType: import("./Enums.ts").DamageType, range: number, speed: number): void {
    if (this.now < (b as unknown as { nextAttackReadyAt?: number }).nextAttackReadyAt!) return;
    let closest: Unit | null = null;
    let cd = Infinity;
    for (const e of this.units) {
      if (!e.alive || e.side === b.side) continue;
      const d = Vec2.distance(b.pos, e.pos);
      if (d <= range && d < cd) { cd = d; closest = e; }
    }
    if (!closest) return;
    const actual = closest.takeDamage(dmg, atkType);
    this.log({ t: this.now, kind: "attack", msg: `${sideTag(b.side)} ${b.tpl.nameCn} -> ${closest.tpl.nameCn}#${closest.id} for ${actual.toFixed(1)}` });
    if (!closest.alive) {
      closest.deadAt = this.now;
      this.log({ t: this.now, kind: "death", msg: `${sideTag(closest.side)} ${closest.tpl.nameCn}#${closest.id} died (by ${b.tpl.nameCn})` });
    }
    (b as unknown as { nextAttackReadyAt: number }).nextAttackReadyAt = this.now + speed;
  }
}

function sideTag(s: Side): string { return s === Side.Left ? "[L]" : "[R]"; }
