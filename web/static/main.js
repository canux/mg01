// 入口：SSE 接收 + 渲染循环 + 新局按钮 + 玩家点击放置
import { Renderer } from "./renderer.js";
import { HUD } from "./ui.js";

const canvas = document.getElementById("stage");
const renderer = new Renderer(canvas);
const hud = new HUD();

let latestState = null;
let sse = null;

// 持久 clientId (localStorage) — 用于 refresh/reconnect 保持同一 side
function getClientId() {
  let id = localStorage.getItem("mg01.clientId");
  if (!id) {
    id = "c_" + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
    localStorage.setItem("mg01.clientId", id);
  }
  return id;
}

const mySession = { clientId: getClientId(), side: null, token: null };

function authHeaders() {
  return mySession.token ? { "x-token": mySession.token } : {};
}

async function joinRoom() {
  try {
    const r = await fetch(`/join?clientId=${encodeURIComponent(mySession.clientId)}`, { method: "POST" })
      .then(r => r.json());
    if (r.ok) {
      mySession.side = r.side;
      mySession.token = r.token;
      hud.setMySession(mySession);
      console.log("[join]", mySession);
    }
  } catch (err) { console.warn("join failed", err); }
}

function connect() {
  if (sse) sse.close();
  sse = new EventSource("/stream");
  sse.onmessage = (e) => {
    try {
      const state = JSON.parse(e.data);
      latestState = state;
      if (state.laneLength && state.laneWidth !== undefined) {
        // x 半宽用 laneWidth 不合适：建筑槽位在 ±260，这里按数据范围取 300
        renderer.setWorld(300, state.laneLength / 2);
      }
      hud.update(state);
    } catch (err) {
      console.error("parse snapshot fail", err);
    }
  };
  sse.onerror = () => {
    console.warn("SSE error; reconnecting in 2s...");
    sse.close();
    setTimeout(connect, 2000);
  };
}

function renderLoop() {
  renderer.draw(latestState);
  requestAnimationFrame(renderLoop);
}

function setupTap() {
  const handler = async (ev) => {
    if (!latestState) return;
    const rect = canvas.getBoundingClientRect();
    const cx = (ev.clientX ?? ev.touches?.[0]?.clientX) - rect.left;
    const cy = (ev.clientY ?? ev.touches?.[0]?.clientY) - rect.top;
    const slot = renderer.hitSlot(cx, cy, latestState);
    if (!slot) return;
    ev.preventDefault();
    // 只能操作自己 side 且该 side 为 player 模式
    const modeKey = slot.side === 0 ? "left" : "right";
    if (mySession.side !== slot.side || latestState.modes?.[modeKey] !== "player") return;
    const player = latestState.players.find(p => p.side === slot.side);
    if (!player) return;
    hud.openBuildSheet(slot, player.race, player.gold, async (buildingId) => {
      const r = await fetch(
        `/place?side=${slot.side}&id=${encodeURIComponent(buildingId)}&slot=${slot.idx}`,
        { method: "POST", headers: authHeaders() }
      ).then(r => r.json()).catch(err => ({ ok: false, reason: String(err) }));
      if (!r.ok) console.warn("place failed:", r.reason);
    });
  };
  canvas.addEventListener("click", handler);
}

async function main() {
  await renderer.loadSprites();
  await hud.populatePickers();
  hud.setAuth(authHeaders);
  hud.onNewGame(async (left, right, leftMode, rightMode) => {
    hud.clearLog();
    hud.closeBuildSheet();
    latestState = null;
    const qs = `left=${left}&right=${right}&leftMode=${leftMode}&rightMode=${rightMode}`;
    await fetch(`/new?${qs}`, { method: "POST" });
    await joinRoom();
    connect();
  });
  setupTap();
  await joinRoom();
  connect();
  requestAnimationFrame(renderLoop);
}

main();
