# mg01 Web Viewer

零依赖 Node HTTP + SSE 服务器，驱动 `engine/` 的 `BattleSim`，前端 canvas 实时渲染。

## 启动

```bash
cd engine
npm run web                    # 默认 :8080
PORT=9000 npm run web          # 自定义端口
```

打开浏览器：`http://localhost:8080`。

## 移动端适配

- `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">` 锁死桌面/移动缩放
- 外容器 `max-width: 480px; height: 100dvh` 在桌面呈现为竖屏手机大小
- Canvas 纵向铺满 `laneLength`，横向压缩以填宽（非均匀缩放 ≤ 1.8×）
- 触屏控件大、无 hover 依赖

## 接口

| Path | 说明 |
|---|---|
| `GET /` | `static/index.html` |
| `GET /static/*` | CSS/JS 资源 |
| `GET /races` | 4 个种族的 id/nameCn/color (JSON) |
| `GET /stream` | SSE，每 100ms 推一帧 `snapshot` |
| `POST /new?left=X&right=Y` | 切换种族、重开 |

## 快照字段

```
t, maxT, ended, winner(0|1|null),
laneLength, laneWidth,
players: [{ side, race, name, gold, income, unitsSpawned }],
buildings: [{ id, side, x, y, kind, race, nameCn, hp, hpMax, ready }],
units: [{ id, side, x, y, race, role, nameCn, hp, hpMax }],
events: [{ t, kind, msg }]  // 最近 10 条
```

## 文件

```
web/
├── server.ts         # Node http + SSE，驱动 BattleSim
├── README.md
└── static/
    ├── index.html
    ├── styles.css    # portrait 9:16，移动优先
    ├── renderer.js   # canvas: lane + slots + buildings + units + HP 条
    ├── ui.js         # HUD: 金币/时间/阶段/banner/日志/种族选择
    └── main.js       # SSE 接入 + 渲染循环
```

## 美术资源

目前使用**自生成 Q 版 SVG 占位**（学习用途，不含 War3 原始素材，中性 `res://` 前缀）。

### 生成占位

```bash
node --experimental-strip-types web/tools/gen_sprites.ts
# → web/static/assets/sprites/*.svg  (每 assetKey 一个)
# → data/sprites.json                 (精灵元数据 + 帧布局)
```

### 替换成正式美术

1. 准备 PNG sprite sheet（推荐 4 行 × N 帧，row: stand/walk/attack/death）
2. 放到 `web/static/assets/sprites/<assetKey>.png`（或你自己的路径）
3. 编辑 `data/sprites.json`，修改对应 assetKey 条目：
   ```json
   "human_footman": {
     "path": "/assets/sprites/human_footman.png",
     "frameSize": { "w": 96, "h": 96 },
     "anchor": { "x": 0.5, "y": 0.85 },
     "sheet": {
       "stand":  { "row": 0, "col": 0, "count": 2 },
       "walk":   { "row": 1, "col": 0, "count": 6 },
       "attack": { "row": 2, "col": 0, "count": 5 },
       "death":  { "row": 3, "col": 0, "count": 6 }
     }
   }
   ```
4. **动画时长与事件时间点**（attackPoint / DealDamage / BeginDecay）仍在 `data/units_*.json` 的 `animation` 字段，**不用动**
5. `data/war3_assets.json` 的 `res://` URI 指向将来 Unity 侧的模型 / 图标路径，只在 Unity 移植时启用

### 为什么叫 res://

中性占位前缀，不绑定具体资源来源。你可以 mount 到：
- 开发期：`/assets/sprites/*.svg`（当前）
- Unity：`Resources.Load(path.replace("res://", ""))` 或 Addressables
- 替换期：自己约定的 CDN / 本地目录
