// 种族 vs 种族全场模拟：两边各放一座主城 + 一个兵营，用 barracks 自动出兵
import { BattleSim } from "../src/BattleSim.ts";
import { Vec2 } from "../src/Vec2.ts";
import { Side } from "../src/Enums.ts";
import { balance, building, units } from "../src/DataLoader.ts";

const verbose = process.argv.includes("-v");

function match(leftSetup: string[], rightSetup: string[], label: string): void {
  const sim = new BattleSim({ balance, verbose });
  sim.setUnitLookup(id => units.get(id));

  const laneY = balance.laneLength / 2;
  // 主城
  sim.placeBuilding(building(leftSetup[0]!),  Side.Left,  new Vec2(0, -laneY));
  sim.placeBuilding(building(rightSetup[0]!), Side.Right, new Vec2(0,  laneY));
  // 兵营 (Left 在 -laneY/2, Right 在 +laneY/2)
  for (let i = 1; i < leftSetup.length; i++) {
    sim.placeBuilding(building(leftSetup[i]!), Side.Left, new Vec2((i - 2) * 120, -laneY + 400));
  }
  for (let i = 1; i < rightSetup.length; i++) {
    sim.placeBuilding(building(rightSetup[i]!), Side.Right, new Vec2((i - 2) * 120, laneY - 400));
  }

  sim.run(300);

  const lCastle = sim.castle(Side.Left);
  const rCastle = sim.castle(Side.Right);
  const winner = sim.winner === Side.Left ? "LEFT" : sim.winner === Side.Right ? "RIGHT" : "DRAW";
  const summary = `winner=${winner}  time=${sim.now.toFixed(1)}s  Lcastle=${lCastle?.hp.toFixed(0) ?? 0}  Rcastle=${rCastle?.hp.toFixed(0) ?? 0}  events=${sim.events.length}`;
  console.log(`[${label}]  ${summary}`);
}

// Human vs Orc — 双方各建 1 个步兵营 + 1 个远程营
match(
  ["human_castle", "human_barracks_footman", "human_barracks_rifleman"],
  ["orc_castle",   "orc_barracks_grunt",     "orc_trollden_headhunter"],
  "Human vs Orc"
);

match(
  ["ud_castle", "ud_crypt_ghoul", "ud_crypt_cryptfiend"],
  ["ne_castle", "ne_archershop_archer", "ne_ancient_huntress"],
  "Undead vs Night Elf"
);

match(
  ["human_castle", "human_barracks_footman", "human_stable_knight"],
  ["ud_castle",    "ud_crypt_ghoul",          "ud_slaughterhouse_abom"],
  "Human heavy vs Undead heavy"
);
