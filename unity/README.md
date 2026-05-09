# mg01 Unity（WebGL Build）

War3《Castle Fight》Q 版 Unity 端。同 sim 与 `engine/src/*.ts` 1:1。

## 出 H5 包，挑一种

### A. 完全不装 Unity，CI 代劳（**最省事**）
按 [`.github/CI_SETUP.md`](../.github/CI_SETUP.md) 一次性配 3 个 Secret，之后 push 自动出包到 GitHub Actions Artifacts，main 分支自动发布到 GitHub Pages。

### B. 本地 Unity 命令行

```bash
# 0. 装 Unity Hub + 2022.3.40f1 + WebGL Build Support 模块（首次需要）
# 1. 在仓库根执行：
"<Unity 安装路径>/Unity" -batchmode -nographics \
  -projectPath ./unity \
  -executeMethod Mg01.Editor.BuildScript.BuildWebGL \
  -quit -logFile -

# 2. 包出现在 unity/Builds/WebGL/，扔任意静态 host 即可（GitHub Pages / Vercel / OSS / 微信公众号 H5）
```

或在 Editor 里：菜单 `mg01 → Build WebGL`。

## 项目结构

```
unity/
├── Assets/
│   ├── Mg01/
│   │   ├── Core/        ← TS engine/src/{Enums,DamageCalc,DamageMatrix,Vec2}.ts
│   │   ├── Sim/         ← TS engine/src/{BattleSim,Unit,Building,Player,Strategy,SpellEngine}.ts
│   │   ├── Templates/   ← DTOs (matches data/*.json)
│   │   ├── Loaders/     ← JsonLoader (Resources + 项目根 ../data 双路径)
│   │   ├── Runtime/     ← Unity 表现层（GameRoot 自举，无需手动拖关系）
│   │   │   ├── Boot/    ← GameRoot, StrategyFactory
│   │   │   ├── View/    ← BoardRenderer, ProceduralSprite (灰盒)
│   │   │   ├── UI/      ← HudController (TMP)
│   │   │   ├── Input/   ← SlotInput (鼠标/触屏点击 → ManualBuild)
│   │   │   └── Audio/   ← AudioBridge (Resources/sfx/*)
│   │   └── Editor/      ← BuildScript (一键 WebGL build + Setup Scene)
│   └── Resources/
│       ├── data/        ← 11 个 JSON（balance/units_*/buildings/spells/races/damage_matrix）
│       └── sfx/         ← 11 个 Kenney CC0 音效（与 web/static/sfx/kenney 同源）
├── Packages/manifest.json
└── ProjectSettings/     ← 主要：ProjectVersion(2022.3.40f1) + WebGL 设置
```

## 灰盒美术

为了避免拖 PNG/SVG 资源管线，单位/建筑用 `ProceduralSprite.Solid()` 运行时生成的纯色矩形：种族色取自 `races.json`，右侧偏暗 25% 区分阵营。后续替换成真实 sprite 时只动 `BoardRenderer.MakeBox()`。

## 与 web 端的关系

- **数据完全共享**：`data/*.json` 直接拷贝到 `Resources/data/`
- **音效完全共享**：`web/static/sfx/kenney/*` 直接拷贝到 `Resources/sfx/`
- **sim 完全等价**：1:1 移植，相同 build queue 应产生相同事件序列

## 已知限制（C-1）

- 单机 AI vs AI（无联机），录像功能尚未移植
- 单玩家手玩仅支持 Left；右侧固定 AI
- 灰盒美术；无 sprite/动画
- 简易 SlotInput：tap 槽位 → 自动出当前 race 最便宜兵营。"开建造面板" 留待 C-2
