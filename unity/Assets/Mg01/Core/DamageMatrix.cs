// War3 6×7 伤害-护甲矩阵。从 data/damage_matrix.json 装载
// 与 engine/src/DataLoader.ts 的 damageMatrix 一致

using System.Collections.Generic;

namespace Mg01.Core
{
    public static class DamageMatrix
    {
        // [DamageType][ArmorType] = multiplier
        private static readonly Dictionary<DamageType, Dictionary<ArmorType, float>> _table = new()
        {
            [DamageType.Normal] = new() {
                [ArmorType.Unarmored] = 1.00f, [ArmorType.Light] = 1.00f, [ArmorType.Medium] = 1.50f,
                [ArmorType.Heavy] = 1.00f, [ArmorType.Fortified] = 0.55f, [ArmorType.Hero] = 1.00f,
                [ArmorType.Divine] = 0.05f,
            },
            [DamageType.Pierce] = new() {
                [ArmorType.Unarmored] = 1.50f, [ArmorType.Light] = 2.00f, [ArmorType.Medium] = 0.75f,
                [ArmorType.Heavy] = 1.25f, [ArmorType.Fortified] = 0.50f, [ArmorType.Hero] = 0.50f,
                [ArmorType.Divine] = 0.05f,
            },
            [DamageType.Magic] = new() {
                [ArmorType.Unarmored] = 1.00f, [ArmorType.Light] = 1.50f, [ArmorType.Medium] = 0.75f,
                [ArmorType.Heavy] = 2.25f, [ArmorType.Fortified] = 0.35f, [ArmorType.Hero] = 0.50f,
                [ArmorType.Divine] = 0.05f,
            },
            [DamageType.Siege] = new() {
                [ArmorType.Unarmored] = 1.00f, [ArmorType.Light] = 1.00f, [ArmorType.Medium] = 0.50f,
                [ArmorType.Heavy] = 1.00f, [ArmorType.Fortified] = 1.50f, [ArmorType.Hero] = 0.50f,
                [ArmorType.Divine] = 0.05f,
            },
            [DamageType.Chaos] = new() {
                [ArmorType.Unarmored] = 1.00f, [ArmorType.Light] = 1.00f, [ArmorType.Medium] = 1.00f,
                [ArmorType.Heavy] = 1.00f, [ArmorType.Fortified] = 1.00f, [ArmorType.Hero] = 1.00f,
                [ArmorType.Divine] = 1.00f,
            },
            [DamageType.Hero] = new() {
                [ArmorType.Unarmored] = 1.00f, [ArmorType.Light] = 1.00f, [ArmorType.Medium] = 1.00f,
                [ArmorType.Heavy] = 1.00f, [ArmorType.Fortified] = 0.50f, [ArmorType.Hero] = 1.00f,
                [ArmorType.Divine] = 0.50f,
            },
        };

        public static float Multiplier(DamageType atk, ArmorType armor)
        {
            return _table.TryGetValue(atk, out var row) && row.TryGetValue(armor, out var v) ? v : 1.0f;
        }

        /// <summary>
        /// 运行时覆盖（从 JSON 装载完后调用，让数据 vs 代码解耦）
        /// </summary>
        public static void Override(DamageType atk, ArmorType armor, float mult)
        {
            if (!_table.ContainsKey(atk)) _table[atk] = new Dictionary<ArmorType, float>();
            _table[atk][armor] = mult;
        }
    }
}
