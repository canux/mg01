// 与 engine/src/Projectile.ts 一一对应

using UnityEngine;
using Mg01.Core;

namespace Mg01.Sim
{
    public enum ProjectileVisual { Arrow, Bolt, Shell, Magic }

    public class Projectile : MonoBehaviour
    {
        public static int _nextId = 1;

        public int id;
        public Side side;
        public Object target;       // Unit 或 Building
        public float damage;
        public DamageType damageType;
        public float speed;          // px/sec (世界坐标)
        public float aoeRadius;      // 0 = 单体
        public ProjectileVisual visualKind = ProjectileVisual.Arrow;

        public bool alive = true;
        public float? hitAt;         // 命中时间戳

        public Vector2 Pos => transform.position;

        public void Init(Side s, Vector2 startPos, Object tgt, float dmg, DamageType dt,
                         float spd, float aoe = 0f, ProjectileVisual vk = ProjectileVisual.Arrow)
        {
            id = _nextId++;
            side = s;
            transform.position = startPos;
            target = tgt;
            damage = dmg;
            damageType = dt;
            speed = spd;
            aoeRadius = aoe;
            visualKind = vk;
        }

        /// <summary>推进一帧；返回 true = 命中</summary>
        public bool Step(float dt)
        {
            if (!alive) return false;
            Vector2 tpos = TargetPos();
            Vector2 me = Pos;
            float dx = tpos.x - me.x;
            float dy = tpos.y - me.y;
            float dist = Mathf.Sqrt(dx * dx + dy * dy);
            float stepLen = speed * dt;
            if (dist <= stepLen + 4f)
            {
                transform.position = tpos;
                return true;
            }
            transform.position = new Vector2(me.x + (dx / dist) * stepLen, me.y + (dy / dist) * stepLen);
            return false;
        }

        private Vector2 TargetPos()
        {
            if (target is Unit u) return u.Pos;
            if (target is Building b) return b.Pos;
            return Pos;
        }

        // ---- 与 TS inferProjectile / isRangedAttack 对应 ----
        public static (ProjectileVisual visual, float speed) Infer(string role, DamageType damageType)
        {
            if (role == "siege")  return (ProjectileVisual.Shell, 700f);
            if (role == "caster" || damageType == DamageType.Magic) return (ProjectileVisual.Magic, 900f);
            if (role == "range"  || damageType == DamageType.Pierce) return (ProjectileVisual.Arrow, 1100f);
            return (ProjectileVisual.Bolt, 1000f);
        }

        public static bool IsRangedAttack(float rangePx) => rangePx > 200f;
    }
}
