// 法术系统：caster 单位自动施法 (MVP 4 个法术)
// 翻译到 Unity：每个 spell 一个 ScriptableObject + 静态 effect handler

import { Vec2 } from "./Vec2.ts";
import { Unit } from "./Unit.ts";
import type { Side } from "./Enums.ts";
import type { SpellTemplate } from "./Templates.ts";

/** 单位身上的临时增减益。expiresAt 为绝对秒，<= now 视为失效 */
export interface Buff {
  id: string;
  expiresAt: number;
  armorFlat?: number;
  attackSpeedPct?: number;   // 正 = 加速 (1+x 倍频)
  moveSpeedPct?: number;     // 正 = 加速；-0.5 = 减半
  damagePct?: number;        // 正 = 增伤
}

/** 单位的有效属性 (基础 + 全部活动 buff)，调用方按 now 过滤 */
export class UnitMods {
  static armor(u: Unit, now: number): number {
    let v = u.tpl.defense.armor;
    for (const b of u.buffs) if (b.expiresAt > now && b.armorFlat) v += b.armorFlat;
    return v;
  }
  static attackInterval(u: Unit, now: number): number {
    let pct = 0;
    for (const b of u.buffs) if (b.expiresAt > now && b.attackSpeedPct) pct += b.attackSpeedPct;
    return u.tpl.attack.speed / Math.max(0.1, 1 + pct);
  }
  static moveSpeed(u: Unit, now: number): number {
    let pct = 0;
    for (const b of u.buffs) if (b.expiresAt > now && b.moveSpeedPct) pct += b.moveSpeedPct;
    return u.tpl.movement.speed * Math.max(0.1, 1 + pct);
  }
  static damage(u: Unit, now: number): number {
    let pct = 0;
    for (const b of u.buffs) if (b.expiresAt > now && b.damagePct) pct += b.damagePct;
    return u.tpl.attack.damage * (1 + pct);
  }
  static prune(u: Unit, now: number): void {
    if (u.buffs.length === 0) return;
    u.buffs = u.buffs.filter(b => b.expiresAt > now);
  }
  static hasBuff(u: Unit, id: string, now: number): boolean {
    return u.buffs.some(b => b.id === id && b.expiresAt > now);
  }
  static replaceBuff(u: Unit, b: Buff): void {
    const i = u.buffs.findIndex(x => x.id === b.id);
    if (i >= 0) u.buffs[i] = b; else u.buffs.push(b);
  }
}

/** 自动选择施法目标。返回成功施法的 SpellTemplate (用于日志)，否则 null */
export function autoCast(
  caster: Unit,
  now: number,
  spellLookup: (id: string) => SpellTemplate | undefined,
  units: Unit[],
): { spell: SpellTemplate; target: Unit | { pos: Vec2 } } | null {
  if (caster.tpl.manaMax === undefined) return null;
  if (caster.nextSpellReadyAt > now) return null;

  for (const id of caster.tpl.abilities) {
    const sp = spellLookup(id);
    if (!sp || !MVP_SPELLS.has(sp.id)) continue;
    if (caster.mana < sp.manaCost) continue;

    const r = pickTarget(caster, sp, units, now);
    if (!r) continue;
    return { spell: sp, target: r };
  }
  return null;
}

const MVP_SPELLS = new Set(["heal", "bloodlust", "frostNova", "faerieFire"]);

function pickTarget(caster: Unit, sp: SpellTemplate, units: Unit[], now: number): Unit | null {
  const friendly = units.filter(u => u.alive && u.side === caster.side && u.id !== caster.id);
  const enemy    = units.filter(u => u.alive && u.side !== caster.side);

  if (sp.id === "heal") {
    let best: Unit | null = null;
    let bestPct = 0.7;   // 只在 < 70% 时治疗
    for (const u of friendly) {
      if (Vec2.distance(caster.pos, u.pos) > sp.range) continue;
      const pct = u.hp / u.tpl.hp;
      if (pct < bestPct) { bestPct = pct; best = u; }
    }
    return best;
  }

  if (sp.id === "bloodlust") {
    let best: Unit | null = null;
    let bestDmg = 0;
    for (const u of friendly) {
      if (u.tpl.role === "caster" || u.tpl.role === "step" && u.tpl.attack.damage < 10) continue;
      if (UnitMods.hasBuff(u, "bloodlust", now)) continue;
      if (Vec2.distance(caster.pos, u.pos) > sp.range) continue;
      if (u.tpl.attack.damage > bestDmg) { bestDmg = u.tpl.attack.damage; best = u; }
    }
    return best;
  }

  if (sp.id === "faerieFire") {
    let best: Unit | null = null;
    let bestArmor = -Infinity;
    for (const u of enemy) {
      if (UnitMods.hasBuff(u, "faerieFire", now)) continue;
      if (Vec2.distance(caster.pos, u.pos) > sp.range) continue;
      const a = UnitMods.armor(u, now);
      if (a > bestArmor) { bestArmor = a; best = u; }
    }
    return best;
  }

  if (sp.id === "frostNova") {
    const radius = (sp.effect as { radius?: number }).radius ?? 200;
    let best: Unit | null = null;
    let bestCount = 1;   // 只在能溅射 ≥ 2 个目标时才放
    for (const u of enemy) {
      if (Vec2.distance(caster.pos, u.pos) > sp.range) continue;
      let cnt = 0;
      for (const e of enemy) if (Vec2.distance(u.pos, e.pos) <= radius) cnt++;
      if (cnt > bestCount) { bestCount = cnt; best = u; }
    }
    return best;
  }

  return null;
}

/** 应用法术效果。caster.mana 已扣，nextSpellReadyAt 已置。返回事件描述 */
export function applyEffect(
  caster: Unit,
  sp: SpellTemplate,
  target: Unit,
  now: number,
  allUnits: Unit[],
): string {
  switch (sp.id) {
    case "heal": {
      const amount = (sp.effect as { amount: number }).amount ?? 25;
      const before = target.hp;
      target.hp = Math.min(target.tpl.hp, target.hp + amount);
      return `heal +${(target.hp - before).toFixed(0)} → ${target.tpl.nameCn}#${target.id}`;
    }
    case "bloodlust": {
      const e = sp.effect as { durationSec: number; attackSpeedPct: number; moveSpeedPct: number };
      UnitMods.replaceBuff(target, {
        id: "bloodlust",
        expiresAt: now + e.durationSec,
        attackSpeedPct: e.attackSpeedPct,
        moveSpeedPct: e.moveSpeedPct,
      });
      return `bloodlust → ${target.tpl.nameCn}#${target.id} (+${(e.attackSpeedPct * 100) | 0}% atkspd)`;
    }
    case "faerieFire": {
      const e = sp.effect as { durationSec: number; armorFlat: number };
      UnitMods.replaceBuff(target, {
        id: "faerieFire",
        expiresAt: now + e.durationSec,
        armorFlat: e.armorFlat,
      });
      return `faerieFire → ${target.tpl.nameCn}#${target.id} (${e.armorFlat} armor)`;
    }
    case "frostNova": {
      const e = sp.effect as { dmgMagic: number; slowPct: number; slowSec: number; radius: number };
      let hits = 0;
      for (const u of allUnits) {
        if (!u.alive || u.side === caster.side) continue;
        if (Vec2.distance(target.pos, u.pos) > e.radius) continue;
        u.takeDamage(e.dmgMagic, "magic");
        UnitMods.replaceBuff(u, {
          id: "frostNova",
          expiresAt: now + e.slowSec,
          moveSpeedPct: -e.slowPct,
        });
        if (!u.alive) u.deadAt = now;
        hits++;
      }
      return `frostNova @${target.tpl.nameCn}#${target.id} hits ${hits} (${e.dmgMagic} mag + slow)`;
    }
  }
  return `${sp.id} (no-op)`;
}
