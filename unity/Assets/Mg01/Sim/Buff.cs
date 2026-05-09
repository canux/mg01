// Buff/UnitMods，与 engine/src/SpellEngine.ts 一致

using System;
using System.Collections.Generic;
using UnityEngine;

namespace Mg01.Sim
{
    [Serializable]
    public class Buff
    {
        public string id;
        public float expiresAt;
        public float armorFlat;
        public float attackSpeedPct;
        public float moveSpeedPct;
        public float damagePct;
    }

    public static class UnitMods
    {
        public static float Armor(Unit u, float now)
        {
            float v = u.tpl.defense.armor;
            foreach (var b in u.buffs) if (b.expiresAt > now && b.armorFlat != 0f) v += b.armorFlat;
            return v;
        }
        public static float AttackInterval(Unit u, float now)
        {
            float pct = 0f;
            foreach (var b in u.buffs) if (b.expiresAt > now && b.attackSpeedPct != 0f) pct += b.attackSpeedPct;
            return u.tpl.attack.speed / Mathf.Max(0.1f, 1f + pct);
        }
        public static float MoveSpeed(Unit u, float now)
        {
            float pct = 0f;
            foreach (var b in u.buffs) if (b.expiresAt > now && b.moveSpeedPct != 0f) pct += b.moveSpeedPct;
            return u.tpl.movement.speed * Mathf.Max(0.1f, 1f + pct);
        }
        public static float Damage(Unit u, float now)
        {
            float pct = 0f;
            foreach (var b in u.buffs) if (b.expiresAt > now && b.damagePct != 0f) pct += b.damagePct;
            return u.tpl.attack.damage * (1f + pct);
        }
        public static void Prune(Unit u, float now)
        {
            if (u.buffs.Count == 0) return;
            u.buffs.RemoveAll(b => b.expiresAt <= now);
        }
        public static bool HasBuff(Unit u, string id, float now)
        {
            foreach (var b in u.buffs) if (b.id == id && b.expiresAt > now) return true;
            return false;
        }
        public static void ReplaceBuff(Unit u, Buff b)
        {
            int i = u.buffs.FindIndex(x => x.id == b.id);
            if (i >= 0) u.buffs[i] = b; else u.buffs.Add(b);
        }
    }
}
