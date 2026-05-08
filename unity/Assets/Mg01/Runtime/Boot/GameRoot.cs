using System.Collections.Generic;
using UnityEngine;
using Mg01.Core;
using Mg01.Loaders;
using Mg01.Sim;
using Mg01.Templates;

namespace Mg01.Runtime.Boot
{
    /// <summary>
    /// 唯一的入口 GameObject。Awake 内自建 sim + view + ui + audio + input。
    /// 场景里只有一个 Camera + EventSystem + Mg01Root(挂本脚本) 即可。
    /// </summary>
    public class GameRoot : MonoBehaviour
    {
        public BattleSim sim;
        public string leftRace  = "human";
        public string rightRace = "orc";

        Dictionary<string, UnitTemplate>     _units;
        Dictionary<string, BuildingTemplate> _buildings;
        Dictionary<string, SpellTemplate>    _spells;
        List<RaceDef>                        _races;
        BalanceDef                           _balance;

        public IReadOnlyDictionary<string, UnitTemplate>     Units     => _units;
        public IReadOnlyDictionary<string, BuildingTemplate> Buildings => _buildings;
        public IReadOnlyDictionary<string, SpellTemplate>    Spells    => _spells;
        public IReadOnlyList<RaceDef>                        Races     => _races;
        public BalanceDef                                    Balance   => _balance;

        void Awake()
        {
            // 1. 数据
            _balance   = JsonLoader.LoadBalance();
            _units     = JsonLoader.LoadAllUnits();
            _buildings = JsonLoader.LoadAllBuildings();
            _spells    = JsonLoader.LoadAllSpells();
            _races     = JsonLoader.LoadRaces();
            JsonLoader.LoadDamageMatrix();

            // 2. Sim
            var simGo = new GameObject("BattleSim");
            simGo.transform.SetParent(transform, false);
            sim = simGo.AddComponent<BattleSim>();
            sim.balance        = _balance;
            sim.unitLookup     = id => _units.TryGetValue(id, out var u) ? u : null;
            sim.buildingLookup = id => _buildings.TryGetValue(id, out var b) ? b : null;
            sim.spellLookup    = id => _spells.TryGetValue(id, out var s) ? s : null;
            sim.raceLookup     = id => _races.Find(r => r.id == id);

            // 3. 玩家
            var lp = new Player(Side.Left,  leftRace,  $"L-{leftRace}",  _balance.startGold, _balance.incomeIntervalSec);
            var rp = new Player(Side.Right, rightRace, $"R-{rightRace}", _balance.startGold, _balance.incomeIntervalSec);
            lp.strategy = StrategyFactory.For(leftRace);
            rp.strategy = StrategyFactory.For(rightRace);
            sim.AddPlayer(lp);    // AddPlayer 会自动放主城
            sim.AddPlayer(rp);

            // 5. 子系统
            new GameObject("BoardRenderer", typeof(View.BoardRenderer)).transform.SetParent(transform, false);
            new GameObject("AudioBridge",  typeof(Audio.AudioBridge)).transform.SetParent(transform, false);
            UI.HudController.CreateUnder(transform, this);
            Input.SlotInput.CreateUnder(transform, this);
        }
    }
}
