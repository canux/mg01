// 零依赖 HTTP + SSE 服务器：后端跑 BattleSim，前端 canvas 渲染
// 用法: node --experimental-strip-types web/server.ts
// 浏览器访问: http://localhost:8080

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, extname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

import { BattleSim } from "../engine/src/BattleSim.ts";
import { Player } from "../engine/src/Player.ts";
import { buildOrder } from "../engine/src/Strategy.ts";
import { Side } from "../engine/src/Enums.ts";
import { balance, units, buildings, races } from "../engine/src/DataLoader.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = resolve(__dirname, "static");
const PORT = Number(process.env.PORT ?? 8080);
const TICK_INTERVAL_MS = 100;         // 与 tickRate=10Hz 对齐
const SNAPSHOT_INTERVAL_MS = 100;     // 每 tick 推一帧

// ---- 战斗 ----

interface Session {
  sim: BattleSim;
  recentEvents: { t: number; kind: string; msg: string }[];
  phase: number;
  timer: NodeJS.Timeout | null;
  listeners: Set<ServerResponse>;
}

let current: Session | null = null;

function newSim(leftRace: string, rightRace: string): Session {
  const sim = new BattleSim({ balance, verbose: false });
  sim.setUnitLookup(id => units.get(id));
  sim.setBuildingLookup(id => buildings.get(id));
  sim.setRaceLookup(id => races.find(r => r.id === id));

  const lp = new Player(Side.Left,  leftRace,  `L-${leftRace}`,  balance.startGold, balance.incomeIntervalSec);
  const rp = new Player(Side.Right, rightRace, `R-${rightRace}`, balance.startGold, balance.incomeIntervalSec);
  lp.strategy = STRATEGIES[leftRace]  ?? STRATEGIES.human;
  rp.strategy = STRATEGIES[rightRace] ?? STRATEGIES.orc;
  sim.addPlayer(lp);
  sim.addPlayer(rp);

  return { sim, recentEvents: [], phase: 0, timer: null, listeners: new Set() };
}

const STRATEGIES: Record<string, ReturnType<typeof buildOrder>> = {
  human: buildOrder("human-rush", [
    "human_goldmine", "human_barracks_footman", "human_barracks_footman",
    "human_barracks_rifleman", "human_goldmine", "human_barracks_footman",
    "human_barracks_rifleman", "human_tower", "human_barracks_rifleman",
  ]),
  orc: buildOrder("orc-rush", [
    "orc_goldmine", "orc_trollden_headhunter", "orc_barracks_grunt",
    "orc_goldmine", "orc_trollden_headhunter", "orc_barracks_grunt",
    "orc_tower", "orc_workshop_catapult",
  ]),
  undead: buildOrder("undead-rush", [
    "ud_haunted", "ud_crypt_ghoul", "ud_crypt_ghoul", "ud_haunted",
    "ud_crypt_cryptfiend", "ud_tower", "ud_graveyard_meatwagon", "ud_boneyard_gargoyle",
  ]),
  nightelf: buildOrder("nightelf-rush", [
    "ne_entangledmine", "ne_archershop_archer", "ne_archershop_archer",
    "ne_entangledmine", "ne_ancient_huntress", "ne_tower", "ne_ancientofwind_glaive",
  ]),
};

function startLoop(s: Session) {
  if (s.timer) return;
  const prevEventCount = { n: s.sim.events.length };
  s.timer = setInterval(() => {
    if (s.sim.ended || s.sim.now >= balance.rules.maxBattleSec) {
      if (s.timer) { clearInterval(s.timer); s.timer = null; }
      broadcast(s);
      return;
    }
    s.sim.tick();

    // 捕获新事件
    while (s.sim.events.length > prevEventCount.n) {
      const ev = s.sim.events[prevEventCount.n++]!;
      s.recentEvents.push(ev);
      if (s.recentEvents.length > 30) s.recentEvents.shift();
    }
    broadcast(s);
  }, TICK_INTERVAL_MS);
}

function snapshot(s: Session) {
  const sim = s.sim;
  const players = sim.players.map(p => ({
    side: p.side,
    race: p.race,
    name: p.name,
    gold: Math.round(p.gold),
    income: p.incomePerInterval(balance.baseIncome),
    unitsSpawned: p.stats.unitsSpawned,
  }));
  const bs = sim.buildings.filter(b => b.alive).map(b => ({
    id: b.id,
    side: b.side,
    x: Math.round(b.pos.x),
    y: Math.round(b.pos.y),
    kind: b.tpl.kind,
    race: b.tpl.race,
    nameCn: b.tpl.nameCn,
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
    hp: Math.max(0, Math.round(u.hp)),
    hpMax: u.tpl.hp,
  }));
  return {
    t: +sim.now.toFixed(1),
    maxT: balance.rules.maxBattleSec,
    ended: sim.ended,
    winner: sim.winner,
    laneLength: balance.laneLength,
    laneWidth: balance.laneWidth,
    players,
    buildings: bs,
    units: us,
    events: s.recentEvents.slice(-10),
  };
}

function broadcast(s: Session) {
  const data = `data: ${JSON.stringify(snapshot(s))}\n\n`;
  for (const res of s.listeners) {
    try { res.write(data); } catch { /* socket closed */ }
  }
}

// ---- HTTP 路由 ----

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
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
    if (!current) current = newSim("human", "orc");
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "connection": "keep-alive",
      "access-control-allow-origin": "*",
    });
    current.listeners.add(res);
    res.write(`data: ${JSON.stringify(snapshot(current))}\n\n`);
    startLoop(current);
    req.on("close", () => current?.listeners.delete(res));
    return;
  }

  if (url.pathname === "/new" && req.method === "POST") {
    const left = url.searchParams.get("left") ?? "human";
    const right = url.searchParams.get("right") ?? "orc";
    if (current?.timer) clearInterval(current.timer);
    for (const l of current?.listeners ?? []) l.end();
    current = newSim(left, right);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, left, right }));
    return;
  }

  if (url.pathname === "/races") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(races.map(r => ({ id: r.id, nameCn: r.nameCn, color: r.color }))));
    return;
  }

  serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`mg01 viewer → http://localhost:${PORT}`);
});
