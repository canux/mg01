// Canvas 渲染：把引擎世界坐标（x∈[-300..300], y∈[-1500..1500]）映射到竖屏画布
// 世界原点在画布中心；+y 朝下 = Right 方向（Left 主城在上）

const RACE_COLOR = {
  human:    "#3B7FD9",
  orc:      "#B94A2B",
  undead:   "#7E3FA1",
  nightelf: "#2FA86E",
};

const ROLE_SIZE = {
  step: 5, range: 4.5, heavy: 7, siege: 7.5,
  flying: 5.5, caster: 4.5, legendary: 9,
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.dpr = 1;
    this.viewW = 0;
    this.viewH = 0;
    this.scale = 1;
    this.world = { halfW: 300, halfH: 1500 };  // 默认
    this._resize();
    window.addEventListener("resize", () => this._resize());
  }

  setWorld(halfW, halfH) {
    this.world = { halfW, halfH };
    this._resize();
  }

  _resize() {
    const cssW = this.canvas.clientWidth;
    const cssH = this.canvas.clientHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width  = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.viewW = cssW;
    this.viewH = cssH;

    // 目标：场景纵向铺满高度，横向允许轻微被拉伸以填宽（非均匀缩放）
    // 但为了观感，保留最大 1.6:1 的 x 压缩比
    const sy = cssH / (this.world.halfH * 2);
    const sxRaw = cssW / (this.world.halfW * 2);
    const sx = Math.min(sxRaw, sy * 1.8);   // x 最多拉伸到 1.8 × y 比例
    this.sx = sx;
    this.sy = sy;

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /** 世界坐标 → 画布 px (画布中心为原点) */
  _wx(x) { return this.viewW / 2 + x * this.sx; }
  _wy(y) { return this.viewH / 2 + y * this.sy; }

  draw(state) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.viewW, this.viewH);
    this._drawLane();
    this._drawSlots();
    if (!state) return;

    // 建筑先（底层）
    for (const b of state.buildings) this._drawBuilding(b);
    // 单位后（上层）
    for (const u of state.units) this._drawUnit(u);
    // 顶层：主城 HP 条浮于单位之上
    for (const b of state.buildings) if (b.kind === "castle") this._drawCastleHpOverlay(b);
  }

  _drawLane() {
    const ctx = this.ctx;
    // 中线
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    const laneX0 = this._wx(-this.world.halfW * 0.55);
    const laneW  = (this.world.halfW * 1.1) * this.sx;
    ctx.fillRect(laneX0, 0, laneW, this.viewH);

    // 中线虚线（双方分界）
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, this.viewH / 2);
    ctx.lineTo(this.viewW, this.viewH / 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  _drawSlots() {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    const cols = [-260, 0, 260];
    const rowBaseY = this.world.halfH - 300;
    for (let r = 0; r < 4; r++) {
      for (const cx of cols) {
        for (const sign of [-1, 1]) {
          const x = this._wx(cx);
          const y = this._wy(sign * (rowBaseY - r * 280));
          ctx.beginPath();
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  _drawBuilding(b) {
    const ctx = this.ctx;
    const x = this._wx(b.x);
    const y = this._wy(b.y);
    const isLeft = b.side === 0;
    const color = RACE_COLOR[b.race] || "#888";

    let size = 12;
    let stroke = "#fff";
    if (b.kind === "castle")   { size = 22; stroke = "#fff"; }
    else if (b.kind === "tower")    size = 10;
    else if (b.kind === "barracks") size = 14;
    else if (b.kind === "economy")  size = 13;

    // 身体
    ctx.fillStyle = color;
    ctx.globalAlpha = b.ready ? 1 : 0.5;
    ctx.fillRect(x - size, y - size, size * 2, size * 2);
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = stroke;
    ctx.strokeRect(x - size, y - size, size * 2, size * 2);

    // 种类符号
    ctx.fillStyle = "#fff";
    ctx.font = `${Math.round(size * 1.1)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const glyph = b.kind === "castle"   ? "♛"
                : b.kind === "tower"    ? "▲"
                : b.kind === "economy"  ? "$"
                : b.kind === "barracks" ? "⚔"
                : b.kind === "legendary" ? "★" : "■";
    ctx.fillText(glyph, x, y + 1);

    // HP 条（非主城，主城由 overlay 画大条）
    if (b.kind !== "castle" && b.hp < b.hpMax) {
      const w = size * 2;
      const h = 2.5;
      const yy = y - size - 5;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(x - size, yy, w, h);
      ctx.fillStyle = hpColor(b.hp / b.hpMax);
      ctx.fillRect(x - size, yy, w * (b.hp / b.hpMax), h);
    }
  }

  _drawCastleHpOverlay(b) {
    const ctx = this.ctx;
    const isLeft = b.side === 0;
    const barW = this.viewW * 0.5;
    const barH = 6;
    const x = (this.viewW - barW) / 2;
    const y = isLeft ? 4 : this.viewH - barH - 4;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(x, y, barW, barH);
    const pct = b.hp / b.hpMax;
    ctx.fillStyle = hpColor(pct);
    ctx.fillRect(x, y, barW * pct, barH);
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.strokeRect(x + 0.5, y + 0.5, barW - 1, barH - 1);
  }

  _drawUnit(u) {
    const ctx = this.ctx;
    const x = this._wx(u.x);
    const y = this._wy(u.y);
    const r = ROLE_SIZE[u.role] || 5;
    const color = RACE_COLOR[u.race] || "#aaa";

    // 三角形：指向前进方向（Left 向下 +y，Right 向上 -y）
    const dir = u.side === 0 ? 1 : -1;
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x,           y + r * dir);
    ctx.lineTo(x - r * 0.85, y - r * 0.7 * dir);
    ctx.lineTo(x + r * 0.85, y - r * 0.7 * dir);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 小 HP 条
    if (u.hp < u.hpMax) {
      const w = r * 2;
      const h = 1.5;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(x - r, y - r - 3, w, h);
      ctx.fillStyle = hpColor(u.hp / u.hpMax);
      ctx.fillRect(x - r, y - r - 3, w * (u.hp / u.hpMax), h);
    }
  }
}

function hpColor(p) {
  if (p > 0.66) return "#6fe091";
  if (p > 0.33) return "#f7c948";
  return "#ff5c5c";
}
