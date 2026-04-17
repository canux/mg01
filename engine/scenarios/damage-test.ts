// 伤害矩阵 + 护甲减免单元测试
// 期望：War3 经典值
import { DamageCalc } from "../src/DamageCalc.ts";

type Case = { name: string; raw: number; atk: import("../src/Enums.ts").DamageType; armor: number; armorType: import("../src/Enums.ts").ArmorType; expectMultiplier: number; };

const cases: Case[] = [
  { name: "pierce vs light",    raw: 20, atk: "pierce", armor: 0, armorType: "light",     expectMultiplier: 2.00 },
  { name: "pierce vs fortified",raw: 20, atk: "pierce", armor: 0, armorType: "fortified", expectMultiplier: 0.35 },
  { name: "normal vs medium",   raw: 20, atk: "normal", armor: 0, armorType: "medium",    expectMultiplier: 1.50 },
  { name: "magic vs heavy",     raw: 20, atk: "magic",  armor: 0, armorType: "heavy",     expectMultiplier: 2.00 },
  { name: "siege vs fortified", raw: 20, atk: "siege",  armor: 0, armorType: "fortified", expectMultiplier: 1.50 },
  { name: "chaos vs divine",    raw: 20, atk: "chaos",  armor: 0, armorType: "divine",    expectMultiplier: 1.00 },
];

let pass = 0, fail = 0;
for (const c of cases) {
  const m = DamageCalc.multiplier(c.atk, c.armorType);
  const ok = Math.abs(m - c.expectMultiplier) < 1e-6;
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.name.padEnd(26)} mult=${m}`);
  ok ? pass++ : fail++;
}

// 护甲减免
const armorCases = [
  { armor: 0,  expect: 1.00 },
  { armor: 5,  expect: 1 - 0.3 / 1.3 }, // ≈ 0.7692
  { armor: 10, expect: 1 - 0.6 / 1.6 }, // ≈ 0.625
];
for (const a of armorCases) {
  const r = DamageCalc.armorReduction(a.armor);
  const ok = Math.abs(r - a.expect) < 1e-6;
  console.log(`${ok ? "PASS" : "FAIL"}  armor=${a.armor} reduction=${r.toFixed(4)}`);
  ok ? pass++ : fail++;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
