// 完整经济 + 策略对战：两位玩家 + 自动出牌 + 每 10s 结算收入
// 用法: node --experimental-strip-types scenarios/economy-match.ts [-v]

import { BattleSim } from "../src/BattleSim.ts";
import { Player } from "../src/Player.ts";
import { buildOrder, mixedComposition } from "../src/Strategy.ts";
import { Side } from "../src/Enums.ts";
import { balance, units, buildings, races } from "../src/DataLoader.ts";

const verbose = process.argv.includes("-v");

function simulate(label: string, leftRace: string, leftStrat: ReturnType<typeof buildOrder>, rightRace: string, rightStrat: ReturnType<typeof buildOrder>) {
  const sim = new BattleSim({ balance, verbose });
  sim.setUnitLookup(id => units.get(id));
  sim.setBuildingLookup(id => buildings.get(id));
  sim.setRaceLookup(id => races.find(r => r.id === id));

  const lp = new Player(Side.Left,  leftRace,  `L-${leftRace}`,  balance.startGold, balance.incomeIntervalSec);
  const rp = new Player(Side.Right, rightRace, `R-${rightRace}`, balance.startGold, balance.incomeIntervalSec);
  lp.strategy = leftStrat;
  rp.strategy = rightStrat;
  sim.addPlayer(lp);
  sim.addPlayer(rp);

  sim.run(balance.rules.maxBattleSec);

  const winner = sim.winner === Side.Left ? "LEFT" : sim.winner === Side.Right ? "RIGHT" : "DRAW";
  const lHp = sim.castle(Side.Left)?.hp.toFixed(0) ?? "0";
  const rHp = sim.castle(Side.Right)?.hp.toFixed(0) ?? "0";
  console.log(`[${label}]`);
  console.log(`  winner=${winner}  time=${sim.now.toFixed(1)}s  Lcastle=${lHp}  Rcastle=${rHp}`);
  console.log(`  ${lp.name}:  gold=${lp.gold}  income=${lp.incomePerInterval(balance.baseIncome)}/10s  totalIncome=${lp.stats.totalIncome}  totalSpent=${lp.stats.totalSpent}  units=${lp.stats.unitsSpawned}  buildings=${lp.ownedBuildings.filter(b=>b.alive).length}`);
  console.log(`  ${rp.name}:  gold=${rp.gold}  income=${rp.incomePerInterval(balance.baseIncome)}/10s  totalIncome=${rp.stats.totalIncome}  totalSpent=${rp.stats.totalSpent}  units=${rp.stats.unitsSpawned}  buildings=${rp.ownedBuildings.filter(b=>b.alive).length}`);
  console.log();
}

// 预置策略
const humanRush = buildOrder("human-rush", [
  "human_goldmine",
  "human_barracks_footman",
  "human_barracks_footman",
  "human_barracks_rifleman",
  "human_goldmine",
  "human_barracks_footman",
  "human_barracks_rifleman",
  "human_tower",
  "human_barracks_rifleman",
]);

const orcRush = buildOrder("orc-rush", [
  "orc_goldmine",
  "orc_trollden_headhunter",
  "orc_barracks_grunt",
  "orc_goldmine",
  "orc_trollden_headhunter",
  "orc_barracks_grunt",
  "orc_tower",
  "orc_workshop_catapult",
]);

const udRush = buildOrder("undead-rush", [
  "ud_haunted",
  "ud_crypt_ghoul",
  "ud_crypt_ghoul",
  "ud_haunted",
  "ud_crypt_cryptfiend",
  "ud_tower",
  "ud_graveyard_meatwagon",
  "ud_boneyard_gargoyle",
]);

const neRush = buildOrder("nightelf-rush", [
  "ne_entangledmine",
  "ne_archershop_archer",
  "ne_archershop_archer",
  "ne_entangledmine",
  "ne_ancient_huntress",
  "ne_tower",
  "ne_ancientofwind_glaive",
]);

const humanMix = mixedComposition("human-mix", {
  "human_barracks_footman": 2,
  "human_barracks_rifleman": 2,
  "human_stable_knight": 1,
  "human_tower": 2,
});

// ---- 跑 4 组场景 ----
simulate("Human vs Orc (rush)",    "human", humanRush, "orc",      orcRush);
simulate("Undead vs Night Elf",    "undead", udRush,   "nightelf", neRush);
simulate("Human mix vs Orc rush",  "human", humanMix,  "orc",      orcRush);
simulate("Human rush vs Undead",   "human", humanRush, "undead",   udRush);
