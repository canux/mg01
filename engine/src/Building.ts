// 运行时建筑实例

import { Vec2 } from "./Vec2.ts";
import type { Side } from "./Enums.ts";
import type { BuildingTemplate } from "./Templates.ts";
import { DamageCalc } from "./DamageCalc.ts";

export class Building {
  static _nextId = 1;

  readonly id: number;
  readonly tpl: BuildingTemplate;
  readonly side: Side;
  pos: Vec2;

  hp: number;
  /** 当前护甲；初始化自模板，可被阶段机制动态修改 (e.g. 主城 Siege Phase) */
  armor: number;
  alive = true;

  /** 下一次出兵时间 (绝对秒) */
  nextSpawnAt = 0;
  /** 建筑建造完成时间 */
  readyAt: number;

  constructor(tpl: BuildingTemplate, side: Side, pos: Vec2, createdAt: number) {
    this.id = Building._nextId++;
    this.tpl = tpl;
    this.side = side;
    this.pos = pos;
    this.hp = tpl.hp;
    this.armor = tpl.armor;
    this.readyAt = createdAt + (tpl.buildTimeSec ?? 0);
    this.nextSpawnAt = this.readyAt + (tpl.spawnIntervalSec ?? 0);
  }

  isReady(now: number): boolean { return now >= this.readyAt; }

  takeDamage(raw: number, atkType: import("./Enums.ts").DamageType): number {
    const actual = DamageCalc.calc(raw, atkType, this.armor, this.tpl.armorType);
    this.hp -= actual;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; }
    return actual;
  }
}
