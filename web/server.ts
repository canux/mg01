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

interface Session {
  sim: BattleSim;
  modes: { left: SideMode; right: SideMode };
  recentEvents: { t: number; kind: string; msg: string }[];
  phase: number;
  timer: NodeJS.Timeout | null;
  listeners: Set<ServerResponse>;
  speed: number;    // 0 = paused; otherwise 0.5 / 1 / 2 / 4
  slots: { left: SlotHolder | null; right: SlotHolder | null };
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
  if (leftMode === "ai")  lp.strategy = STRATEGIES[leftRace]  ?? STRATEGIES.human;
  if (rightMode === "ai") rp.strategy = STRATEGIES[rightRace] ?? STRATEGIES.orc;
  sim.addPlayer(lp);
  sim.addPlayer(rp);

  return { sim, modes: { left: leftMode, right: rightMode }, recentEvents: [], phase: 0, timer: null, listeners: new Set(), speed: 1, slots: { left: null, right: null } };
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
  if (s.speed <= 0) return;
  const prevEventCount = { n: s.sim.events.length };
  const interval = Math.max(10, Math.round(BASE_TICK_INTERVAL_MS / s.speed));
  s.timer = setInterval(() => {
    if (s.sim.ended) { stopLoop(s); broadcast(s); return; }
    if (s.sim.now >= balance.rules.maxBattleSec) {
      s.sim.ended = true;
      s.sim.winner = null;
      s.sim.log({ t: s.sim.now, kind: "end", msg: `timeout at ${s.sim.now.toFixed(1)}s (draw)` });
      stopLoop(s); broadcast(s); return;
    }
    s.sim.tick();

    // 捕获新事件
    while (s.sim.events.length > prevEventCount.n) {
      const ev = s.sim.events[prevEventCount.n++]!;
      s.recentEvents.push(ev);
      if (s.recentEvents.length > 30) s.recentEvents.shift();
    }
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
    if (!current) current = newSim("human", "orc", "ai", "ai");
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
    for (const l of current?.listeners ?? []) l.end();
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
    if (sideMode !== "player") {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, reason: "side is AI-controlled" }));
      return;
    }
    const p = current.sim.players.find(pp => pp.side === side);
    const heroMeta = p ? HERO_BY_RACE[p.race] : null;
    if (!p || !heroMeta) { res.writeHead(400).end(JSON.stringify({ ok: false, reason: "no hero for race" })); return; }
    const r = current.sim.hireHero(side, heroMeta.id);
    res.writeHead(r.ok ? 200 : 400, { "content-type": "application/json" });
    res.end(JSON.stringify(r));
    return;
  }

  if (url.pathname === "/speed" && req.method === "POST") {
    if (!current) { res.writeHead(400).end(JSON.stringify({ ok: false, reason: "no session" })); return; }
    const rate = Number(url.searchParams.get("rate") ?? "1");
    const ok = applySpeed(current, rate);
    res.writeHead(ok ? 200 : 400, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok, speed: current.speed }));
    return;
  }

  if (url.pathname === "/place" && req.method === "POST") {
    if (!current) { res.writeHead(400).end(JSON.stringify({ ok: false, reason: "no session" })); return; }
    const side = Number(url.searchParams.get("side") ?? "0") as 0 | 1;
    const buildingId = url.searchParams.get("id") ?? "";
    const slotIdx = Number(url.searchParams.get("slot") ?? "-1");
    const sideMode = side === 0 ? current.modes.left : current.modes.right;
    if (sideMode !== "player") {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, reason: "side is AI-controlled" }));
      return;
    }
    const r = current.sim.manualBuild(side, buildingId, slotIdx);
    res.writeHead(r.ok ? 200 : 400, { "content-type": "application/json" });
    res.end(JSON.stringify(r));
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
