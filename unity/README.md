# mg01 Unity 移植脚手架

War3《Castle Fight》Q 版手游的 Unity 项目骨架。
TS `engine/src/*` 是权威实现；Unity 侧逐文件对应翻译，便于双端比对。

## 当前进度

| 模块 | TS 来源 | Unity 路径 | 状态 |
|---|---|---|---|
| Core (Enums) | `engine/src/Enums.ts` | `Assets/Mg01/Core/Enums.cs` | ✅ |
| DamageCalc | `engine/src/DamageCalc.ts` | `Assets/Mg01/Core/DamageCalc.cs` | ✅ |
| DamageMatrix | `data/damage_matrix.json` | `Assets/Mg01/Core/DamageMatrix.cs` | ✅ 硬编码 + Override() 支持 JSON 覆盖 |
| Vec2 | `engine/src/Vec2.ts` | `Assets/Mg01/Core/Vec2Ext.cs` | ✅ UnityEngine.Vector2 + 扩展 |
| Templates DTO | `engine/src/Templates.ts` | `Assets/Mg01/Templates/Templates.cs` | ✅ [Serializable] DTO |
| JSON Loader | `engine/src/DataLoader.ts` | `Assets/Mg01/Loaders/JsonLoader.cs` | ✅ JsonUtility 版 (matrix 需 Newtonsoft) |
| Unit / Building / Projectile | `engine/src/{Unit,Building,Projectile}.ts` | `Assets/Mg01/Sim/*.cs` | ✅ 完整移植 (MonoBehaviour) |
| Buff / UnitMods | `engine/src/SpellEngine.ts` | `Assets/Mg01/Sim/Buff.cs` | ✅ |
| Player | `engine/src/Player.ts` | `Assets/Mg01/Sim/Player.cs` | ✅ |
| BattleSim 主循环 | `engine/src/BattleSim.ts` | `Assets/Mg01/Sim/BattleSim.cs` | ✅ 完整 Tick*（阶段 / 经济 / 出兵 / 自卫 / 投射物 / 法术 / AI） |
| Strategy | `engine/src/Strategy.ts` | `Assets/Mg01/Sim/Strategy.cs` | ✅ BuildOrder + MixedComposition + DoNothing |
| SpellEngine | `engine/src/SpellEngine.ts` | `Assets/Mg01/Sim/SpellEngine.cs` | ✅ 4 MVP 法术 (heal / bloodlust / faerieFire / frostNova) |

## 用法

1. Unity 2022 LTS 起，`File > Open Project` 选 `unity/` 目录
2. `Assets/Mg01/Core/Mg01.Core.asmdef` 会自动生成程序集
3. C# 端命名空间统一 `Mg01.Core`

## 翻译约定

- TS 类 `Vec2` → 直接用 `UnityEngine.Vector2`（成员函数对应：`add`→`+`, `mul`→`*`, `len`→`.magnitude`, `lenSq`→`.sqrMagnitude`, `normalize`→`.normalized`）
- TS `Side.Left = 0` → C# `enum Side { Left = 0 }`
- TS lowercase 字符串枚举值（"normal"/"pierce"/...）→ JSON 互通时用 `EnumNames.ToJson` / `Parse*`
- 时间单位：秒；距离：像素 / War3 距离（1 tile = 128，与 TS 一致）

## 测试

后续 B3 完成后，提供 `EditMode` 下的 NUnit 测试：
- 跑 `damage-test.ts` 同样的 12 条断言（C# 复用 `data/damage_matrix.json`）
- 跑 `duel.ts` 同 8 组对决，验收双端结果对齐（容差 ±5%）
