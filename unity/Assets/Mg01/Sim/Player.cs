// 与 engine/src/Player.ts 一一对应

using System.Collections.Generic;
using Mg01.Core;
using Mg01.Templates;

namespace Mg01.Sim
{
    public class Player
    {
        public Side side;
        public string race;
        public string name;

        public int gold;
        public float nextIncomeAt;
        public List<Building> ownedBuildings = new();
        public PlayerStrategy strategy;

        public PlayerStats stats = new();

        public Player(Side s, string race, string name, int startGold, float firstIncomeAt)
        {
            this.side = s;
            this.race = race;
            this.name = name;
            this.gold = startGold;
            this.nextIncomeAt = firstIncomeAt;
        }

        public int IncomePerInterval(int baseIncome)
        {
            int sum = baseIncome;
            foreach (var b in ownedBuildings)
                if (b.alive) sum += b.tpl.incomeBonusPer10s;
            return sum;
        }

        public bool Spend(int cost)
        {
            if (gold < cost) return false;
            gold -= cost;
            stats.totalSpent += cost;
            return true;
        }

        public void Earn(int n)
        {
            gold += n;
            stats.totalIncome += n;
        }
    }

    public class PlayerStats { public int totalIncome, totalSpent, unitsSpawned; }

    /// <summary>策略接口；具体实现 (buildOrder / mixedComposition) 待移植自 engine/src/Strategy.ts</summary>
    public interface PlayerStrategy
    {
        string Decide(StrategyContext ctx);
    }

    public struct StrategyContext
    {
        public float now;
        public int gold, income;
        public int availableSlots;
        public IReadOnlyList<Building> ownedBuildings;
        public System.Func<string, bool> canAfford;
        public System.Func<string, int> ownedCountOf;
    }
}
