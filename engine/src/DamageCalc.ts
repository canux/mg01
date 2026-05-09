// 伤害计算：查表 + 护甲减免
// War3 公式: damageAfterArmor = damage * multiplier * (1 - armor*0.06 / (1 + armor*0.06))
// 护甲 >= 0 时用上式；< 0 时用 2 - 0.94^(-armor)

import type { DamageType, ArmorType } from "./Enums.ts";
import { damageMatrix } from "./DataLoader.ts";

export class DamageCalc {
  /** 返回最终造成的血量减少值 */
  static calc(
    rawDamage: number,
    atkType: DamageType,
    armor: number,
    armorType: ArmorType
  ): number {
    const multiplier = damageMatrix[atkType]?.[armorType] ?? 1.0;
    const typed = rawDamage * multiplier;
    return typed * DamageCalc.armorReduction(armor);
  }

  /** War3 护甲减免系数 (0~1)  */
  static armorReduction(armor: number): number {
    if (armor >= 0) {
      const k = armor * 0.06;
      return 1 - k / (1 + k);
    }
    return 2 - Math.pow(0.94, -armor);
  }

  /** 只查矩阵倍率，不计护甲 */
  static multiplier(atkType: DamageType, armorType: ArmorType): number {
    return damageMatrix[atkType]?.[armorType] ?? 1.0;
  }
}
