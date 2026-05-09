// 投射物：远程/法术/攻城单位的飞行物。瞬间发射 → 飞行 → 命中目标
// Unity 迁移：MonoBehaviour + Transform.position 插值；或 ECS 组件
// 当前实现：直线插值，命中时锁定目标位置（追踪式）；目标死亡 → 撞已死位置 → 自销毁

import { Vec2 } from "./Vec2.ts";
import type { Side, DamageType } from "./Enums.ts";
import type { Unit } from "./Unit.ts";
import type { Building } from "./Building.ts";

export type ProjectileTarget = Unit | Building;

export class Projectile {
  static _nextId = 1;

  readonly id: number;
  readonly side: Side;
  pos: Vec2;
  readonly target: ProjectileTarget;
  readonly damage: number;
  readonly damageType: DamageType;
  readonly speed: number;          // px/sec (世界坐标)
  readonly aoeRadius: number;      // 0 = 单体
  readonly visualKind: "arrow" | "bolt" | "shell" | "magic";

  alive = true;
  hitAt: number | null = null;     // 命中时间戳（用于动画延迟销毁）

  constructor(opts: {
    side: Side;
    pos: Vec2;
    target: ProjectileTarget;
    damage: number;
    damageType: DamageType;
    speed: number;
    aoeRadius?: number;
    visualKind?: "arrow" | "bolt" | "shell" | "magic";
  }) {
    this.id = Projectile._nextId++;
    this.side = opts.side;
    this.pos = opts.pos.clone();
    this.target = opts.target;
    this.damage = opts.damage;
    this.damageType = opts.damageType;
    this.speed = opts.speed;
    this.aoeRadius = opts.aoeRadius ?? 0;
    this.visualKind = opts.visualKind ?? "arrow";
  }

  /** 推进一帧；返回 true 表示命中（外部应用伤害+销毁） */
  step(dt: number): boolean {
    if (!this.alive) return false;
    const tx = this.target.pos.x;
    const ty = this.target.pos.y;
    const dx = tx - this.pos.x;
    const dy = ty - this.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const stepLen = this.speed * dt;
    if (dist <= stepLen + 4) {
      this.pos = new Vec2(tx, ty);
      return true;
    }
    this.pos = new Vec2(this.pos.x + (dx / dist) * stepLen, this.pos.y + (dy / dist) * stepLen);
    return false;
  }
}

/** 根据单位 role / damageType 推断默认投射物视觉 + 飞行速度 */
export function inferProjectile(role: string, damageType: DamageType): { visualKind: "arrow" | "bolt" | "shell" | "magic"; speed: number } {
  if (role === "siege") return { visualKind: "shell", speed: 700 };
  if (role === "caster" || damageType === "magic") return { visualKind: "magic", speed: 900 };
  if (role === "range" || damageType === "pierce") return { visualKind: "arrow", speed: 1100 };
  return { visualKind: "bolt", speed: 1000 };
}

/** 远程判定：range > 200 视为投射物单位（近战不走飞行）*/
export function isRangedAttack(rangePx: number): boolean {
  return rangePx > 200;
}
