// 玩家：拥有金币 / 收入 / 已建建筑 / 策略回调
// 一个 BattleSim 持有两个 Player (Left/Right)

import type { Side } from "./Enums.ts";
import type { Building } from "./Building.ts";
import type { PlayerStrategy } from "./Strategy.ts";

export class Player {
  side: Side;
  race: string;
  name: string;

  gold: number;
  /** 下一次结算收入的绝对时间 (秒) */
  nextIncomeAt: number;
  ownedBuildings: Building[] = [];
  strategy: PlayerStrategy | null = null;

  /** 统计：总收入 / 总花费 / 造兵数 */
  stats = { totalIncome: 0, totalSpent: 0, unitsSpawned: 0 };

  constructor(side: Side, race: string, name: string, startGold: number, firstIncomeAt: number) {
    this.side = side;
    this.race = race;
    this.name = name;
    this.gold = startGold;
    this.nextIncomeAt = firstIncomeAt;
  }

  /** 当前每个收入周期的总收入 */
  incomePerInterval(baseIncome: number): number {
    let sum = baseIncome;
    for (const b of this.ownedBuildings) {
      if (!b.alive) continue;
      sum += b.tpl.incomeBonusPer10s ?? 0;
    }
    return sum;
  }

  /** 消费金币；不足返回 false */
  spend(cost: number): boolean {
    if (this.gold < cost) return false;
    this.gold -= cost;
    this.stats.totalSpent += cost;
    return true;
  }

  earn(n: number) {
    this.gold += n;
    this.stats.totalIncome += n;
  }
}
