// Unity 端 Unit 运行时实例。MonoBehaviour 化：transform.position 即 pos
// 与 engine/src/Unit.ts 一一对应

using System.Collections.Generic;
using UnityEngine;
using Mg01.Core;
using Mg01.Templates;

namespace Mg01.Sim
{
    public class Unit : MonoBehaviour
    {
        public static int _nextId = 1;

        public int id;
        public UnitTemplate tpl;
        public Side side;

        public float hp;
        public float mana;

        public float nextAttackReadyAt;
        public float? swingAt;            // null = 不在挥击
        public Object swingTarget;        // Unit 或 Building (轻量起见用 Object)

        public List<Buff> buffs = new();
        public float nextSpellReadyAt;
        public PendingSpell pendingSpell; // null = 没在施法

        public bool alive = true;
        public float deadAt;

        /// <summary>构造期：直接 new (Editor)；运行时请用 BattleSim.SpawnUnit Instantiate</summary>
        public void Init(UnitTemplate t, Side s, Vector2 pos)
        {
            id = _nextId++;
            tpl = t;
            side = s;
            transform.position = pos;
            hp = t.hp;
            mana = t.manaMax;
        }

        /// <summary>对应 Unit.takeDamage</summary>
        public float TakeDamage(float raw, DamageType atk)
        {
            float armor = tpl.defense.armor;
            foreach (var b in buffs) armor += b.armorFlat;
            var armorE = EnumNames.ParseArmorType(tpl.defense.armorType);
            float actual = DamageCalc.Calc(raw, atk, armor, armorE);
            hp -= actual;
            if (hp <= 0f) { hp = 0f; alive = false; }
            return actual;
        }

        /// <summary>+y = Left 攻向 Right</summary>
        public int ForwardSign() => side == Side.Left ? 1 : -1;

        public Vector2 Pos => transform.position;
    }

    public class PendingSpell
    {
        public SpellTemplate sp;
        public Unit target;
        public float castAt;
    }
}
