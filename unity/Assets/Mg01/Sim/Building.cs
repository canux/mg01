// 与 engine/src/Building.ts 一一对应。MonoBehaviour 化

using UnityEngine;
using Mg01.Core;
using Mg01.Templates;

namespace Mg01.Sim
{
    public class Building : MonoBehaviour
    {
        public static int _nextId = 1;

        public int id;
        public BuildingTemplate tpl;
        public Side side;

        public float hp;
        public float armor;        // 可被阶段机制覆盖 (主城 Siege Phase)
        public bool alive = true;

        public float nextSpawnAt;  // 下次出兵绝对秒
        public float readyAt;      // 建造完成时间

        public void Init(BuildingTemplate t, Side s, Vector2 pos, float createdAt)
        {
            id = _nextId++;
            tpl = t;
            side = s;
            transform.position = pos;
            hp = t.hp;
            armor = t.armor;
            readyAt = createdAt + t.buildTimeSec;
            nextSpawnAt = readyAt + t.spawnIntervalSec;
        }

        public bool IsReady(float now) => now >= readyAt;

        public float TakeDamage(float raw, DamageType atk)
        {
            var armorE = EnumNames.ParseArmorType(tpl.armorType);
            float actual = DamageCalc.Calc(raw, atk, armor, armorE);
            hp -= actual;
            if (hp <= 0f) { hp = 0f; alive = false; }
            return actual;
        }

        public Vector2 Pos => transform.position;
    }
}
