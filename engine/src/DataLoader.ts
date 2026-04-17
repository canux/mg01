// 从 data/ 下的 JSON 读数据
// Unity 迁移：改成 Addressables / Resources.Load<ScriptableObject>

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type {
  UnitTemplate, BuildingTemplate, SpellTemplate, RaceDef, BalanceDef,
} from "./Templates.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "../../data");

function read<T>(file: string): T {
  return JSON.parse(readFileSync(resolve(DATA_DIR, file), "utf-8")) as T;
}

// 伤害矩阵：行=atkType, 列=armorType → 倍率
export const damageMatrix: Record<string, Record<string, number>> = (() => {
  const raw = read<{ matrix: Record<string, Record<string, number>> }>("damage_matrix.json");
  return raw.matrix;
})();

export const balance: BalanceDef = read<BalanceDef>("balance.json");

export const races: RaceDef[] = read<{ races: RaceDef[] }>("races.json").races;

function loadUnitsFrom(files: string[]): Map<string, UnitTemplate> {
  const map = new Map<string, UnitTemplate>();
  for (const f of files) {
    const list = read<{ units: UnitTemplate[] }>(f).units;
    for (const u of list) map.set(u.id, u);
  }
  return map;
}

export const units: Map<string, UnitTemplate> = loadUnitsFrom([
  "units_human.json",
  "units_orc.json",
  "units_undead.json",
  "units_nightelf.json",
]);

export const buildings: Map<string, BuildingTemplate> = (() => {
  const map = new Map<string, BuildingTemplate>();
  const list = read<{ buildings: BuildingTemplate[] }>("buildings.json").buildings;
  for (const b of list) map.set(b.id, b);
  return map;
})();

export const spells: Map<string, SpellTemplate> = (() => {
  const map = new Map<string, SpellTemplate>();
  const list = read<{ spells: SpellTemplate[] }>("spells.json").spells;
  for (const s of list) map.set(s.id, s);
  return map;
})();

export function unit(id: string): UnitTemplate {
  const t = units.get(id);
  if (!t) throw new Error(`Unit template not found: ${id}`);
  return t;
}

export function building(id: string): BuildingTemplate {
  const t = buildings.get(id);
  if (!t) throw new Error(`Building template not found: ${id}`);
  return t;
}

export function race(id: string): RaceDef {
  const r = races.find(r => r.id === id);
  if (!r) throw new Error(`Race not found: ${id}`);
  return r;
}
