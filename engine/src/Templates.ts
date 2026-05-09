// 只读静态数据结构 (从 JSON 反序列化)
// Unity 迁移：改成 ScriptableObject

import type { DamageType, ArmorType, UnitRole, BuildingKind } from "./Enums.ts";

export interface AnimEvent { time: number; name: string; }
export interface AnimClip  { clip: string; duration: number; loop?: boolean; events?: AnimEvent[]; }
export interface AnimSet   {
  stand?: AnimClip; walk?: AnimClip; attack?: AnimClip;
  spell?: AnimClip; morph?: AnimClip; death?: AnimClip;
}

export interface AttackDef {
  damage: number;
  damageType: DamageType;
  range: number;
  speed: number;            // 攻击间隔(秒)
  attackPoint: number;      // 出伤害关键帧(秒)
  attackBackswing: number;  // 收招(秒)
  aoeRadius?: number;
  bounce?: { count: number; falloff: number };
}

export interface DefenseDef { armor: number; armorType: ArmorType; }
export interface MoveDef    { speed: number; turnRate: number; collisionRadius: number; fly?: boolean; }
export interface VisionDef  { day: number; night: number; }

export interface UnitTemplate {
  id: string;
  race: string;
  nameCn: string;
  nameEn: string;
  role: UnitRole;
  cost: number;
  hp: number;
  manaMax?: number;
  manaRegen?: number;
  attack: AttackDef;
  defense: DefenseDef;
  movement: MoveDef;
  vision: VisionDef;
  abilities: string[];
  animation: AnimSet;
  assetKey: string;
}

export interface BuildingTemplate {
  id: string;
  race: string;
  nameCn: string;
  kind: BuildingKind;
  hp: number;
  armor: number;
  armorType: ArmorType;
  cost?: number;
  buildTimeSec?: number;
  incomeBonusPer10s?: number;
  spawns?: string;              // UnitTemplate.id
  spawnIntervalSec?: number;
  assetKey: string;
}

export interface SpellEffect {
  type: string;
  [k: string]: unknown;
}

export interface SpellTemplate {
  id: string;
  nameCn: string;
  manaCost: number;
  cooldownSec: number;
  castPoint: number;
  target: "ally" | "enemy" | "area" | "corpse" | "self";
  range: number;
  effect: SpellEffect;
}

export interface RaceDef {
  id: string;
  nameCn: string;
  nameEn: string;
  color: string;
  themeMusic?: string;
  castleAsset: string;
  description?: string;
}

export interface CastleDef {
  hp: number; armor: number; armorType: ArmorType;
  attackDamage: number; attackType: DamageType;
  attackRange: number; attackSpeed: number;
  attackPoint: number; attackBackswing: number;
  sight: number; incomeBonus: number;
}

export interface BalanceDef {
  tickRate: number;
  laneLength: number;
  laneWidth: number;
  incomeIntervalSec: number;
  startGold: number;
  baseIncome: number;
  castle: CastleDef;
  tower: {
    hp: number; armor: number; armorType: ArmorType;
    attackDamage: number; attackType: DamageType;
    attackRange: number; attackSpeed: number;
    attackPoint: number; attackBackswing: number;
    buildTimeSec: number; cost: number;
  };
  buildingDefaults: {
    barracksHp: number; barracksArmor: number;
    barracksArmorType: ArmorType; buildTimeSec: number;
    incomeBonusPer: number;
  };
  rules: {
    winCondition: string; maxBattleSec: number;
    corpseDecaySec: number; deathDissipateSec: number;
  };
}
