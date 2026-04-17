# mg01 Headless Engine

零依赖的 TypeScript 战斗模拟器。用来在命令行自测数值 / 克制 / AI，验证后迁移到 Unity C#。

## 运行

需要 Node.js **≥ 22.6**（使用了原生 `--experimental-strip-types`，无需 tsc / tsx / npm install）。

```bash
# 冒烟：列出加载的数据
node --experimental-strip-types src/Main.ts

# 伤害矩阵单元测试
node --experimental-strip-types scenarios/damage-test.ts

# 1v1 单兵对决
node --experimental-strip-types scenarios/duel.ts

# 全场 AI 对战
node --experimental-strip-types scenarios/match.ts
node --experimental-strip-types scenarios/match.ts -v   # 详细事件流

# 完整经济 + 玩家策略 (AI 出牌 + 每 10s 收入)
node --experimental-strip-types scenarios/economy-match.ts

# 浏览器 UI (移动端 portrait 9:16，SSE 实时渲染)
npm run web          # → http://localhost:8080
```

或：`npm start` / `npm run duel` / `npm test` / `npm run match` / `npm run web`。

## 目录

```
engine/
├── src/
│   ├── Main.ts          # 入口 / 数据冒烟
│   ├── Enums.ts         # Side/DamageType/ArmorType/UnitRole/BuildingKind
│   ├── Vec2.ts          # 2D 向量
│   ├── DamageCalc.ts    # War3 伤害矩阵 + 护甲减免
│   ├── Templates.ts     # 只读数据类型 (Unit/Building/Spell/Race/Balance)
│   ├── DataLoader.ts    # 从 ../data/*.json 加载
│   ├── Unit.ts          # 运行时单位
│   ├── Building.ts      # 运行时建筑
│   └── BattleSim.ts     # 主循环 (tick 10Hz)
├── scenarios/
│   ├── damage-test.ts   # 伤害倍率 + 护甲减免断言
│   ├── duel.ts          # 8 组 1v1 对决
│   └── match.ts         # 3 组全场 AI 对战
├── package.json
└── tsconfig.json
```

## 数据分离

所有数值都在仓库根目录的 `data/*.json`。引擎**不硬编码任何兵种数值**：

| 文件 | 作用 |
|---|---|
| `balance.json`         | 全局常量 (tickRate, 主城/防御塔属性, 规则) |
| `damage_matrix.json`   | War3 6×7 伤害倍率表 |
| `races.json`           | 4 种族元信息 (配色、主题音乐 ID) |
| `units_*.json`         | 28 单位 (每族 7) |
| `buildings.json`       | 主城 / 防御塔 / 兵营 / 特殊建筑 / 传奇建筑 |
| `spells.json`          | 17 技能 |
| `war3_assets.json`     | 资源路径映射 — 换美术只改这一份 |

## 动画关键帧

每个单位的 `animation` 字段已按 Unity `AnimationEvent` 结构预写好：

```jsonc
"animation": {
  "stand":  { "clip": "Stand",  "duration": 1.83, "loop": true },
  "walk":   { "clip": "Walk",   "duration": 0.83, "loop": true },
  "attack": {
    "clip": "Attack",
    "duration": 1.35,
    "events": [
      { "time": 0.40, "name": "DealDamage" },   // ← attackPoint
      { "time": 0.55, "name": "SwingSfx" }
    ]
  },
  "death":  { "clip": "Death",  "duration": 1.85, "events": [ { "time": 1.80, "name": "BeginDecay" } ] }
}
```

headless 引擎**只读 `attackPoint`/`attackBackswing`（秒）做逻辑**；其余字段（clip 名、duration、事件名）留给 Unity：

1. 在 Unity Animator 里建同名 State（`Stand`/`Walk`/`Attack`/`Death`）
2. AnimationEvent 绑定同名函数：`DealDamage()`, `SwingSfx()`, `BeginDecay()`
3. 替换 mesh/clip 时，只要保持相同的事件时间点，战斗逻辑不需动

## 资源替换

首版用 War3 资源**仅供个人测试**。发布前：

1. 编辑 `data/war3_assets.json`，把 `model`/`icon` 指向自制 Q 版资源
2. 或给每条加 `placeholderFree` 指向免费资源（Kenney.nl、Mixamo、Unity Asset Store Lean Poly）
3. `units_*.json` / `buildings.json` **完全不用改**

## Unity 移植对照

| TS (本引擎) | Unity C# |
|---|---|
| `class Vec2`          | `UnityEngine.Vector2` |
| `Side` / `DamageType` / ... | `enum` |
| `UnitTemplate` (interface) | `ScriptableObject` |
| `DataLoader` (fs.readFileSync) | `Resources.Load` / Addressables |
| `BattleSim.tick()`    | `FixedUpdate()` 或 ECS `SystemBase` |
| `Unit` 运行时         | `MonoBehaviour` |
| `DamageCalc` (static) | `static class DamageCalc` |
| `attackPoint`/`attackBackswing` | `AnimationEvent.time` |

核心战斗逻辑（~250 行）几乎逐行对应 C#，无外部依赖。

## 当前已实现 / 未实现

- [x] War3 伤害矩阵 + 护甲减免
- [x] 10Hz 固定 tick
- [x] 单位：寻敌、移动、攻击（带 attackPoint 关键帧）
- [x] 建筑：主城 / 兵营（自动出兵）/ 防御塔（自卫）
- [x] 胜负判定 (castle HP → 0)
- [x] 经济系统：startGold + 每 10s 结算收入 + 建筑 cost/incomeBonus
- [x] 金矿建筑（economy kind，每族 1 个，+5/10s income）
- [x] 玩家 / 策略接口（Player + PlayerStrategy: buildOrder / mixedComposition）
- [x] 自动槽位分配 (3×4 grid per side, 距主城由近到远)
- [ ] 投射物飞行 (当前瞬间命中)
- [ ] 技能施法 (spells.json 已有数据, 逻辑待补)
- [ ] AOE / bounce / dot / 召唤
- [ ] 寻路 / 卡位 (当前直线走)
- [ ] 网络同步 / 回放

下一步优先级建议：**技能施法** → **投射物** → **AOE**。
