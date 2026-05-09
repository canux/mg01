# mg01 项目约定（长期记忆）

## 定位
War3《Castle Fight 城堡战争》的 Q 版 + 竖屏 9:16 手游移植。

## 技术栈
- **开发期**：Node.js ≥ 22.6 + TypeScript 原生（`--experimental-strip-types`），headless 无渲染
- **发布期**：Unity 3D（C#），TS 代码逐行对应移植

## 目录
- `data/`     — 纯 JSON 数据（balance / damage_matrix / races / units_* / buildings / spells / war3_assets）
- `engine/`   — TS headless 战斗模拟器，`src/` 核心 + `scenarios/` 测试
- `design.md` — 设计文档

## 美术 / 资源
- **风格**：Q 版 2 头身，竖屏 1080×1920
- **占位**：`web/tools/gen_sprites.ts` 自生成的 SVG（学习用途，非 War3 原始素材）；`res://` 中性前缀不绑定具体来源
- **换美术**：只改 `data/war3_assets.json`（res:// URI）+ `data/sprites.json`（sprite sheet 布局），不动 units/buildings

## 动画关键帧约定
每单位 animation 字段已对齐 Unity `AnimationEvent`：
- `attackPoint`（秒）→ `DealDamage` 事件
- `attackBackswing` → 攻击收招
- `death.events[].time` → `BeginDecay` / `BeginDissipate`
- Unity 侧绑定同名函数即可复用战斗逻辑

## 分支规则
- 开发分支：`claude/list-files-detailed-98Ucv`
- 永远 `-u origin <branch>`，**不要自动开 PR**
- 每个逻辑完整块 commit 一次（避免 SSE stream 空闲超时丢进度）

## 用户偏好
- 输出尽量精简，避免长段落回复
- 写大块 JSON/代码时拆成多次小 Write，防止 stream 超时
- 优先用现有工具（Read/Edit/Grep/Glob），少用 Bash cat/find

## 技术约束
- Node 22 原生 TS strip-only 模式不支持**构造函数参数属性**（`constructor(public x)`），改用显式字段声明
- 所有时间/距离单位：秒 / War3 距离（1 tile = 128）
- 胜负判定需检查"是否曾放过主城"，否则 unit-only 测试会立即 draw
