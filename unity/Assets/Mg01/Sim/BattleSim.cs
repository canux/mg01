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
            // 5. 判胜
            CheckVictory();
        }

        // ---- 待移植 (1:1 from engine/src/BattleSim.ts) ----
        protected virtual void TickEscalation()         { /* TODO: SIEGE_PHASES + 主城被动衰减 */ }
        protected virtual void TickPlayers()            { /* TODO: 经济 + strategy.decide */ }
        protected virtual void TickBuildingSpawn()      { /* TODO: 兵营 spawn */ }
        protected virtual void TickBuildingAttack()     { /* TODO: castle/tower 自卫 */ }
        protected virtual void TickProjectiles()        { /* TODO: step + AOE 命中 */ }
        protected virtual void TickUnitSpellAndMana(Unit u) { /* TODO: prune buff + manaRegen + autoCast */ }
        protected virtual void UnitStep(Unit u)         { /* TODO: swing/move/AI (用 UnitMods.MoveSpeed/AttackInterval) */ }
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

        public void Log(SimEvent ev)
        {
            events.Add(ev);
            if (verbose) Debug.Log($"[t={ev.t:F2}s] {ev.kind,-7} {ev.msg}");
        }
    }
}
