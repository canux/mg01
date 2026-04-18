// Canvas 渲染：把引擎世界坐标（x∈[-300..300], y∈[-1500..1500]）映射到竖屏画布
// 世界原点在画布中心；+y 朝下 = Right 方向（Left 主城在上）
// 精灵：从 /sprites 加载配置 + 预加载图片；失败 / 未加载 fall back 到形状绘制

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

// 精灵绘制尺寸 (CSS px)。场景很小，值别设太大否则互相遮挡
const UNIT_DRAW_PX = {
  step: 22, range: 20, heavy: 28, siege: 30,
  flying: 24, caster: 20, legendary: 38,
};
const BUILDING_DRAW_PX = {
  castle: 54, tower: 28, barracks: 36, economy: 32, special: 34, legendary: 40,
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
    this.sprites = {};           // assetKey -> config
    this.images  = {};           // assetKey -> HTMLImageElement
    this.assetByEntity = {};     // `${kind}:${race}:${role/buildingKind}` -> assetKey (unused currently)
    this._resize();
    window.addEventListener("resize", () => this._resize());
  }

  async loadSprites() {
    try {
      const data = await fetch("/sprites").then(r => r.json());
      this.sprites = data.sprites || {};
      for (const [key, spec] of Object.entries(this.sprites)) {
        const img = new Image();
        img.decoding = "async";
        img.src = spec.path;
        this.images[key] = img;
      }
    } catch (err) {
      console.warn("sprites.json load failed; using shape fallback", err);
    }
  }

  _spriteFor(id) {
    const s = this.sprites[id];
    const img = this.images[id];
    if (!s || !img || !img.complete || img.naturalWidth === 0) return null;
    return { s, img };
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
    // 投射物（在单位之上）
    if (state.projectiles) for (const p of state.projectiles) this._drawProjectile(p);
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
    const drawPx = BUILDING_DRAW_PX[b.kind] ?? 30;

    const hit = this._spriteFor(b.assetKey);
    if (hit) {
      const { s, img } = hit;
      const ax = s.anchor?.x ?? 0.5;
      const ay = s.anchor?.y ?? 0.9;
      ctx.save();
      ctx.globalAlpha = b.ready ? 1 : 0.5;
      // 建筑按 side 不翻转（保持正立）
      ctx.drawImage(img, x - drawPx * ax, y - drawPx * ay, drawPx, drawPx);
      ctx.restore();
    } else {
      // fallback: 矩形 + glyph
      const color = RACE_COLOR[b.race] || "#888";
      const size = drawPx / 2;
      ctx.fillStyle = color;
      ctx.globalAlpha = b.ready ? 1 : 0.5;
      ctx.fillRect(x - size, y - size, size * 2, size * 2);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - size, y - size, size * 2, size * 2);
      ctx.fillStyle = "#fff";
      ctx.font = `${Math.round(size * 1.1)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const glyph = b.kind === "castle" ? "♛" : b.kind === "tower" ? "▲"
                  : b.kind === "economy" ? "$" : b.kind === "barracks" ? "⚔"
                  : b.kind === "legendary" ? "★" : "■";
      ctx.fillText(glyph, x, y + 1);
    }

    // HP 条（非主城，主城由 overlay 画大条）
    if (b.kind !== "castle" && b.hp < b.hpMax) {
      const w = drawPx;
      const h = 2.5;
      const yy = y - drawPx * 0.95;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(x - w / 2, yy, w, h);
      ctx.fillStyle = hpColor(b.hp / b.hpMax);
      ctx.fillRect(x - w / 2, yy, w * (b.hp / b.hpMax), h);
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
    const drawPx = UNIT_DRAW_PX[u.role] ?? 22;
    const r = ROLE_SIZE[u.role] || 5;

    const hit = this._spriteFor(u.assetKey);
    if (hit) {
      const { s, img } = hit;
      const ax = s.anchor?.x ?? 0.5;
      const ay = s.anchor?.y ?? 0.85;
      ctx.save();
      // Right 方向的单位水平镜像（朝 Left 看）——让双方朝中线对峙
      if (u.side === 1) {
        ctx.translate(x, y);
        ctx.scale(-1, 1);
        ctx.drawImage(img, -drawPx * ax, -drawPx * ay, drawPx, drawPx);
      } else {
        ctx.drawImage(img, x - drawPx * ax, y - drawPx * ay, drawPx, drawPx);
      }
      ctx.restore();
    } else {
      // fallback: 三角形朝前进方向
      const dir = u.side === 0 ? 1 : -1;
      const color = RACE_COLOR[u.race] || "#aaa";
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
    }

    // 小 HP 条
    if (u.hp < u.hpMax) {
      const w = drawPx * 0.8;
      const h = 1.5;
      const yy = y - drawPx * 0.9;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(x - w / 2, yy, w, h);
      ctx.fillStyle = hpColor(u.hp / u.hpMax);
      ctx.fillRect(x - w / 2, yy, w * (u.hp / u.hpMax), h);
    }
  }

  _drawProjectile(p) {
    const ctx = this.ctx;
    const x = this._wx(p.x);
    const y = this._wy(p.y);
    const tx = this._wx(p.tx);
    const ty = this._wy(p.ty);
    const dx = tx - x, dy = ty - y;
    const ang = Math.atan2(dy, dx);
    const color = p.side === 0 ? "#A8D5FF" : "#FFB39A";
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    if (p.visualKind === "arrow") {
      ctx.fillStyle = color;
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.moveTo(7, 0); ctx.lineTo(-5, 1.5); ctx.lineTo(-5, -1.5);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else if (p.visualKind === "bolt") {
      ctx.fillStyle = color;
      ctx.fillRect(-4, -1, 8, 2);
    } else if (p.visualKind === "shell") {
      ctx.fillStyle = "#666";
      ctx.strokeStyle = "#222";
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    } else { // magic
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 6);
      grad.addColorStop(0, color);
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function hpColor(p) {
  if (p > 0.66) return "#6fe091";
  if (p > 0.33) return "#f7c948";
  return "#ff5c5c";
}
