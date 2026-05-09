// 与 engine/src/Strategy.ts 一一对应
// BuildOrder + MixedComposition + DoNothing 三个内置策略

using System.Collections.Generic;

namespace Mg01.Sim
{
    /// <summary>固定出牌：按列表依次造；loop=true 时建完一轮重头开始</summary>
    public class BuildOrderStrategy : PlayerStrategy
    {
        public string name;
        private readonly string[] _order;
        private readonly bool _loop;
        private int _idx;

        public BuildOrderStrategy(string name, string[] order, bool loop = true)
        {
            this.name = name;
            this._order = order;
            this._loop = loop;
        }

        public string Decide(StrategyContext ctx)
        {
            if (_order.Length == 0) return null;
            if (_idx >= _order.Length)
            {
                if (!_loop) return null;
                _idx = 0;
            }
            string wanted = _order[_idx];
            if (!ctx.canAfford(wanted)) return null;
            if (ctx.availableSlots <= 0) return null;
            _idx++;
            return wanted;
        }
    }

    /// <summary>贪心：维护目标配比 (id → 想要数量)，每次挑缺口最大且买得起的造</summary>
    public class MixedCompositionStrategy : PlayerStrategy
    {
        public string name;
        private readonly Dictionary<string, int> _target;

        public MixedCompositionStrategy(string name, Dictionary<string, int> target)
        {
            this.name = name;
            this._target = target;
        }

        public string Decide(StrategyContext ctx)
        {
            if (ctx.availableSlots <= 0) return null;
            string bestId = null;
            int bestGap = 0;
            foreach (var kv in _target)
            {
                int gap = kv.Value - ctx.ownedCountOf(kv.Key);
                if (gap > bestGap && ctx.canAfford(kv.Key))
                {
                    bestGap = gap;
                    bestId = kv.Key;
                }
            }
            return bestId;
        }
    }

    /// <summary>什么都不造（用于测试 AI 被推塔）</summary>
    public class DoNothingStrategy : PlayerStrategy
    {
        public string Decide(StrategyContext ctx) => null;
    }
}
