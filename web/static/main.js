// 入口：SSE 接收 + 渲染循环 + 新局按钮
import { Renderer } from "./renderer.js";
import { HUD } from "./ui.js";

const canvas = document.getElementById("stage");
const renderer = new Renderer(canvas);
const hud = new HUD();

let latestState = null;
let sse = null;

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

async function main() {
  await hud.populatePickers();
  hud.onNewGame(async (left, right) => {
    hud.clearLog();
    latestState = null;
    await fetch(`/new?left=${left}&right=${right}`, { method: "POST" });
    connect();
  });
  connect();
  requestAnimationFrame(renderLoop);
}

main();
