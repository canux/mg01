// 零依赖 HTTP + SSE 服务器：后端跑 BattleSim，前端 canvas 渲染
// 用法: node --experimental-strip-types web/server.ts
// 浏览器访问: http://localhost:8080

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, extname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

import { BattleSim } from "../engine/src/BattleSim.ts";
import { Player } from "../engine/src/Player.ts";
import { buildOrder } from "../engine/src/Strategy.ts";
import { Side } from "../engine/src/Enums.ts";
import { balance, units, buildings, races, spells } from "../engine/src/DataLoader.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = resolve(__dirname, "static");
const PORT = Number(process.env.PORT ?? 8080);
const BASE_TICK_INTERVAL_MS = 100;    // 1x = 10Hz
const SPEED_CHOICES = [0, 0.5, 1, 2, 4] as const;  // 0 = 暂停

/** 各族英雄 id (role=='legendary')；启动时从 units 反查一次 */
const HERO_BY_RACE: Record<string, { id: string; nameCn: string; cost: number }> = (() => {
  const out: Record<string, { id: string; nameCn: string; cost: number }> = {};
  for (const [id, u] of units) {
    if (u.role === "legendary") out[u.race] = { id, nameCn: u.nameCn, cost: u.cost };
  }
  return out;
})();

// ---- 战斗 ----

type SideMode = "ai" | "player";

interface SlotHolder { clientId: string; token: string; }

interface Listener { res: ServerResponse; clientId: string | null; }

interface Session {
  sim: BattleSim;
  modes: { left: SideMode; right: SideMode };
  recentEvents: { t: number; kind: string; msg: string }[];
  phase: number;
  timer: NodeJS.Timeout | null;
  listeners: Set<Listener>;
  speed: number;    // 0 = paused; otherwise 0.5 / 1 / 2 / 4
  slots: { left: SlotHolder | null; right: SlotHolder | null };
  ready: { left: boolean; right: boolean };  // mode==ai → 永远 true
  disconnectedSince: { left: number | null; right: number | null };  // Date.now() ms
  recording: Recording;
  prevEventCount: number;    // 用于 tick 时增量抽取 key events
}

// ---- 录像 ----
//
// 紧凑确定性 command-log。engine 内无 Math.random → sim 完全确定。
// 录像只存：config + 命令元组 + 终局结果 + 关键事件 sha1 digest。
// 关键事件原文不存（看回放靠服务端 replay 再生成），单局体积约 < 2KB。

type CommandKind = "place" | "hero" | "ready" | "speed" | "forfeit";

// [t(秒,2位小数), side, kind, payload]，紧凑数组减少 JSON 体积
type RecCommand = [number, 0 | 1, CommandKind, Record<string, string | number | boolean>];

interface RecResult {
  winner: number | null;
  finalT: number;
  castleHpL: number;
  castleHpR: number;
  spawnedL: number;
  spawnedR: number;
}

interface Recording {
  v: 1;
  startedAt: number;
  config: { l: string; r: string; lm: SideMode; rm: SideMode };
  cmds: RecCommand[];
  result: RecResult | null;
  digest: string | null;          // sha1("t|kind|side" 行序列)
}

/** 用于摘要：build / hero / castle_down / building_down / phase / end */
const KEY_EVENT_KINDS = new Set(["build", "hero", "castle_down", "building_down", "phase", "end"]);

/** 从 SimEvent.msg 解出 side：仅匹配开头的 "L-" / "R-" / "left " / "right "；否则 -1。 */
function parseSideFromMsg(msg: string): number {
  if (/^(L-|left\b)/.test(msg))  return 0;
  if (/^(R-|right\b)/.test(msg)) return 1;
  return -1;
}

function digestKeyEvents(events: { t: number; kind: string; msg: string }[]): string {
  const h = createHash("sha1");
  for (const ev of events) {
    if (!KEY_EVENT_KINDS.has(ev.kind)) continue;
    h.update(`${ev.t.toFixed(2)}|${ev.kind}|${parseSideFromMsg(ev.msg)}\n`);
  }
  return h.digest("hex");
}

function recordCommand(s: Session, side: 0 | 1, kind: CommandKind, payload: Record<string, string | number | boolean>) {
  if (s.sim.ended) return;
  s.recording.cmds.push([+s.sim.now.toFixed(2), side, kind, payload]);
}

/** 服务端 deterministic 重放：跑 fresh sim、按 t 喂指令、与录像 digest 比较。 */
function replayAndVerify(rec: Recording): {
  ok: boolean;
  matched: { digest: boolean; winner: boolean; finalT: boolean };
  expected: { digest: string; winner: number | null; finalT: number };
  actual: { digest: string; winner: number | null; finalT: number };
  cmdsApplied: number;
  cmdsFailed: number;
} {
  const sim = new BattleSim({ balance, verbose: false });
  sim.setUnitLookup(id => units.get(id));
  sim.setBuildingLookup(id => buildings.get(id));
  sim.setRaceLookup(id => races.find(r => r.id === id));
  sim.setSpellLookup(id => spells.get(id));

  const lp = new Player(Side.Left,  rec.config.l, `L-${rec.config.l}`, balance.startGold, balance.incomeIntervalSec);
  const rp = new Player(Side.Right, rec.config.r, `R-${rec.config.r}`, balance.startGold, balance.incomeIntervalSec);
  if (rec.config.lm === "ai") lp.strategy = strategyFor(rec.config.l);
  if (rec.config.rm === "ai") rp.strategy = strategyFor(rec.config.r);
  sim.addPlayer(lp);
  sim.addPlayer(rp);

  // 按 t 排序的命令队列；player-only 类指令在 sim.now>=t 时执行。
  const queue = rec.cmds.slice().sort((a, b) => a[0] - b[0]);
  let qi = 0, applied = 0, failed = 0;
  const dt = 1 / balance.tickRate;       // 每 tick 推进的秒数
  const maxT = balance.rules.maxBattleSec;

  while (!sim.ended && sim.now < maxT) {
    // 喂当前 tick 内到期的指令
    while (qi < queue.length && queue[qi]![0] <= sim.now + 1e-6) {
      const [, side, kind, payload] = queue[qi]!;
      let r: { ok: boolean } = { ok: false };
      switch (kind) {
        case "place": r = sim.manualBuild(side, String(payload.id), Number(payload.slot)); break;
        case "hero": r = sim.hireHero(side, String(payload.id)); break;
        case "forfeit": {
          sim.ended = true;
          sim.winner = side === 0 ? Side.Right : Side.Left;
          const key = side === 0 ? "left" : "right";
          sim.log({ t: sim.now, kind: "end", msg: `${key} surrendered` });
          r = { ok: true }; break;
        }
        case "ready":
        case "speed":
          r = { ok: true }; break;       // 这俩对 sim 决定性无影响
      }
      if (r.ok) applied++; else failed++;
      qi++;
    }
    if (sim.ended) break;      // forfeit 指令把 sim 设为 ended 时，不再 tick
    sim.tick();
    void dt;
  }
  if (!sim.ended && sim.now >= maxT) {
    sim.ended = true;
    sim.winner = null;
    sim.log({ t: sim.now, kind: "end", msg: `timeout at ${sim.now.toFixed(1)}s (draw)` });
  }
  const actualDigest = digestKeyEvents(sim.events);
  const actual = { digest: actualDigest, winner: sim.winner, finalT: +sim.now.toFixed(2) };
  const expected = { digest: rec.digest!, winner: rec.result!.winner, finalT: rec.result!.finalT };
  const matched = {
    digest: expected.digest === actual.digest,
    winner: expected.winner === actual.winner,
    finalT: Math.abs(expected.finalT - actual.finalT) < 0.2,
  };
  return {
    ok: matched.digest && matched.winner && matched.finalT,
    matched, expected, actual,
    cmdsApplied: applied, cmdsFailed: failed,
  };
}

const DISCONNECT_FORFEIT_MS = 10_000;

function isAllReady(s: Session): boolean {
  const l = s.modes.left  === "ai" || s.ready.left;
  const r = s.modes.right === "ai" || s.ready.right;
  return l && r;
}

/** 通过 x-token header 反查 side，返回 null = 未授权 */
function authSide(s: Session, req: IncomingMessage): 0 | 1 | null {
  const token = req.headers["x-token"];
  if (typeof token !== "string" || !token) return null;
  if (s.slots.left?.token  === token) return 0;
  if (s.slots.right?.token === token) return 1;
  return null;
}

function randomToken(): string {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

let current: Session | null = null;

function newSim(leftRace: string, rightRace: string, leftMode: SideMode, rightMode: SideMode): Session {
  const sim = new BattleSim({ balance, verbose: false });
  sim.setUnitLookup(id => units.get(id));
  sim.setBuildingLookup(id => buildings.get(id));
  sim.setRaceLookup(id => races.find(r => r.id === id));
  sim.setSpellLookup(id => spells.get(id));

  const lp = new Player(Side.Left,  leftRace,  `L-${leftRace}`,  balance.startGold, balance.incomeIntervalSec);
  const rp = new Player(Side.Right, rightRace, `R-${rightRace}`, balance.startGold, balance.incomeIntervalSec);
  if (leftMode === "ai")  lp.strategy = strategyFor(leftRace);
  if (rightMode === "ai") rp.strategy = strategyFor(rightRace);
  sim.addPlayer(lp);
  sim.addPlayer(rp);

  return {
    sim, modes: { left: leftMode, right: rightMode },
    recentEvents: [], phase: 0, timer: null, listeners: new Set(), speed: 1,
    slots: { left: null, right: null },
    ready: { left: leftMode === "ai", right: rightMode === "ai" },
    disconnectedSince: { left: null, right: null },
    recording: {
      v: 1,
      startedAt: Date.now(),
      config: { l: leftRace, r: rightRace, lm: leftMode, rm: rightMode },
      cmds: [], result: null, digest: null,
    },
    prevEventCount: 0,
  };
}

/** 把新事件入 recentEvents（关键事件不在录像里逐条存，只在终局算 digest）。 */
function drainKeyEvents(s: Session) {
  const evs = s.sim.events;
  while (s.prevEventCount < evs.length) {
    const ev = evs[s.prevEventCount++]!;
    s.recentEvents.push(ev);
    if (s.recentEvents.length > 30) s.recentEvents.shift();
  }
}

function finalizeRecording(s: Session) {
  if (s.recording.result) return;
  const lp = s.sim.players[0], rp = s.sim.players[1];
  const castleL = s.sim.buildings.find(b => b.tpl.kind === "castle" && b.side === Side.Left);
  const castleR = s.sim.buildings.find(b => b.tpl.kind === "castle" && b.side === Side.Right);
  s.recording.result = {
    winner: s.sim.winner,
    finalT: +s.sim.now.toFixed(2),
    castleHpL: castleL ? Math.max(0, Math.round(castleL.hp)) : 0,
    castleHpR: castleR ? Math.max(0, Math.round(castleR.hp)) : 0,
    spawnedL: lp?.stats.unitsSpawned ?? 0,
    spawnedR: rp?.stats.unitsSpawned ?? 0,
  };
  s.recording.digest = digestKeyEvents(s.sim.events);
}

/** 某 slot 的 clientId 是否还有任一活跃 SSE listener */
function slotIsConnected(s: Session, sideKey: "left" | "right"): boolean {
  const holder = s.slots[sideKey];
  if (!holder) return true;    // 无人占 → 视为"连着" (不触发超时)
  for (const l of s.listeners) if (l.clientId === holder.clientId) return true;
  return false;
}

function refreshDisconnectState(s: Session) {
  const now = Date.now();
  for (const key of ["left", "right"] as const) {
    const connected = slotIsConnected(s, key);
    if (connected) {
      if (s.disconnectedSince[key] !== null) {
        s.disconnectedSince[key] = null;
        s.sim.log({ t: s.sim.now, kind: "end", msg: `${key} reconnected` });
      }
    } else if (s.sim.now > 0 && !s.sim.ended && s.disconnectedSince[key] === null) {
      s.disconnectedSince[key] = now;
      s.sim.log({ t: s.sim.now, kind: "end", msg: `${key} disconnected — ${DISCONNECT_FORFEIT_MS / 1000}s forfeit timer` });
    }
  }
}

/** 返回 client 在当前 session 的 side（已占 → 返回该 side；否则尝试抢一个 mode=player 的空位；都满 → null 观众） */
function claimSide(s: Session, clientId: string): { side: 0 | 1 | null; token: string | null } {
  if (s.slots.left?.clientId  === clientId) return { side: 0, token: s.slots.left.token };
  if (s.slots.right?.clientId === clientId) return { side: 1, token: s.slots.right.token };
  for (const [key, sideNum] of [["left", 0], ["right", 1]] as const) {
    if (s.modes[key] === "player" && !s.slots[key]) {
      const token = randomToken();
      s.slots[key] = { clientId, token };
      return { side: sideNum, token };
    }
  }
  return { side: null, token: null };
}

function stopLoop(s: Session) {
  if (s.timer) { clearInterval(s.timer); s.timer = null; }
}

function applySpeed(s: Session, speed: number) {
  if (!SPEED_CHOICES.includes(speed as typeof SPEED_CHOICES[number])) return false;
  s.speed = speed;
  stopLoop(s);
  if (speed > 0) startLoop(s);
  else broadcast(s);
  return true;
}

// 关键：strategy 内部持有 idx 状态。每个 player 必须拿到自己的实例，否则跨局/跨边共享会破坏确定性。
const STRATEGIES: Record<string, () => ReturnType<typeof buildOrder>> = {
  human: () => buildOrder("human-rush", [
    "human_goldmine", "human_barracks_footman", "human_barracks_footman",
    "human_barracks_rifleman", "human_goldmine", "human_barracks_footman",
    "human_barracks_rifleman", "human_tower", "human_barracks_rifleman",
  ]),
  orc: () => buildOrder("orc-rush", [
    "orc_goldmine", "orc_trollden_headhunter", "orc_barracks_grunt",
    "orc_goldmine", "orc_trollden_headhunter", "orc_barracks_grunt",
    "orc_tower", "orc_workshop_catapult",
  ]),
  undead: () => buildOrder("undead-rush", [
    "ud_haunted", "ud_crypt_ghoul", "ud_crypt_ghoul", "ud_haunted",
    "ud_crypt_cryptfiend", "ud_tower", "ud_graveyard_meatwagon", "ud_boneyard_gargoyle",
  ]),
  nightelf: () => buildOrder("nightelf-rush", [
    "ne_entangledmine", "ne_archershop_archer", "ne_archershop_archer",
    "ne_entangledmine", "ne_ancient_huntress", "ne_tower", "ne_ancientofwind_glaive",
  ]),
};

function strategyFor(race: string) {
  return (STRATEGIES[race] ?? STRATEGIES.human)();
}

function startLoop(s: Session) {
  if (s.timer) return;
  if (s.speed <= 0) return;
  if (!isAllReady(s)) return;                  // 任一 player 未 ready → 不开 tick
  const interval = Math.max(10, Math.round(BASE_TICK_INTERVAL_MS / s.speed));
  s.timer = setInterval(() => {
    if (s.sim.ended) { drainKeyEvents(s); finalizeRecording(s); stopLoop(s); broadcast(s); return; }
    // 断线判负
    const now = Date.now();
    for (const key of ["left", "right"] as const) {
      const ds = s.disconnectedSince[key];
      if (ds !== null && now - ds > DISCONNECT_FORFEIT_MS) {
        s.sim.ended = true;
        s.sim.winner = key === "left" ? Side.Right : Side.Left;
        s.sim.log({ t: s.sim.now, kind: "end", msg: `${key} forfeit (disconnected > ${DISCONNECT_FORFEIT_MS / 1000}s)` });
        drainKeyEvents(s); finalizeRecording(s); stopLoop(s); broadcast(s); return;
      }
    }
    if (s.sim.now >= balance.rules.maxBattleSec) {
      s.sim.ended = true;
      s.sim.winner = null;
      s.sim.log({ t: s.sim.now, kind: "end", msg: `timeout at ${s.sim.now.toFixed(1)}s (draw)` });
      drainKeyEvents(s); finalizeRecording(s); stopLoop(s); broadcast(s); return;
    }
    s.sim.tick();
    drainKeyEvents(s);
    broadcast(s);
  }, interval);
}

function snapshot(s: Session) {
  const sim = s.sim;
  const players = sim.players.map(p => {
    const heroMeta = HERO_BY_RACE[p.race];
    const hi = sim.playerHeroInfo(p);
    const hadHero = p.heroReviveAt > 0 || hi.alive || p.heroUnitId !== null;
    const nextCost = heroMeta ? (hadHero ? Math.round(heroMeta.cost / 2) : heroMeta.cost) : 0;
    return {
      side: p.side,
      race: p.race,
      name: p.name,
      gold: Math.round(p.gold),
      income: p.incomePerInterval(balance.baseIncome),
      unitsSpawned: p.stats.unitsSpawned,
      hero: heroMeta ? {
        id: heroMeta.id,
        nameCn: heroMeta.nameCn,
        alive: hi.alive,
        reviveIn: +hi.reviveIn.toFixed(1),
        nextCost,
      } : null,
    };
  });
  const bs = sim.buildings.filter(b => b.alive).map(b => ({
    id: b.id,
    side: b.side,
    x: Math.round(b.pos.x),
    y: Math.round(b.pos.y),
    kind: b.tpl.kind,
    race: b.tpl.race,
    nameCn: b.tpl.nameCn,
    assetKey: b.tpl.assetKey,
    hp: Math.max(0, Math.round(b.hp)),
    hpMax: b.tpl.hp,
    ready: b.isReady(sim.now),
  }));
  const us = sim.units.filter(u => u.alive).map(u => ({
    id: u.id,
    side: u.side,
    x: Math.round(u.pos.x),
    y: Math.round(u.pos.y),
    race: u.tpl.race,
    role: u.tpl.role,
    nameCn: u.tpl.nameCn,
    assetKey: u.tpl.assetKey,
    hp: Math.max(0, Math.round(u.hp)),
    hpMax: u.tpl.hp,
    mana: u.tpl.manaMax ? Math.round(u.mana) : undefined,
    manaMax: u.tpl.manaMax ?? undefined,
    buffs: u.buffs.length ? u.buffs.map(b => b.id) : undefined,
  }));
  const ps = sim.projectiles.filter(p => p.alive).map(p => ({
    id: p.id,
    side: p.side,
    x: Math.round(p.pos.x),
    y: Math.round(p.pos.y),
    tx: Math.round(p.target.pos.x),
    ty: Math.round(p.target.pos.y),
    visualKind: p.visualKind,
    aoeRadius: p.aoeRadius,
  }));
  // 槽位 (双方各 12 个)。idx 与 sim.slotPositions 顺序一致
  const slots: { side: number; idx: number; x: number; y: number; free: boolean }[] = [];
  for (const side of [Side.Left, Side.Right]) {
    const all = sim.slotPositions(side);
    all.forEach((pos, idx) => {
      slots.push({ side, idx, x: Math.round(pos.x), y: Math.round(pos.y), free: sim.slotIsFree(side, idx) });
    });
  }
  return {
    t: +sim.now.toFixed(1),
    maxT: balance.rules.maxBattleSec,
    ended: sim.ended,
    winner: sim.winner,
    laneLength: balance.laneLength,
    laneWidth: balance.laneWidth,
    modes: s.modes,
    speed: s.speed,
    slots: {
      left:  { claimed: !!s.slots.left,  mode: s.modes.left  },
      right: { claimed: !!s.slots.right, mode: s.modes.right },
    },
    ready: { left: s.ready.left, right: s.ready.right, all: isAllReady(s) },
    disconnect: (() => {
      const now = Date.now();
      const rem = (ds: number | null) => ds === null ? null : Math.max(0, DISCONNECT_FORFEIT_MS - (now - ds)) / 1000;
      return { left: rem(s.disconnectedSince.left), right: rem(s.disconnectedSince.right) };
    })(),
    players,
    buildings: bs,
    units: us,
    projectiles: ps,
    slots,
    events: s.recentEvents.slice(-10),
  };
}

function broadcast(s: Session) {
  const data = `data: ${JSON.stringify(snapshot(s))}\n\n`;
  for (const l of s.listeners) {
    try { l.res.write(data); } catch { /* socket closed */ }
  }
}

// ---- HTTP 路由 ----

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".wav":  "audio/wav",
  ".ogg":  "audio/ogg",
  ".mp3":  "audio/mpeg",
};

function serveStatic(req: IncomingMessage, res: ServerResponse, urlPath: string) {
  const rel = urlPath === "/" ? "/index.html" : urlPath;
  const file = join(STATIC_DIR, rel);
  if (!file.startsWith(STATIC_DIR)) { res.writeHead(403).end(); return; }
  try {
    const body = readFileSync(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end(`Not found: ${urlPath}`);
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  if (url.pathname === "/stream") {
    if (!current) current = newSim("human", "orc", "ai", "ai");
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "connection": "keep-alive",
      "access-control-allow-origin": "*",
    });
    const listener: Listener = { res, clientId: url.searchParams.get("clientId") };
    current.listeners.add(listener);
    refreshDisconnectState(current);    // 可能是 reconnect → 清 disconnectedSince
    res.write(`data: ${JSON.stringify(snapshot(current))}\n\n`);
    startLoop(current);
    req.on("close", () => {
      if (!current) return;
      current.listeners.delete(listener);
      refreshDisconnectState(current);
    });
    return;
  }

  if (url.pathname === "/join" && req.method === "POST") {
    if (!current) current = newSim("human", "orc", "ai", "ai");
    const clientId = url.searchParams.get("clientId");
    if (!clientId) { res.writeHead(400).end(JSON.stringify({ ok: false, reason: "clientId required" })); return; }
    const { side, token } = claimSide(current, clientId);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      side,                  // 0 / 1 / null (观众)
      token,                 // 后续 /place /hero /speed 需带 header x-token
      modes: current.modes,
      leftRace:  current.sim.players[0]?.race ?? "human",
      rightRace: current.sim.players[1]?.race ?? "orc",
    }));
    return;
  }

  if (url.pathname === "/new" && req.method === "POST") {
    const left = url.searchParams.get("left") ?? "human";
    const right = url.searchParams.get("right") ?? "orc";
    const leftMode  = (url.searchParams.get("leftMode")  === "player" ? "player" : "ai") as SideMode;
    const rightMode = (url.searchParams.get("rightMode") === "player" ? "player" : "ai") as SideMode;
    if (current) stopLoop(current);
    for (const l of current?.listeners ?? []) l.res.end();
    const prevSlots = current?.slots ?? { left: null, right: null };
    current = newSim(left, right, leftMode, rightMode);
    // 保留原 slot 占用（同 clientId 新局沿用角色）；但若 mode 变成 ai 则清空
    if (leftMode  === "player" && prevSlots.left)  current.slots.left  = prevSlots.left;
    if (rightMode === "player" && prevSlots.right) current.slots.right = prevSlots.right;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, left, right, leftMode, rightMode }));
    return;
  }

  if (url.pathname === "/hero" && req.method === "POST") {
    if (!current) { res.writeHead(400).end(JSON.stringify({ ok: false, reason: "no session" })); return; }
    const side = Number(url.searchParams.get("side") ?? "0") as 0 | 1;
    const sideMode = side === 0 ? current.modes.left : current.modes.right;
    if (sideMode !== "player") { res.writeHead(403).end(JSON.stringify({ ok: false, reason: "side is AI-controlled" })); return; }
    const authed = authSide(current, req);
    if (authed !== side) { res.writeHead(401).end(JSON.stringify({ ok: false, reason: "bad token for this side" })); return; }
    const p = current.sim.players.find(pp => pp.side === side);
    const heroMeta = p ? HERO_BY_RACE[p.race] : null;
    if (!p || !heroMeta) { res.writeHead(400).end(JSON.stringify({ ok: false, reason: "no hero for race" })); return; }
    const r = current.sim.hireHero(side, heroMeta.id);
    if (r.ok) recordCommand(current, side, "hero", { id: heroMeta.id });
    res.writeHead(r.ok ? 200 : 400, { "content-type": "application/json" });
    res.end(JSON.stringify(r));
    return;
  }

  if (url.pathname === "/speed" && req.method === "POST") {
    if (!current) { res.writeHead(400).end(JSON.stringify({ ok: false, reason: "no session" })); return; }
    // 仅当至少有一个 player side 时才要求 token；全 AI 局任何人都能控速
    const anyPlayer = current.modes.left === "player" || current.modes.right === "player";
    if (anyPlayer && authSide(current, req) === null) {
      res.writeHead(401).end(JSON.stringify({ ok: false, reason: "token required" })); return;
    }
    const rate = Number(url.searchParams.get("rate") ?? "1");
    const ok = applySpeed(current, rate);
    if (ok) {
      // /speed 在全 AI 局可由观众触发；此时 authSide 为 null，跳过录像
      const a = authSide(current, req);
      if (a !== null) recordCommand(current, a, "speed", { rate });
    }
    res.writeHead(ok ? 200 : 400, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok, speed: current.speed }));
    return;
  }

  if (url.pathname === "/ready" && req.method === "POST") {
    if (!current) { res.writeHead(400).end(JSON.stringify({ ok: false, reason: "no session" })); return; }
    const authed = authSide(current, req);
    if (authed === null) { res.writeHead(401).end(JSON.stringify({ ok: false, reason: "token required" })); return; }
    const wantRaw = url.searchParams.get("ready");
    const want = wantRaw === null ? true : wantRaw === "true";
    const key = authed === 0 ? "left" : "right";
    current.ready[key] = want;
    recordCommand(current, authed, "ready", { ready: want });
    if (isAllReady(current)) startLoop(current);
    broadcast(current);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, ready: current.ready, all: isAllReady(current) }));
    return;
  }

  if (url.pathname === "/place" && req.method === "POST") {
    if (!current) { res.writeHead(400).end(JSON.stringify({ ok: false, reason: "no session" })); return; }
    const side = Number(url.searchParams.get("side") ?? "0") as 0 | 1;
    const buildingId = url.searchParams.get("id") ?? "";
    const slotIdx = Number(url.searchParams.get("slot") ?? "-1");
    const sideMode = side === 0 ? current.modes.left : current.modes.right;
    if (sideMode !== "player") { res.writeHead(403).end(JSON.stringify({ ok: false, reason: "side is AI-controlled" })); return; }
    const authed = authSide(current, req);
    if (authed !== side) { res.writeHead(401).end(JSON.stringify({ ok: false, reason: "bad token for this side" })); return; }
    const r = current.sim.manualBuild(side, buildingId, slotIdx);
    if (r.ok) recordCommand(current, side, "place", { id: buildingId, slot: slotIdx });
    res.writeHead(r.ok ? 200 : 400, { "content-type": "application/json" });
    res.end(JSON.stringify(r));
    return;
  }

  if (url.pathname === "/forfeit" && req.method === "POST") {
    if (!current) { res.writeHead(400).end(JSON.stringify({ ok: false, reason: "no session" })); return; }
    if (current.sim.ended) { res.writeHead(400).end(JSON.stringify({ ok: false, reason: "match ended" })); return; }
    const authed = authSide(current, req);
    if (authed === null) { res.writeHead(401).end(JSON.stringify({ ok: false, reason: "token required" })); return; }
    recordCommand(current, authed, "forfeit", {});
    current.sim.ended = true;
    current.sim.winner = authed === 0 ? Side.Right : Side.Left;
    const key = authed === 0 ? "left" : "right";
    current.sim.log({ t: current.sim.now, kind: "end", msg: `${key} surrendered` });
    drainKeyEvents(current); finalizeRecording(current); stopLoop(current); broadcast(current);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, winner: current.sim.winner }));
    return;
  }

  if (url.pathname === "/replay/last" && req.method === "GET") {
    if (!current) { res.writeHead(404).end(JSON.stringify({ ok: false, reason: "no session" })); return; }
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, recording: current.recording }));
    return;
  }

  if (url.pathname === "/replay/verify" && req.method === "POST") {
    if (!current) { res.writeHead(404).end(JSON.stringify({ ok: false, reason: "no session" })); return; }
    const rec = current.recording;
    if (!rec.result || !rec.digest) {
      res.writeHead(400).end(JSON.stringify({ ok: false, reason: "current match not finished" }));
      return;
    }
    const report = replayAndVerify(rec);
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(report));
    return;
  }

  if (url.pathname === "/races") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(races.map(r => ({ id: r.id, nameCn: r.nameCn, color: r.color }))));
    return;
  }

  if (url.pathname === "/buildings") {
    const race = url.searchParams.get("race");
    const list = Array.from(buildings.values())
      .filter(b => !race || b.race === race)
      .filter(b => b.kind !== "castle")  // 主城不可手建
      .map(b => ({ id: b.id, nameCn: b.nameCn, race: b.race, kind: b.kind, cost: b.cost ?? 0,
                   buildTimeSec: b.buildTimeSec ?? 0, spawns: b.spawns ?? null,
                   incomeBonusPer10s: b.incomeBonusPer10s ?? 0, assetKey: b.assetKey }))
      .sort((a, b) => (a.cost - b.cost) || a.nameCn.localeCompare(b.nameCn));
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(list));
    return;
  }

  if (url.pathname === "/sprites") {
    try {
      const body = readFileSync(resolve(__dirname, "../data/sprites.json"));
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(body);
    } catch {
      res.writeHead(404).end("sprites.json not found; run: node --experimental-strip-types web/tools/gen_sprites.ts");
    }
    return;
  }

  serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`mg01 viewer → http://localhost:${PORT}`);
});
