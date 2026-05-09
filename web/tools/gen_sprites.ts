// 生成 Q 版 SVG 占位精灵 + data/sprites.json
// 一次性运行：node --experimental-strip-types web/tools/gen_sprites.ts
//
// 流程：
// 1. 从 engine/src/DataLoader 读 units/buildings/war3_assets
// 2. 为每个 assetKey 输出 web/static/assets/sprites/<key>.svg（64×64 单帧占位）
// 3. 写 data/sprites.json：每 assetKey 含 path/frameSize/anchor/sheet（per-anim row/col）
// 4. 替换真实素材时：把 SVG 换成 PNG sprite sheet（按 sprites.json 的 sheet 布局），
//    timing/event 仍读 units_*.json 的 animation 字段（Unity AnimationEvent 对齐）

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { units, buildings, races } from "../../engine/src/DataLoader.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT       = resolve(__dirname, "../..");
const SPRITE_DIR = resolve(ROOT, "web/static/assets/sprites");
const SPRITE_URL = "/assets/sprites";
const OUT_JSON   = resolve(ROOT, "data/sprites.json");

mkdirSync(SPRITE_DIR, { recursive: true });

// ---- 颜色 / 图形派生 ----

const RACE_COLOR: Record<string, { main: string; dark: string; light: string }> = {
  human:    { main: "#3B7FD9", dark: "#1b4c8f", light: "#79b0ec" },
  orc:      { main: "#B94A2B", dark: "#7a2b14", light: "#e5805f" },
  undead:   { main: "#7E3FA1", dark: "#4f1f6b", light: "#b87fd6" },
  nightelf: { main: "#2FA86E", dark: "#0f6a42", light: "#66cf99" },
  _neutral: { main: "#8892b0", dark: "#4a5370", light: "#b8c0d4" },
};

const ROLE_GLYPH: Record<string, string> = {
  step: "⚔", range: "➶", heavy: "⛨", siege: "◎",
  flying: "➤", caster: "✺", legendary: "★",
};

const KIND_GLYPH: Record<string, string> = {
  castle: "♛", tower: "▲", barracks: "⚒",
  economy: "$", special: "◇", legendary: "☆",
};

// ---- SVG 占位（单帧，替换时可换成多帧 sheet PNG） ----

function unitSvg(race: string, role: string, label: string, nameCn: string): string {
  const c = RACE_COLOR[race] ?? RACE_COLOR._neutral;
  const glyph = ROLE_GLYPH[role] ?? "●";
  // Q 版 2 头身：大头 + 小身
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <radialGradient id="g" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="${c.light}"/>
      <stop offset="100%" stop-color="${c.main}"/>
    </radialGradient>
  </defs>
  <!-- 影子 -->
  <ellipse cx="32" cy="58" rx="14" ry="3" fill="rgba(0,0,0,0.35)"/>
  <!-- 身体 (梯形) -->
  <path d="M20 54 L22 40 L42 40 L44 54 Z" fill="${c.dark}" stroke="#000" stroke-width="1"/>
  <!-- 大头 (2 头身) -->
  <circle cx="32" cy="26" r="16" fill="url(#g)" stroke="#000" stroke-width="1.2"/>
  <!-- 角色图标 -->
  <text x="32" y="31" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="700" fill="#fff">${glyph}</text>
  <!-- 调试标签 -->
  <text x="32" y="63" text-anchor="middle" font-family="sans-serif" font-size="4" fill="rgba(255,255,255,0.55)">${escape(nameCn)}</text>
</svg>`;
}

function buildingSvg(race: string, kind: string, label: string, nameCn: string): string {
  const c = RACE_COLOR[race] ?? RACE_COLOR._neutral;
  const glyph = KIND_GLYPH[kind] ?? "■";
  // 建筑：矩形主体 + 屋顶三角
  const bodyH = kind === "castle" ? 34 : kind === "tower" ? 40 : 28;
  const bodyY = 56 - bodyH;
  const roofY = bodyY - 8;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <ellipse cx="32" cy="58" rx="18" ry="3" fill="rgba(0,0,0,0.4)"/>
  <!-- 主体 -->
  <rect x="14" y="${bodyY}" width="36" height="${bodyH}" fill="${c.main}" stroke="#000" stroke-width="1.2"/>
  <!-- 门 -->
  <rect x="28" y="${56-10}" width="8" height="10" fill="${c.dark}"/>
  <!-- 屋顶 -->
  <polygon points="14,${bodyY} 50,${bodyY} 32,${roofY}" fill="${c.light}" stroke="#000" stroke-width="1.2"/>
  <!-- 旗帜顶 (castle/legendary) -->
  ${kind === "castle" || kind === "legendary" ? `<line x1="32" y1="${roofY}" x2="32" y2="${roofY-10}" stroke="#000" stroke-width="1.2"/><polygon points="32,${roofY-10} 42,${roofY-7} 32,${roofY-4}" fill="${c.dark}"/>` : ``}
  <!-- 类型图标 -->
  <text x="32" y="${bodyY + bodyH/2 + 4}" text-anchor="middle" font-family="sans-serif" font-size="14" font-weight="700" fill="#fff">${glyph}</text>
  <!-- 调试标签 -->
  <text x="32" y="63" text-anchor="middle" font-family="sans-serif" font-size="4" fill="rgba(255,255,255,0.6)">${escape(nameCn)}</text>
</svg>`;
}

function escape(s: string): string {
  return s.replace(/[<>&"']/g, ch => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;", "\"":"&quot;", "'":"&#39;" })[ch]!);
}

// ---- 关键帧 sheet 布局（占位：单帧；真实 sheet 替换后填 row/col） ----

const SINGLE_FRAME_SHEET = {
  stand:  { row: 0, col: 0, count: 1 },
  walk:   { row: 1, col: 0, count: 1 },
  attack: { row: 2, col: 0, count: 1 },
  death:  { row: 3, col: 0, count: 1 },
};

// 真实 sprite sheet 替换时的推荐布局（4 行 × 最多 8 帧）
const RECOMMENDED_SHEET_EXAMPLE = {
  stand:  { row: 0, col: 0, count: 2 },   // 呼吸
  walk:   { row: 1, col: 0, count: 6 },   // 走路循环
  attack: { row: 2, col: 0, count: 5 },   // attackPoint 落在第 2-3 帧
  death:  { row: 3, col: 0, count: 6 },   // 倒地 → 消散
};

// ---- 主流程 ----

interface SpriteEntry {
  path: string;
  kind: "unit" | "building";
  nameCn: string;
  race: string;
  role?: string;
  buildingKind?: string;
  frameSize: { w: number; h: number };
  anchor: { x: number; y: number };
  sheet: typeof SINGLE_FRAME_SHEET;
}

const sprites: Record<string, SpriteEntry> = {};

// 1. 单位：先按 assetKey 去重（多个 unit 可共享同一个 assetKey，如 footman 就一个）
const seenAsset = new Set<string>();
for (const u of units.values()) {
  const key = u.assetKey;
  if (seenAsset.has(key)) continue;
  seenAsset.add(key);
  const file = resolve(SPRITE_DIR, `${key}.svg`);
  writeFileSync(file, unitSvg(u.race, u.role, key, u.nameCn));
  sprites[key] = {
    path: `${SPRITE_URL}/${key}.svg`,
    kind: "unit",
    nameCn: u.nameCn,
    race: u.race,
    role: u.role,
    frameSize: { w: 64, h: 64 },
    anchor: { x: 0.5, y: 0.85 },          // 脚底略偏上
    sheet: SINGLE_FRAME_SHEET,
  };
}

// 2. 建筑
for (const b of buildings.values()) {
  const key = b.assetKey;
  if (seenAsset.has(key)) continue;
  seenAsset.add(key);
  const file = resolve(SPRITE_DIR, `${key}.svg`);
  writeFileSync(file, buildingSvg(b.race, b.kind, key, b.nameCn));
  sprites[key] = {
    path: `${SPRITE_URL}/${key}.svg`,
    kind: "building",
    nameCn: b.nameCn,
    race: b.race,
    buildingKind: b.kind,
    frameSize: { w: 64, h: 64 },
    anchor: { x: 0.5, y: 0.9 },
    sheet: SINGLE_FRAME_SHEET,
  };
}

const out = {
  _doc: "每个 assetKey 的精灵路径 + 帧布局。当前指向生成的 SVG 单帧占位；替换真实美术时，把 path 指向 PNG sprite sheet，并按实际 sheet 布局修改 frameSize / sheet.{stand,walk,attack,death}.{row,col,count}。动画时长与事件时间点仍在 units_*.json 的 animation 字段里（对齐 Unity AnimationEvent）。",
  _recommended_sheet_example: RECOMMENDED_SHEET_EXAMPLE,
  _races: races.map(r => ({ id: r.id, color: r.color })),
  sprites,
};
writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));

console.log(`生成 ${Object.keys(sprites).length} 个精灵占位 → ${SPRITE_DIR}`);
console.log(`sprites.json → ${OUT_JSON}`);
