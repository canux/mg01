// 与 Unity C# 一一对应的枚举 / 常量定义
// 迁移时把 `as const` 改为 `enum` 即可

export const Side = {
  Left: 0,
  Right: 1,
} as const;
export type Side = typeof Side[keyof typeof Side];

export const DamageType = {
  Normal: "normal",
  Pierce: "pierce",
  Magic: "magic",
  Siege: "siege",
  Chaos: "chaos",
  Hero: "hero",
} as const;
export type DamageType = typeof DamageType[keyof typeof DamageType];

export const ArmorType = {
  Unarmored: "unarmored",
  Light: "light",
  Medium: "medium",
  Heavy: "heavy",
  Fortified: "fortified",
  Hero: "hero",
  Divine: "divine",
} as const;
export type ArmorType = typeof ArmorType[keyof typeof ArmorType];

export const UnitRole = {
  Step: "step",
  Range: "range",
  Heavy: "heavy",
  Siege: "siege",
  Flying: "flying",
  Caster: "caster",
  Legendary: "legendary",
} as const;
export type UnitRole = typeof UnitRole[keyof typeof UnitRole];

export const BuildingKind = {
  Castle: "castle",
  Tower: "tower",
  Barracks: "barracks",
  Special: "special",
  Legendary: "legendary",
} as const;
export type BuildingKind = typeof BuildingKind[keyof typeof BuildingKind];
