// 与 engine/src/Enums.ts 一一对应
// 字符串值与 JSON 数据保持一致 (lowercase)

namespace Mg01.Core
{
    public enum Side { Left = 0, Right = 1 }

    public enum DamageType
    {
        Normal, Pierce, Magic, Siege, Chaos, Hero
    }

    public enum ArmorType
    {
        Unarmored, Light, Medium, Heavy, Fortified, Hero, Divine
    }

    public enum UnitRole
    {
        Step, Range, Heavy, Siege, Flying, Caster, Legendary
    }

    public enum BuildingKind
    {
        Castle, Tower, Barracks, Special, Legendary, Economy
    }

    public static class EnumNames
    {
        public static string ToJson(DamageType t) => t.ToString().ToLowerInvariant();
        public static string ToJson(ArmorType t) => t.ToString().ToLowerInvariant();
        public static string ToJson(UnitRole t) => t.ToString().ToLowerInvariant();
        public static string ToJson(BuildingKind t) => t.ToString().ToLowerInvariant();

        public static DamageType ParseDamageType(string s) =>
            (DamageType)System.Enum.Parse(typeof(DamageType), Capitalize(s), true);
        public static ArmorType ParseArmorType(string s) =>
            (ArmorType)System.Enum.Parse(typeof(ArmorType), Capitalize(s), true);
        public static UnitRole ParseUnitRole(string s) =>
            (UnitRole)System.Enum.Parse(typeof(UnitRole), Capitalize(s), true);
        public static BuildingKind ParseBuildingKind(string s) =>
            (BuildingKind)System.Enum.Parse(typeof(BuildingKind), Capitalize(s), true);

        private static string Capitalize(string s) =>
            string.IsNullOrEmpty(s) ? s : char.ToUpperInvariant(s[0]) + s.Substring(1).ToLowerInvariant();
    }
}
