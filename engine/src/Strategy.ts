// 玩家策略接口 + 常用实现
// 策略在 BattleSim 每 tick 被调用一次，返回想要建造的 building id
// 无法建造时返回 null (攒钱或等槽位)

import type { Building } from "./Building.ts";

export interface DecisionContext {
  now: number;
  gold: number;
  income: number;
  availableSlots: number;
  ownedBuildings: readonly Building[];
  /** 查建筑造价；找不到 building 或不够钱时返回 false */
  canAfford: (buildingId: string) => boolean;
  /** 已拥有某 building id 的数量 */
  ownedCountOf: (buildingId: string) => number;
}

export interface PlayerStrategy {
  name: string;
  decide(ctx: DecisionContext): string | null;
}

/**
 * 固定出牌顺序：按列表依次建造。loop=true 时建完一轮重新开始 (继续刷同样的兵营)
 */
export function buildOrder(name: string, order: readonly string[], loop: boolean = true): PlayerStrategy {
  let idx = 0;
  return {
    name,
    decide(ctx) {
      if (order.length === 0) return null;
      if (idx >= order.length) {
        if (!loop) return null;
        idx = 0;
      }
      const wanted = order[idx]!;
      if (!ctx.canAfford(wanted)) return null;       // 没钱 → 等
      if (ctx.availableSlots <= 0) return null;      // 没槽 → 等
      idx++;
      return wanted;
    },
  };
}

/**
 * 贪心：维护一个目标配比 (building id → 想要多少个)，每次挑"缺口最大且买得起"的建
 */
export function mixedComposition(name: string, target: Record<string, number>): PlayerStrategy {
  return {
    name,
    decide(ctx) {
      if (ctx.availableSlots <= 0) return null;
      let bestId: string | null = null;
      let bestGap = 0;
      for (const id of Object.keys(target)) {
        const gap = (target[id] ?? 0) - ctx.ownedCountOf(id);
        if (gap > bestGap && ctx.canAfford(id)) {
          bestGap = gap;
          bestId = id;
        }
      }
      return bestId;
    },
  };
}

/** 什么都不造 (用于测试 AI 被推塔) */
export const doNothing: PlayerStrategy = { name: "idle", decide: () => null };
