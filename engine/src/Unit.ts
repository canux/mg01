// 运行时单位实例
// Unity 迁移：改成 MonoBehaviour，pos 换 Transform.position

import { Vec2 } from "./Vec2.ts";
import type { Side } from "./Enums.ts";
import type { UnitTemplate, SpellTemplate } from "./Templates.ts";
import { DamageCalc } from "./DamageCalc.ts";
import type { Building } from "./Building.ts";
import type { Buff } from "./SpellEngine.ts";

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

  /** 法术 buff/debuff (heal 是即时不算 buff；bloodlust/faerieFire/frostNova-slow 都进这里) */
  buffs: Buff[] = [];
  /** 下一次可施法的绝对时间 (秒) */
  nextSpellReadyAt = 0;
  /** 正在施的法术 (castPoint 延迟生效)；null = 没在施法 */
  pendingSpell: { sp: SpellTemplate; target: Unit; castAt: number } | null = null;

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
    // 防御护甲 = 基础 + 当前 buff 的 armorFlat (faerieFire 等)
    let armor = this.tpl.defense.armor;
    for (const b of this.buffs) if (b.armorFlat) armor += b.armorFlat;
    const actual = DamageCalc.calc(raw, atkType, armor, this.tpl.defense.armorType);
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
