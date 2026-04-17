// 引擎入口：列出加载的数据，快速 smoke test
import { balance, races, units, buildings, spells } from "./DataLoader.ts";

console.log("=== mg01 engine ===");
console.log(`tickRate     : ${balance.tickRate} Hz`);
console.log(`laneLength   : ${balance.laneLength}`);
console.log(`castle HP    : ${balance.castle.hp}`);
console.log(`races        : ${races.map(r => r.nameCn).join(", ")}`);
console.log(`units loaded : ${units.size}`);
console.log(`buildings    : ${buildings.size}`);
console.log(`spells       : ${spells.size}`);
console.log(`samples:`);
for (const id of ["human_footman", "orc_grunt", "ud_lich", "ne_keeper"]) {
  const u = units.get(id);
  if (u) console.log(`  ${u.nameCn.padEnd(6)}  HP=${u.hp}  atk=${u.attack.damage} ${u.attack.damageType}  armor=${u.defense.armor} ${u.defense.armorType}`);
}
