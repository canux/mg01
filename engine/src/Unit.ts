// 运行时单位实例
// Unity 迁移：改成 MonoBehaviour，pos 换 Transform.position

import { Vec2 } from "./Vec2.ts";
import type { Side } from "./Enums.ts";
import type { UnitTemplate } from "./Templates.ts";
import { DamageCalc } from "./DamageCalc.ts";
import type { Building } from "./Building.ts";

export type AttackTarget = Unit | Building;

export class Unit {
  static _nextId = 1;

  readonly id: number;
  readonly tpl: UnitTemplate;
  readonly side: Side;
  pos: Vec2;

  hp: number;
  mana: number;

  /** 下一次可出手的绝对时间 (秒) */
  nextAttackReadyAt = 0;
  /** 攻击动画关键帧触发时间；null 表示当前不在挥击 */
  swingAt: number | null = null;
  /** 正在挥向的目标（Unit 或 Building） */
  swingTarget: AttackTarget | null = null;

  alive = true;
  deadAt = 0;

  constructor(tpl: UnitTemplate, side: Side, pos: Vec2) {
    this.id = Unit._nextId++;
    this.tpl = tpl;
    this.side = side;
    this.pos = pos;
    this.hp = tpl.hp;
    this.mana = tpl.manaMax ?? 0;
  }

  takeDamage(raw: number, atkType: import("./Enums.ts").DamageType): number {
    const actual = DamageCalc.calc(raw, atkType, this.tpl.defense.armor, this.tpl.defense.armorType);
    this.hp -= actual;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
    return actual;
  }

  distTo(other: { pos: Vec2 }): number {
    return Vec2.distance(this.pos, other.pos);
  }

  /** 前进方向 (+y 为 Left 攻向 Right) */
  forwardSign(): number { return this.side === 0 ? 1 : -1; }
}
