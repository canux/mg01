// 伤害计算：与 engine/src/DamageCalc.ts 1:1 对应
// War3 公式: damageAfterArmor = damage * mult * (1 - armor*0.06 / (1 + armor*0.06))
// armor < 0 时: 2 - 0.94^(-armor)

using System;

namespace Mg01.Core
{
    public static class DamageCalc
    {
        /// <summary>返回最终扣血值</summary>
        public static float Calc(float rawDamage, DamageType atk, float armor, ArmorType armorType)
        {
            float mult = DamageMatrix.Multiplier(atk, armorType);
            float typed = rawDamage * mult;
            return typed * ArmorReduction(armor);
        }

        /// <summary>War3 护甲减免系数 (0..1+)</summary>
        public static float ArmorReduction(float armor)
        {
            if (armor >= 0f)
            {
                float k = armor * 0.06f;
                return 1f - k / (1f + k);
            }
            return 2f - (float)Math.Pow(0.94, -armor);
        }
    }
}
