// 1v1 单兵对决：把左边一个兵和右边一个兵面对面放 200 距离, 看谁先倒下
import { BattleSim } from "../src/BattleSim.ts";
import { Vec2 } from "../src/Vec2.ts";
import { Side } from "../src/Enums.ts";
import { balance, unit, units } from "../src/DataLoader.ts";

function duel(leftId: string, rightId: string): void {
  const sim = new BattleSim({ balance, verbose: false });
  sim.setUnitLookup(id => units.get(id));
  const L = sim.placeUnit(unit(leftId), Side.Left, new Vec2(0, -100));
  const R = sim.placeUnit(unit(rightId), Side.Right, new Vec2(0, 100));
  const start = Date.now();
  while (!sim.ended && sim.now < 60) {
    sim.tick();
    if (!L.alive || !R.alive) break;
  }
  const dur = sim.now.toFixed(2);
  const winner = L.alive && !R.alive ? `[L] ${L.tpl.nameCn}` : !L.alive && R.alive ? `[R] ${R.tpl.nameCn}` : "draw/timeout";
  const lHp = L.alive ? L.hp.toFixed(0) : "0";
  const rHp = R.alive ? R.hp.toFixed(0) : "0";
  console.log(`${leftId.padEnd(18)} vs ${rightId.padEnd(18)}  winner=${winner.padEnd(20)} time=${dur}s  (L:${lHp}  R:${rHp})`);
  console.log(`  (wall time: ${Date.now() - start}ms)`);
}

duel("human_footman", "orc_grunt");
duel("human_rifleman", "human_knight");
duel("ud_ghoul", "ne_archer");
duel("human_knight", "orc_tauren");
duel("human_priest", "ud_ghoul");
duel("human_archmage", "orc_blademaster");
duel("human_gryphon", "ud_gargoyle");
duel("ne_chimera", "human_mortar");
