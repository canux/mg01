// Unity 战斗主循环骨架。FixedUpdate 跑 tick；保持 tickRate=10Hz (dt=0.1s) 与 engine/ 端一致
//
// ⚠️ 这是骨架，方法体大多 TODO。权威实现在 engine/src/BattleSim.ts；
// 用对照阅读的方式 1:1 翻译过来即可。每个 TODO 注释末尾标了 TS 端行号或方法名。

using System.Collections.Generic;
using UnityEngine;
using Mg01.Core;
using Mg01.Templates;

namespace Mg01.Sim
{
    public enum SimEventKind {
        Spawn, Attack, Death, BuildingDown, CastleDown,
        Income, Build, Phase, Projectile, Spell, End
    }

    public struct SimEvent
    {
        public float t;
        public SimEventKind kind;
        public string msg;
    }

    public class BattleSim : MonoBehaviour
    {
        // ---- 配置 ----
        public BalanceDef balance;
        public bool verbose;

        // ---- 运行时 ----
        public float now;
        public float dt = 0.1f;
        public List<Unit> units = new();
        public List<Building> buildings = new();
        public List<Player> players = new();
        public List<Projectile> projectiles = new();
        public List<SimEvent> events = new();
        public Side? winner;
        public bool ended;

        private bool _hasLeftCastleEver, _hasRightCastleEver;
        private int _phaseIdx;

        // ---- 模板查找回调 (DI) ----
        public System.Func<string, UnitTemplate>     unitLookup;
        public System.Func<string, BuildingTemplate> buildingLookup;
        public System.Func<string, RaceDef>          raceLookup;
        public System.Func<string, SpellTemplate>    spellLookup;

        // ---- 阶段表 ----
        private static readonly (float t, float castleArmor, float decayPerSec, string label)[] SIEGE_PHASES =
        {
            (0f,   5f, 0f,  "opening"),
            (120f, 3f, 0f,  "siege-1"),
            (180f, 1f, 5f,  "siege-2"),
            (240f, 0f, 15f, "sudden-death"),
        };

        // ---- 主循环 ----
        void Start()
        {
            if (balance != null) dt = 1f / Mathf.Max(1f, balance.tickRate);
            Time.fixedDeltaTime = dt;
        }

        void FixedUpdate()
        {
            if (ended) return;
            if (balance != null && now >= balance.rules.maxBattleSec)
            {
                Log(new SimEvent { t = now, kind = SimEventKind.End, msg = $"timeout at {now:F1}s (draw)" });
                ended = true;
                return;
            }
            Tick();
        }

        public void Tick()
        {
            now += dt;
            // 0a. 阶段推进 (TS BattleSim._tickEscalation)
            TickEscalation();
            // 0b. 经济结算 + 策略 (TS BattleSim._tickPlayers) — 联机版可去策略仅留收入
            TickPlayers();
            // 1. 建筑出兵 (TS BattleSim.tick 第 1 段)
            TickBuildingSpawn();
            // 2. 单位 AI + 法术 (TS BattleSim.tick 第 2 段 / _unitStep / _tickUnitSpellAndMana)
            for (int i = 0; i < units.Count; i++)
            {
                var u = units[i];
                if (!u.alive) continue;
                TickUnitSpellAndMana(u);
                UnitStep(u);
            }
            // 3. 建筑自卫 (TS BattleSim._buildingAttackStep)
            TickBuildingAttack();
            // 3.5 投射物 (TS BattleSim._tickProjectiles)
            TickProjectiles();
            // 4. 清尸体
            float dissipate = balance.rules.deathDissipateSec;
            for (int i = units.Count - 1; i >= 0; i--)
            {
                var uu = units[i];
                if (!uu.alive && (now - uu.deadAt) >= dissipate)
                {
                    if (uu.gameObject != null) GameObject.Destroy(uu.gameObject);
                    units.RemoveAt(i);
                }
            }
            // 5. 判胜
            CheckVictory();
        }

        // ---- 移植自 engine/src/BattleSim.ts ----

        private int EffectiveBaseIncome(float t) => balance.baseIncome + (int)Mathf.Floor(t / 60f) * 10;

        protected virtual void TickEscalation()
        {
            int target = 0;
            for (int i = 0; i < SIEGE_PHASES.Length; i++)
                if (now >= SIEGE_PHASES[i].t) target = i;
            if (target != _phaseIdx)
            {
                var phase = SIEGE_PHASES[target];
                foreach (var b in buildings)
                    if (b.alive && b.tpl.kind == "castle") b.armor = phase.castleArmor;
                Log(new SimEvent { t = now, kind = SimEventKind.Phase,
                    msg = $"Phase {phase.label}: castle armor -> {phase.castleArmor}" +
                          (phase.decayPerSec > 0 ? $", decay {phase.decayPerSec} HP/s" : "") });
                _phaseIdx = target;
            }
            float decay = SIEGE_PHASES[_phaseIdx].decayPerSec;
            if (decay > 0f)
            {
                float loss = decay * dt;
                foreach (var b in buildings)
                {
                    if (!b.alive || b.tpl.kind != "castle") continue;
                    b.hp -= loss;
                    if (b.hp <= 0f)
                    {
                        b.hp = 0f; b.alive = false;
                        Log(new SimEvent { t = now, kind = SimEventKind.CastleDown,
                            msg = $"{SideTag(b.side)} {b.tpl.nameCn} collapsed (siege decay)" });
                    }
                }
            }
        }

        protected virtual void TickPlayers()
        {
            foreach (var p in players)
            {
                while (now >= p.nextIncomeAt)
                {
                    int n = p.IncomePerInterval(EffectiveBaseIncome(now));
                    p.Earn(n);
                    p.nextIncomeAt += balance.incomeIntervalSec;
                    Log(new SimEvent { t = now, kind = SimEventKind.Income,
                        msg = $"{p.name} +{n} gold (total {p.gold}, income {n}/{balance.incomeIntervalSec}s)" });
                }
            }
            foreach (var p in players)
            {
                if (p.strategy == null) continue;
                var slots = FreeSlots(p);
                if (slots.Count == 0) continue;
                var capturedP = p;
                var ctx = new StrategyContext
                {
                    now = now, gold = p.gold,
                    income = p.IncomePerInterval(EffectiveBaseIncome(now)),
                    availableSlots = slots.Count,
                    ownedBuildings = p.ownedBuildings,
                    canAfford = bid => { var t = buildingLookup?.Invoke(bid); return t != null && capturedP.gold >= t.cost; },
                    ownedCountOf = bid => { int c = 0; foreach (var b in capturedP.ownedBuildings) if (b.alive && b.tpl.id == bid) c++; return c; },
                };
                string want = p.strategy.Decide(ctx);
                if (string.IsNullOrEmpty(want)) continue;
                var tpl = buildingLookup?.Invoke(want);
                if (tpl == null) continue;
                if (!p.Spend(tpl.cost)) continue;
                var slot = slots[0];
                var b = PlaceBuilding(tpl, p.side, slot);
                p.ownedBuildings.Add(b);
                Log(new SimEvent { t = now, kind = SimEventKind.Build,
                    msg = $"{p.name} builds {tpl.nameCn} @({slot.x:F0},{slot.y:F0}) -{tpl.cost} gold ({p.gold} left)" });
            }
        }
        protected virtual void TickBuildingSpawn()
        {
            for (int i = 0; i < buildings.Count; i++)
            {
                var b = buildings[i];
                if (!b.alive) continue;
                if (!b.IsReady(now)) continue;
                if (string.IsNullOrEmpty(b.tpl.spawns) || b.tpl.spawnIntervalSec <= 0f) continue;
                if (now < b.nextSpawnAt) continue;
                var tpl = unitLookup?.Invoke(b.tpl.spawns);
                if (tpl == null) { b.nextSpawnAt += b.tpl.spawnIntervalSec; continue; }
                float offset = 60f * (b.side == Side.Left ? 1f : -1f);
                var u = PlaceUnit(tpl, b.side, new Vector2(b.Pos.x, b.Pos.y + offset));
                foreach (var p in players) if (p.side == b.side) { p.stats.unitsSpawned++; break; }
                Log(new SimEvent { t = now, kind = SimEventKind.Spawn,
                    msg = $"{SideTag(b.side)} {tpl.nameCn} #{u.id}" });
                b.nextSpawnAt = now + b.tpl.spawnIntervalSec;
            }
        }

        protected virtual void TickBuildingAttack()
        {
            foreach (var b in buildings)
            {
                if (!b.alive || !b.IsReady(now)) continue;
                if (b.tpl.kind == "castle")
                    BuildingAttackStep(b, balance.castle.attackDamage,
                        EnumNames.ParseDamageType(balance.castle.attackType),
                        balance.castle.attackRange, balance.castle.attackSpeed);
                else if (b.tpl.kind == "tower")
                    BuildingAttackStep(b, balance.tower.attackDamage,
                        EnumNames.ParseDamageType(balance.tower.attackType),
                        balance.tower.attackRange, balance.tower.attackSpeed);
            }
        }

        private void BuildingAttackStep(Building b, float dmg, DamageType atk, float range, float speed)
        {
            if (now < b.nextAttackReadyAt) return;
            Unit closest = null; float cd = float.PositiveInfinity;
            foreach (var e in units)
            {
                if (!e.alive || e.side == b.side) continue;
                float d = Vector2.Distance(b.Pos, e.Pos);
                if (d <= range && d < cd) { cd = d; closest = e; }
            }
            if (closest == null) return;
            float actual = closest.TakeDamage(dmg, atk);
            Log(new SimEvent { t = now, kind = SimEventKind.Attack,
                msg = $"{SideTag(b.side)} {b.tpl.nameCn} -> {closest.tpl.nameCn}#{closest.id} for {actual:F1}" });
            if (!closest.alive)
            {
                closest.deadAt = now;
                Log(new SimEvent { t = now, kind = SimEventKind.Death,
                    msg = $"{SideTag(closest.side)} {closest.tpl.nameCn}#{closest.id} died (by {b.tpl.nameCn})" });
            }
            b.nextAttackReadyAt = now + speed;
        }

        protected virtual void TickProjectiles()
        {
            if (projectiles.Count == 0) return;
            for (int i = 0; i < projectiles.Count; i++)
            {
                var p = projectiles[i];
                if (!p.alive) continue;
                bool targetAlive = p.target is Unit tu ? tu.alive : (p.target is Building tb && tb.alive);
                if (!targetAlive) { p.alive = false; continue; }
                if (!p.Step(dt)) continue;
                p.alive = false;
                p.hitAt = now;
                ApplyProjectileHit(p);
            }
            projectiles.RemoveAll(x => !x.alive);
        }

        private void ApplyProjectileHit(Projectile p)
        {
            if (p.aoeRadius > 0f)
            {
                foreach (var e in units)
                {
                    if (!e.alive || e.side == p.side) continue;
                    if (Vector2.Distance(p.Pos, e.Pos) <= p.aoeRadius) ApplyHitTo(p, e);
                }
                foreach (var b in buildings)
                {
                    if (!b.alive || b.side == p.side) continue;
                    if (Vector2.Distance(p.Pos, b.Pos) <= p.aoeRadius) ApplyHitTo(p, b);
                }
            }
            else
            {
                if (p.target is Unit u) ApplyHitTo(p, u);
                else if (p.target is Building b) ApplyHitTo(p, b);
            }
        }

        private void ApplyHitTo(Projectile p, Unit t)
        {
            if (!t.alive) return;
            float actual = t.TakeDamage(p.damage, p.damageType);
            Log(new SimEvent { t = now, kind = SimEventKind.Attack,
                msg = $"{SideTag(p.side)} {p.visualKind} -> {SideTag(t.side)} {t.tpl.nameCn}#{t.id} for {actual:F1}" });
            if (!t.alive)
            {
                t.deadAt = now;
                Log(new SimEvent { t = now, kind = SimEventKind.Death,
                    msg = $"{SideTag(t.side)} {t.tpl.nameCn}#{t.id} died" });
            }
        }

        private void ApplyHitTo(Projectile p, Building t)
        {
            if (!t.alive) return;
            float actual = t.TakeDamage(p.damage, p.damageType);
            Log(new SimEvent { t = now, kind = SimEventKind.Attack,
                msg = $"{SideTag(p.side)} {p.visualKind} -> {SideTag(t.side)} {t.tpl.nameCn}#{t.id} for {actual:F1}" });
            if (!t.alive)
            {
                Log(new SimEvent { t = now, kind = t.tpl.kind == "castle" ? SimEventKind.CastleDown : SimEventKind.BuildingDown,
                    msg = $"{SideTag(t.side)} {t.tpl.nameCn}#{t.id} died" });
            }
        }

        protected virtual void CheckVictory()
        {
            if (!_hasLeftCastleEver || !_hasRightCastleEver) return;
            Building lc = null, rc = null;
            foreach (var b in buildings)
                if (b.alive && b.tpl.kind == "castle")
                    if (b.side == Side.Left) lc = b; else rc = b;
            if (lc == null && rc != null) { winner = Side.Right; ended = true; Log(new SimEvent{t=now,kind=SimEventKind.End,msg="Right wins!"}); }
            else if (rc == null && lc != null) { winner = Side.Left;  ended = true; Log(new SimEvent{t=now,kind=SimEventKind.End,msg="Left wins!"}); }
            else if (lc == null && rc == null) { winner = null;       ended = true; Log(new SimEvent{t=now,kind=SimEventKind.End,msg="Both castles down (draw)"}); }
        }

        // ---- 公共 API (与 TS 同名) ----

        public void AddPlayer(Player p)
        {
            players.Add(p);
            var r = raceLookup?.Invoke(p.race);
            string castleId = r != null ? r.castleAsset : (p.race + "_castle");
            var tpl = buildingLookup?.Invoke(castleId);
            if (tpl == null) { Debug.LogError($"No castle template for race {p.race} (id={castleId})"); return; }
            float laneY = balance.laneLength * 0.5f;
            float y = p.side == Side.Left ? -laneY : laneY;
            var b = PlaceBuilding(tpl, p.side, new Vector2(0f, y));
            p.ownedBuildings.Add(b);
        }

        public Building PlaceBuilding(BuildingTemplate tpl, Side side, Vector2 pos)
        {
            var go = new GameObject($"Building_{tpl.id}");
            var b = go.AddComponent<Building>();
            b.Init(tpl, side, pos, now);
            buildings.Add(b);
            if (tpl.kind == "castle")
            {
                if (side == Side.Left) _hasLeftCastleEver = true;
                else _hasRightCastleEver = true;
            }
            return b;
        }

        public Unit PlaceUnit(UnitTemplate tpl, Side side, Vector2 pos)
        {
            var go = new GameObject($"Unit_{tpl.id}");
            var u = go.AddComponent<Unit>();
            u.Init(tpl, side, pos);
            units.Add(u);
            return u;
        }

        public Building Castle(Side side)
        {
            foreach (var b in buildings) if (b.side == side && b.tpl.kind == "castle" && b.alive) return b;
            return null;
        }

        // ---- 单位 AI ----

        protected virtual void TickUnitSpellAndMana(Unit u)
        {
            UnitMods.Prune(u, now);
            if (u.tpl.manaMax > 0f && u.tpl.manaRegen > 0f)
                u.mana = Mathf.Min(u.tpl.manaMax, u.mana + u.tpl.manaRegen * dt);
            if (u.tpl.manaMax <= 0f || spellLookup == null) return;

            if (u.pendingSpell != null)
            {
                if (now >= u.pendingSpell.castAt)
                {
                    var ps = u.pendingSpell;
                    if (ps.target != null && ps.target.alive)
                    {
                        string desc = SpellEngine.ApplyEffect(u, ps.sp, ps.target, now, units);
                        Log(new SimEvent { t = now, kind = SimEventKind.Spell,
                            msg = $"{SideTag(u.side)} {u.tpl.nameCn}#{u.id} casts {ps.sp.nameCn}: {desc}" });
                    }
                    u.pendingSpell = null;
                }
                return;
            }

            var pick = SpellEngine.AutoCast(u, now, spellLookup, units);
            if (!pick.HasValue) return;
            var sp = pick.Value.spell;
            var tgt = pick.Value.target;
            u.mana -= sp.manaCost;
            u.nextSpellReadyAt = now + Mathf.Max(1.0f, sp.castPoint + sp.cooldownSec);
            u.pendingSpell = new PendingSpell { sp = sp, target = tgt, castAt = now + sp.castPoint };
        }

        protected virtual void UnitStep(Unit u)
        {
            if (u.swingAt.HasValue && u.swingTarget != null)
            {
                if (now >= u.swingAt.Value)
                {
                    bool ranged = Projectile.IsRangedAttack(u.tpl.attack.range);
                    bool tAlive; Vector2 tPos; string tName; int tId; Side tSide;
                    if (u.swingTarget is Unit tu)
                    { tAlive = tu.alive; tPos = tu.Pos; tName = tu.tpl.nameCn; tId = tu.id; tSide = tu.side; }
                    else
                    { var tb = (Building)u.swingTarget; tAlive = tb.alive; tPos = tb.Pos; tName = tb.tpl.nameCn; tId = tb.id; tSide = tb.side; }

                    if (tAlive && (ranged || Vector2.Distance(u.Pos, tPos) <= u.tpl.attack.range + 30f))
                    {
                        var atk = EnumNames.ParseDamageType(u.tpl.attack.damageType);
                        float dmg = UnitMods.Damage(u, now);
                        if (ranged)
                        {
                            var meta = Projectile.Infer(u.tpl.role, atk);
                            var pgo = new GameObject($"Proj_{u.tpl.id}");
                            var proj = pgo.AddComponent<Projectile>();
                            proj.Init(u.side, u.Pos, u.swingTarget, dmg, atk, meta.speed, u.tpl.attack.aoeRadius, meta.visual);
                            projectiles.Add(proj);
                            Log(new SimEvent { t = now, kind = SimEventKind.Projectile,
                                msg = $"{SideTag(u.side)} {u.tpl.nameCn}#{u.id} fires {meta.visual} -> {SideTag(tSide)} {tName}#{tId}" });
                        }
                        else
                        {
                            float actual;
                            if (u.swingTarget is Unit x) actual = x.TakeDamage(dmg, atk);
                            else actual = ((Building)u.swingTarget).TakeDamage(dmg, atk);
                            Log(new SimEvent { t = now, kind = SimEventKind.Attack,
                                msg = $"{SideTag(u.side)} {u.tpl.nameCn}#{u.id} -> {SideTag(tSide)} {tName}#{tId} for {actual:F1}" });
                            if (u.swingTarget is Unit y && !y.alive)
                            {
                                y.deadAt = now;
                                Log(new SimEvent { t = now, kind = SimEventKind.Death,
                                    msg = $"{SideTag(y.side)} {y.tpl.nameCn}#{y.id} died" });
                            }
                            else if (u.swingTarget is Building bb && !bb.alive)
                            {
                                Log(new SimEvent { t = now, kind = bb.tpl.kind == "castle" ? SimEventKind.CastleDown : SimEventKind.BuildingDown,
                                    msg = $"{SideTag(bb.side)} {bb.tpl.nameCn}#{bb.id} died" });
                            }
                        }
                    }
                    u.swingAt = null;
                    u.swingTarget = null;
                }
                return;
            }

            var target = FindTarget(u);
            float moveSpeed = UnitMods.MoveSpeed(u, now);
            if (target != null)
            {
                Vector2 tp; bool alive;
                if (target is Unit tU) { tp = tU.Pos; alive = tU.alive; }
                else { var tB = (Building)target; tp = tB.Pos; alive = tB.alive; }
                if (!alive) return;
                float dist = Vector2.Distance(u.Pos, tp);
                if (dist <= u.tpl.attack.range + 1f)
                {
                    if (now >= u.nextAttackReadyAt)
                    {
                        u.swingAt = now + u.tpl.attack.attackPoint;
                        u.swingTarget = target;
                        u.nextAttackReadyAt = now + UnitMods.AttackInterval(u, now);
                    }
                    return;
                }
                Vector2 diff = tp - u.Pos;
                float d = diff.magnitude;
                if (d > 0.0001f) u.transform.position = u.Pos + diff * (moveSpeed * dt / d);
                return;
            }

            float dy = u.ForwardSign() * moveSpeed * dt;
            u.transform.position = new Vector2(u.Pos.x, u.Pos.y + dy);
        }

        private UnityEngine.Object FindTarget(Unit u)
        {
            UnityEngine.Object best = null;
            float bestD = float.PositiveInfinity;
            foreach (var e in units)
            {
                if (!e.alive || e.side == u.side) continue;
                float d = Vector2.Distance(u.Pos, e.Pos);
                if (d < bestD) { bestD = d; best = e; }
            }
            foreach (var b in buildings)
            {
                if (!b.alive || b.side == u.side) continue;
                float d = Vector2.Distance(u.Pos, b.Pos);
                if (d < bestD) { bestD = d; best = b; }
            }
            return best;
        }

        // ---- 槽位 + 手动建筑 ----

        public List<Vector2> SlotPositions(Side side)
        {
            float laneY = balance.laneLength * 0.5f;
            int sign = side == Side.Left ? -1 : 1;
            var slots = new List<Vector2>();
            float[] cols = { -260f, 0f, 260f };
            float rowBaseY = laneY - 300f;
            for (int r = 0; r < 4; r++)
                foreach (var cx in cols)
                    slots.Add(new Vector2(cx, sign * (rowBaseY - r * 280f)));
            return slots;
        }

        public bool SlotIsFree(Side side, int slotIdx)
        {
            var all = SlotPositions(side);
            if (slotIdx < 0 || slotIdx >= all.Count) return false;
            var slot = all[slotIdx];
            string key = $"{slot.x:F0},{slot.y:F0}";
            foreach (var b in buildings)
                if (b.alive && b.side == side && $"{b.Pos.x:F0},{b.Pos.y:F0}" == key) return false;
            return true;
        }

        private List<Vector2> FreeSlots(Player p)
        {
            var all = SlotPositions(p.side);
            var used = new HashSet<string>();
            foreach (var b in p.ownedBuildings) if (b.alive) used.Add($"{b.Pos.x:F0},{b.Pos.y:F0}");
            var free = new List<Vector2>();
            foreach (var s in all) if (!used.Contains($"{s.x:F0},{s.y:F0}")) free.Add(s);
            return free;
        }

        public (bool ok, string reason) ManualBuild(Side side, string buildingId, int slotIdx)
        {
            Player p = null;
            foreach (var pp in players) if (pp.side == side) { p = pp; break; }
            if (p == null) return (false, "no such player");
            var tpl = buildingLookup?.Invoke(buildingId);
            if (tpl == null) return (false, $"unknown building {buildingId}");
            if (tpl.race != p.race) return (false, $"race mismatch ({tpl.race} vs {p.race})");
            var all = SlotPositions(side);
            if (slotIdx < 0 || slotIdx >= all.Count) return (false, "slot index out of range");
            if (!SlotIsFree(side, slotIdx)) return (false, "slot occupied");
            if (!p.Spend(tpl.cost)) return (false, $"need {tpl.cost} gold (have {p.gold})");
            var b = PlaceBuilding(tpl, side, all[slotIdx]);
            p.ownedBuildings.Add(b);
            Log(new SimEvent { t = now, kind = SimEventKind.Build,
                msg = $"{p.name} (manual) builds {tpl.nameCn} @slot{slotIdx} -{tpl.cost} gold ({p.gold} left)" });
            return (true, null);
        }

        private static string SideTag(Side s) => s == Side.Left ? "[L]" : "[R]";

        public void Log(SimEvent ev)
        {
            events.Add(ev);
            if (verbose) Debug.Log($"[t={ev.t:F2}s] {ev.kind,-7} {ev.msg}");
        }
    }
}
