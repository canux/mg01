// 战斗主循环：固定步长 tick
// Unity 迁移：放进 MonoBehaviour.FixedUpdate 或 ECS System

import { Vec2 } from "./Vec2.ts";
import { Unit } from "./Unit.ts";
import { Building } from "./Building.ts";
import { Side } from "./Enums.ts";
import { Projectile, inferProjectile, isRangedAttack } from "./Projectile.ts";
import type { UnitTemplate, BuildingTemplate, BalanceDef, RaceDef } from "./Templates.ts";
import type { Player } from "./Player.ts";

export interface SimEvent {
  t: number;
  kind: "spawn" | "attack" | "death" | "building_down" | "castle_down" | "income" | "build" | "phase" | "projectile" | "end";
  msg: string;
}

/** 主城攻城阶段：时刻 (秒) → 主城护甲 + 每秒被动衰减 HP。维持第一个 <= now 的条目。 */
const SIEGE_PHASES: Array<{ t: number; castleArmor: number; decayPerSec: number; label: string }> = [
  { t: 0,   castleArmor: 5, decayPerSec: 0,  label: "opening" },
  { t: 120, castleArmor: 3, decayPerSec: 0,  label: "siege-1" },
  { t: 180, castleArmor: 1, decayPerSec: 5,  label: "siege-2" },
  { t: 240, castleArmor: 0, decayPerSec: 15, label: "sudden-death" },
];

/** 经济坡度：每 60s +10 基础收入 (0:10 / 60:20 / 120:30 / 180:40 / 240+:50 per 10s) */
function effectiveBaseIncome(baseIncome: number, now: number): number {
  return baseIncome + Math.floor(now / 60) * 10;
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
  players: Player[] = [];
  projectiles: Projectile[] = [];
  events: SimEvent[] = [];
  winner: Side | null = null;
  ended = false;
  private _hasLeftCastleEver = false;
  private _hasRightCastleEver = false;
  private _phaseIdx = 0;

  constructor(cfg: SimConfig) {
    this.cfg = cfg;
    this.balance = cfg.balance;
    this.dt = 1 / this.balance.tickRate;
  }

  log(ev: SimEvent) {
    this.events.push(ev);
    if (this.cfg.verbose) {
      console.log(`[t=${ev.t.toFixed(2)}s] ${ev.kind.padEnd(7)} ${ev.msg}`);
    }
  }

  /** 注册玩家；自动放置主城 */
  addPlayer(player: Player): void {
    this.players.push(player);
    const r = this._lookupRace(player.race);
    const castleId = r?.castleAsset ?? `${player.race}_castle`;
    const tpl = this._lookupBuilding(castleId);
    if (!tpl) throw new Error(`No castle template for race ${player.race} (id=${castleId})`);
    const laneY = this.balance.laneLength / 2;
    const y = player.side === Side.Left ? -laneY : laneY;
    const b = this.placeBuilding(tpl, player.side, new Vec2(0, y));
    player.ownedBuildings.push(b);
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

    // 0a. 阶段推进 (主城护甲衰减)
    this._tickEscalation();

    // 0b. 经济结算 + 策略出牌
    this._tickPlayers();

    // 1. 建筑出兵
    for (const b of this.buildings) {
      if (!b.alive) continue;
      if (!b.isReady(this.now)) continue;
      if (!b.tpl.spawns || !b.tpl.spawnIntervalSec) continue;
      if (this.now < b.nextSpawnAt) continue;
      const tpl = this._lookupUnit(b.tpl.spawns);
      if (!tpl) { b.nextSpawnAt += b.tpl.spawnIntervalSec; continue; }
      const offset = 60 * (b.side === Side.Left ? 1 : -1);
      const u = new Unit(tpl, b.side, new Vec2(b.pos.x, b.pos.y + offset));
      this.units.push(u);
      const owner = this.players.find(p => p.side === b.side);
      if (owner) owner.stats.unitsSpawned++;
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

    // 3.5 投射物推进 + 命中
    this._tickProjectiles();

    // 4. 清尸体
    this.units = this.units.filter(u => u.alive || (this.now - u.deadAt) < this.balance.rules.deathDissipateSec);

    // 5. 判胜
    if (this._hasLeftCastleEver && this._hasRightCastleEver) {
      const leftCastle = this.castle(Side.Left);
      const rightCastle = this.castle(Side.Right);
      if (!leftCastle && rightCastle) { this.winner = Side.Right; this.ended = true; this.log({ t: this.now, kind: "end", msg: "Right wins!" }); }
      else if (!rightCastle && leftCastle) { this.winner = Side.Left; this.ended = true; this.log({ t: this.now, kind: "end", msg: "Left wins!" }); }
      else if (!leftCastle && !rightCastle) { this.winner = null; this.ended = true; this.log({ t: this.now, kind: "end", msg: "Both castles down (draw)" }); }
    }
  }

  // ---- 内部：阶段推进 ----

  private _tickEscalation(): void {
    // 找到当前应处于的阶段（最后一个 t <= now 的条目）
    let target = 0;
    for (let i = 0; i < SIEGE_PHASES.length; i++) {
      if (this.now >= SIEGE_PHASES[i]!.t) target = i;
    }
    // 阶段跃迁：更新主城护甲并 log
    if (target !== this._phaseIdx) {
      const phase = SIEGE_PHASES[target]!;
      for (const b of this.buildings) {
        if (b.alive && b.tpl.kind === "castle") b.armor = phase.castleArmor;
      }
      this.log({ t: this.now, kind: "phase",
        msg: `Phase ${phase.label}: castle armor -> ${phase.castleArmor}${phase.decayPerSec ? `, decay ${phase.decayPerSec} HP/s` : ""}` });
      this._phaseIdx = target;
    }
    // 每 tick 应用被动衰减 (siege-2 / sudden-death)
    const decay = SIEGE_PHASES[this._phaseIdx]!.decayPerSec;
    if (decay > 0) {
      const loss = decay * this.dt;
      for (const b of this.buildings) {
        if (!b.alive || b.tpl.kind !== "castle") continue;
        b.hp -= loss;
        if (b.hp <= 0) {
          b.hp = 0; b.alive = false;
          this.log({ t: this.now, kind: "castle_down", msg: `${sideTag(b.side)} ${b.tpl.nameCn} collapsed (siege decay)` });
        }
      }
    }
  }

  // ---- 内部：玩家 ----

  private _tickPlayers(): void {
    // 收入结算
    for (const p of this.players) {
      while (this.now >= p.nextIncomeAt) {
        const n = p.incomePerInterval(effectiveBaseIncome(this.balance.baseIncome, this.now));
        p.earn(n);
        p.nextIncomeAt += this.balance.incomeIntervalSec;
        this.log({ t: this.now, kind: "income", msg: `${p.name} +${n} gold (total ${p.gold}, income ${n}/${this.balance.incomeIntervalSec}s)` });
      }
    }

    // 策略出牌
    for (const p of this.players) {
      if (!p.strategy) continue;
      const slots = this._freeSlots(p);
      if (slots.length === 0) continue;
      const ctx = {
        now: this.now,
        gold: p.gold,
        income: p.incomePerInterval(effectiveBaseIncome(this.balance.baseIncome, this.now)),
        availableSlots: slots.length,
        ownedBuildings: p.ownedBuildings as readonly Building[],
        canAfford: (bid: string): boolean => {
          const tpl = this._lookupBuilding(bid);
          return !!tpl && p.gold >= (tpl.cost ?? 0);
        },
        ownedCountOf: (bid: string): number => {
          return p.ownedBuildings.filter(b => b.alive && b.tpl.id === bid).length;
        },
      };
      const want = p.strategy.decide(ctx);
      if (!want) continue;
      const tpl = this._lookupBuilding(want);
      if (!tpl) continue;
      const cost = tpl.cost ?? 0;
      if (!p.spend(cost)) continue;
      const slot = slots[0]!;
      const b = this.placeBuilding(tpl, p.side, slot);
      p.ownedBuildings.push(b);
      this.log({ t: this.now, kind: "build", msg: `${p.name} builds ${tpl.nameCn} @(${slot.x.toFixed(0)},${slot.y.toFixed(0)}) -${cost} gold (${p.gold} left)` });
    }
  }

  /** 返回该玩家尚未占用的槽位 (按距主城近 → 远 排序) */
  private _freeSlots(p: Player): Vec2[] {
    const all = this._slotPositions(p.side);
    const used = new Set(p.ownedBuildings.filter(b => b.alive).map(b => `${b.pos.x.toFixed(0)},${b.pos.y.toFixed(0)}`));
    return all.filter(s => !used.has(`${s.x.toFixed(0)},${s.y.toFixed(0)}`));
  }

  /** 公共：所有槽位 (用于 viewer / 手动放置 UI) */
  slotPositions(side: Side): Vec2[] { return this._slotPositions(side); }

  /** 公共：判断某槽位是否已被占用 */
  slotIsFree(side: Side, slotIdx: number): boolean {
    const all = this._slotPositions(side);
    if (slotIdx < 0 || slotIdx >= all.length) return false;
    const slot = all[slotIdx]!;
    const key = `${slot.x.toFixed(0)},${slot.y.toFixed(0)}`;
    return !this.buildings.some(b => b.alive && b.side === side && `${b.pos.x.toFixed(0)},${b.pos.y.toFixed(0)}` === key);
  }

  /** 公共：玩家手动下单造建筑。返回 { ok, reason? } */
  manualBuild(side: Side, buildingId: string, slotIdx: number): { ok: boolean; reason?: string } {
    const p = this.players.find(pp => pp.side === side);
    if (!p) return { ok: false, reason: "no such player" };
    const tpl = this._lookupBuilding(buildingId);
    if (!tpl) return { ok: false, reason: `unknown building ${buildingId}` };
    if (tpl.race !== p.race) return { ok: false, reason: `race mismatch (${tpl.race} vs ${p.race})` };
    const all = this._slotPositions(side);
    if (slotIdx < 0 || slotIdx >= all.length) return { ok: false, reason: "slot index out of range" };
    if (!this.slotIsFree(side, slotIdx)) return { ok: false, reason: "slot occupied" };
    const cost = tpl.cost ?? 0;
    if (!p.spend(cost)) return { ok: false, reason: `need ${cost} gold (have ${p.gold})` };
    const slot = all[slotIdx]!;
    const b = this.placeBuilding(tpl, side, slot);
    p.ownedBuildings.push(b);
    this.log({ t: this.now, kind: "build",
      msg: `${p.name} (manual) builds ${tpl.nameCn} @slot${slotIdx} -${cost} gold (${p.gold} left)` });
    return { ok: true };
  }

  /** 己方半场 3 列 × 4 行 = 12 个建筑槽位 (距主城由近到远) */
  private _slotPositions(side: Side): Vec2[] {
    const laneY = this.balance.laneLength / 2;
    const sign = side === Side.Left ? -1 : 1;
    const slots: Vec2[] = [];
    const cols = [-260, 0, 260];
    const rowBaseY = laneY - 300;   // 距主城 300 的首排
    for (let r = 0; r < 4; r++) {
      for (const cx of cols) {
        slots.push(new Vec2(cx, sign * (rowBaseY - r * 280)));
      }
    }
    return slots;
  }

  // ---- 内部：模板查找 ----

  private _unitLookup?: (id: string) => UnitTemplate | undefined;
  private _buildingLookup?: (id: string) => BuildingTemplate | undefined;
  private _raceLookup?: (id: string) => RaceDef | undefined;
  setUnitLookup(f: (id: string) => UnitTemplate | undefined) { this._unitLookup = f; }
  setBuildingLookup(f: (id: string) => BuildingTemplate | undefined) { this._buildingLookup = f; }
  setRaceLookup(f: (id: string) => RaceDef | undefined) { this._raceLookup = f; }
  private _lookupUnit(id: string): UnitTemplate | undefined { return this._unitLookup ? this._unitLookup(id) : undefined; }
  private _lookupBuilding(id: string): BuildingTemplate | undefined { return this._buildingLookup ? this._buildingLookup(id) : undefined; }
  private _lookupRace(id: string): RaceDef | undefined { return this._raceLookup ? this._raceLookup(id) : undefined; }

  // ---- 内部：单位 AI ----

  private _unitStep(u: Unit): void {
    if (u.swingAt !== null && u.swingTarget) {
      if (this.now >= u.swingAt) {
        const t = u.swingTarget;
        if (t.alive && (isRangedAttack(u.tpl.attack.range) || u.distTo(t) <= u.tpl.attack.range + 30)) {
          if (isRangedAttack(u.tpl.attack.range)) {
            // 远程：发射投射物，命中再结算伤害
            const meta = inferProjectile(u.tpl.role, u.tpl.attack.damageType);
            const proj = new Projectile({
              side: u.side,
              pos: u.pos,
              target: t,
              damage: u.tpl.attack.damage,
              damageType: u.tpl.attack.damageType,
              speed: meta.speed,
              aoeRadius: u.tpl.attack.aoeRadius ?? 0,
              visualKind: meta.visualKind,
            });
            this.projectiles.push(proj);
            this.log({ t: this.now, kind: "projectile",
              msg: `${sideTag(u.side)} ${u.tpl.nameCn}#${u.id} fires ${meta.visualKind} -> ${sideTag(t.side)} ${t.tpl.nameCn}#${t.id}` });
          } else {
            // 近战：命中即伤害
            const actual = t.takeDamage(u.tpl.attack.damage, u.tpl.attack.damageType);
            this.log({ t: this.now, kind: "attack",
              msg: `${sideTag(u.side)} ${u.tpl.nameCn}#${u.id} -> ${sideTag(t.side)} ${t.tpl.nameCn}#${t.id} for ${actual.toFixed(1)}` });
            if (!t.alive) {
              t.deadAt = this.now;
              this.log({ t: this.now, kind: "death", msg: `${sideTag(t.side)} ${t.tpl.nameCn}#${t.id} died` });
            }
          }
        }
        u.swingAt = null;
        u.swingTarget = null;
      }
      return;
    }

    const target = this._findTarget(u);
    if (target) {
      const dist = Vec2.distance(u.pos, target.pos);
      if (dist <= u.tpl.attack.range + 1) {
        if (this.now >= u.nextAttackReadyAt) {
          u.swingAt = this.now + u.tpl.attack.attackPoint;
          u.swingTarget = target as Unit;
          u.nextAttackReadyAt = this.now + u.tpl.attack.speed;
        }
        return;
      }
      const dir = new Vec2(target.pos.x - u.pos.x, target.pos.y - u.pos.y).normalize();
      u.pos = u.pos.add(dir.mul(u.tpl.movement.speed * this.dt));
      return;
    }

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

  // ---- 内部：投射物 ----

  private _tickProjectiles(): void {
    if (this.projectiles.length === 0) return;
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      // 目标已死/已消失：投射物自销毁（扔到目标尸体位置太刻意）
      if (!p.target.alive) { p.alive = false; continue; }
      const hit = p.step(this.dt);
      if (!hit) continue;
      p.alive = false;
      p.hitAt = this.now;
      this._applyProjectileHit(p);
    }
    this.projectiles = this.projectiles.filter(p => p.alive);
  }

  private _applyProjectileHit(p: Projectile): void {
    const apply = (target: Unit | Building): void => {
      if (!target.alive) return;
      const actual = target.takeDamage(p.damage, p.damageType);
      this.log({ t: this.now, kind: "attack",
        msg: `${sideTag(p.side)} ${p.visualKind} -> ${sideTag(target.side)} ${target.tpl.nameCn}#${target.id} for ${actual.toFixed(1)}` });
      if (!target.alive) {
        if (target instanceof Unit) target.deadAt = this.now;
        this.log({ t: this.now, kind: target instanceof Building && target.tpl.kind === "castle" ? "castle_down" : "death",
          msg: `${sideTag(target.side)} ${target.tpl.nameCn}#${target.id} died` });
      }
    };

    if (p.aoeRadius > 0) {
      // AOE：圆心 = 命中位置；命中所有敌方 (单位 + 建筑)
      for (const e of this.units) {
        if (!e.alive || e.side === p.side) continue;
        if (Vec2.distance(p.pos, e.pos) <= p.aoeRadius) apply(e);
      }
      for (const b of this.buildings) {
        if (!b.alive || b.side === p.side) continue;
        if (Vec2.distance(p.pos, b.pos) <= p.aoeRadius) apply(b);
      }
    } else {
      apply(p.target);
    }
  }

  private _buildingAttackStep(b: Building, dmg: number, atkType: import("./Enums.ts").DamageType, range: number, speed: number): void {
    const state = b as unknown as { nextAttackReadyAt?: number };
    if (state.nextAttackReadyAt !== undefined && this.now < state.nextAttackReadyAt) return;
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
    state.nextAttackReadyAt = this.now + speed;
  }
}

function sideTag(s: Side): string { return s === Side.Left ? "[L]" : "[R]"; }
