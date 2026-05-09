// 与 engine/src/SpellEngine.ts 一一对应
// MVP 4 个法术：heal / bloodlust / faerieFire / frostNova
// caster 与 legendary 都能放（gate 在 manaMax 而不是 role）

using System.Collections.Generic;
using UnityEngine;
using Mg01.Core;
using Mg01.Templates;

namespace Mg01.Sim
{
    public struct SpellPick
    {
        public SpellTemplate spell;
        public Unit target;
    }

    public static class SpellEngine
    {
        private static readonly HashSet<string> MVP_SPELLS = new()
        { "heal", "bloodlust", "frostNova", "faerieFire" };

        /// <summary>对应 TS autoCast()。返回 null 表示当前无可放法术</summary>
        public static SpellPick? AutoCast(Unit caster, float now,
            System.Func<string, SpellTemplate> spellLookup, List<Unit> units)
        {
            if (caster.tpl.manaMax <= 0f) return null;
            if (caster.nextSpellReadyAt > now) return null;
            if (caster.tpl.abilities == null) return null;

            foreach (var id in caster.tpl.abilities)
            {
                var sp = spellLookup?.Invoke(id);
                if (sp == null || !MVP_SPELLS.Contains(sp.id)) continue;
                if (caster.mana < sp.manaCost) continue;
                var t = PickTarget(caster, sp, units, now);
                if (t == null) continue;
                return new SpellPick { spell = sp, target = t };
            }
            return null;
        }

        private static Unit PickTarget(Unit caster, SpellTemplate sp, List<Unit> units, float now)
        {
            switch (sp.id)
            {
                case "heal":
                {
                    Unit best = null; float bestPct = 0.7f;
                    foreach (var u in units)
                    {
                        if (!u.alive || u.side != caster.side || u.id == caster.id) continue;
                        if (Vector2.Distance(caster.Pos, u.Pos) > sp.range) continue;
                        float pct = u.hp / Mathf.Max(1f, u.tpl.hp);
                        if (pct < bestPct) { bestPct = pct; best = u; }
                    }
                    return best;
                }
                case "bloodlust":
                {
                    Unit best = null; float bestDmg = 0f;
                    foreach (var u in units)
                    {
                        if (!u.alive || u.side != caster.side || u.id == caster.id) continue;
                        if (u.tpl.role == "caster") continue;
                        if (u.tpl.role == "step" && u.tpl.attack.damage < 10f) continue;
                        if (UnitMods.HasBuff(u, "bloodlust", now)) continue;
                        if (Vector2.Distance(caster.Pos, u.Pos) > sp.range) continue;
                        if (u.tpl.attack.damage > bestDmg) { bestDmg = u.tpl.attack.damage; best = u; }
                    }
                    return best;
                }
                case "faerieFire":
                {
                    Unit best = null; float bestArmor = float.NegativeInfinity;
                    foreach (var u in units)
                    {
                        if (!u.alive || u.side == caster.side) continue;
                        if (UnitMods.HasBuff(u, "faerieFire", now)) continue;
                        if (Vector2.Distance(caster.Pos, u.Pos) > sp.range) continue;
                        float a = UnitMods.Armor(u, now);
                        if (a > bestArmor) { bestArmor = a; best = u; }
                    }
                    return best;
                }
                case "frostNova":
                {
                    float radius = sp.effect != null && sp.effect.radius > 0f ? sp.effect.radius : 200f;
                    Unit best = null; int bestCount = 1;
                    foreach (var u in units)
                    {
                        if (!u.alive || u.side == caster.side) continue;
                        if (Vector2.Distance(caster.Pos, u.Pos) > sp.range) continue;
                        int cnt = 0;
                        foreach (var e in units)
                        {
                            if (!e.alive || e.side == caster.side) continue;
                            if (Vector2.Distance(u.Pos, e.Pos) <= radius) cnt++;
                        }
                        if (cnt > bestCount) { bestCount = cnt; best = u; }
                    }
                    return best;
                }
            }
            return null;
        }

        /// <summary>对应 TS applyEffect()。caster.mana 已扣，nextSpellReadyAt 已置；返回事件描述</summary>
        public static string ApplyEffect(Unit caster, SpellTemplate sp, Unit target, float now, List<Unit> allUnits)
        {
            switch (sp.id)
            {
                case "heal":
                {
                    float amount = sp.effect != null && sp.effect.amount > 0f ? sp.effect.amount : 25f;
                    float before = target.hp;
                    target.hp = Mathf.Min(target.tpl.hp, target.hp + amount);
                    return $"heal +{(target.hp - before):F0} -> {target.tpl.nameCn}#{target.id}";
                }
                case "bloodlust":
                {
                    var e = sp.effect;
                    UnitMods.ReplaceBuff(target, new Buff
                    {
                        id = "bloodlust",
                        expiresAt = now + e.durationSec,
                        attackSpeedPct = e.attackSpeedPct,
                        moveSpeedPct = e.moveSpeedPct,
                    });
                    return $"bloodlust -> {target.tpl.nameCn}#{target.id} (+{(int)(e.attackSpeedPct * 100f)}% atkspd)";
                }
                case "faerieFire":
                {
                    var e = sp.effect;
                    UnitMods.ReplaceBuff(target, new Buff
                    {
                        id = "faerieFire",
                        expiresAt = now + e.durationSec,
                        armorFlat = e.armorFlat,
                    });
                    return $"faerieFire -> {target.tpl.nameCn}#{target.id} ({e.armorFlat} armor)";
                }
                case "frostNova":
                {
                    var e = sp.effect;
                    int hits = 0;
                    foreach (var u in allUnits)
                    {
                        if (!u.alive || u.side == caster.side) continue;
                        if (Vector2.Distance(target.Pos, u.Pos) > e.radius) continue;
                        u.TakeDamage(e.dmgMagic, DamageType.Magic);
                        UnitMods.ReplaceBuff(u, new Buff
                        {
                            id = "frostNova",
                            expiresAt = now + e.slowSec,
                            moveSpeedPct = -e.slowPct,
                        });
                        if (!u.alive) u.deadAt = now;
                        hits++;
                    }
                    return $"frostNova @{target.tpl.nameCn}#{target.id} hits {hits} ({e.dmgMagic} mag + slow)";
                }
            }
            return $"{sp.id} (no-op)";
        }
    }
}
