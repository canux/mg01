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

## 还没做

- 玩家手动出牌（目前 AI 自动跑 `buildOrder`）
- 技能动画 / 投射物可视化
- 真实 2D 美术（当前是矩形 + 三角形 + emoji）
