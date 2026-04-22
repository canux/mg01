// HUD / DOM 叠加层：金币、时间、阶段、胜负 banner、日志、种族选择

const RACE_NAME_CN = {
  human: "人族", orc: "兽族", undead: "不死族", nightelf: "暗夜精灵",
};

// ---- 触感反馈：移动端 navigator.vibrate；桌面端给 #app 加 CSS shake class ----
const _canVibrate = typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
function _shake(strength) {
  const app = document.getElementById("app");
  if (!app) return;
  const cls = strength === "long" ? "shake-long" : "shake-tap";
  app.classList.remove("shake-tap", "shake-long");
  // 强制重排以重启动画
  void app.offsetWidth;
  app.classList.add(cls);
  setTimeout(() => app.classList.remove(cls), strength === "long" ? 500 : 180);
}
export function hapticTap() {
  if (_canVibrate) navigator.vibrate(20);
  else _shake("tap");
}
export function hapticLong() {
  if (_canVibrate) navigator.vibrate([0, 80, 40, 120]);
  else _shake("long");
}

export class HUD {
  constructor() {
    this.el = {
      goldL:    document.getElementById("gold-left"),
      goldR:    document.getElementById("gold-right"),
      incomeL:  document.getElementById("income-left"),
      incomeR:  document.getElementById("income-right"),
      raceL:    document.getElementById("race-left"),
      raceR:    document.getElementById("race-right"),
      timer:    document.getElementById("timer"),
      timerMax: document.getElementById("timer-max"),
      phase:    document.getElementById("phase"),
      banner:   document.getElementById("banner"),
      log:      document.getElementById("log"),
      pickL:    document.getElementById("pick-left"),
      pickR:    document.getElementById("pick-right"),
      modeL:    document.getElementById("mode-left"),
      modeR:    document.getElementById("mode-right"),
      btnNew:   document.getElementById("btn-new"),
      sheet:    document.getElementById("build-sheet"),
      sheetSlot:document.getElementById("sheet-slot"),
      sheetList:document.getElementById("sheet-list"),
      sheetClose:document.getElementById("sheet-close"),
      speedbar: document.getElementById("speedbar"),
      heroL:    document.getElementById("hero-left"),
      heroR:    document.getElementById("hero-right"),
      logPanel: document.getElementById("log-panel"),
      logTabs:  document.getElementById("log-tabs"),
      winTitle: document.getElementById("win-title"),
      winRaceL: document.getElementById("win-race-l"),
      winRaceR: document.getElementById("win-race-r"),
      winSpawnL:document.getElementById("win-spawn-l"),
      winSpawnR:document.getElementById("win-spawn-r"),
      winGoldL: document.getElementById("win-gold-l"),
      winGoldR: document.getElementById("win-gold-r"),
      btnRematch: document.getElementById("btn-rematch"),
      btnReplaySave:   document.getElementById("btn-replay-save"),
      btnReplayVerify: document.getElementById("btn-replay-verify"),
      replayStatus:    document.getElementById("replay-status"),
      myside:   document.getElementById("myside"),
      readyOverlay: document.getElementById("ready-overlay"),
      readyL:   document.getElementById("ready-l"),
      readyR:   document.getElementById("ready-r"),
      btnReady: document.getElementById("btn-ready"),
      dcToast:  document.getElementById("disconnect-toast"),
      btnForfeit: document.getElementById("btn-forfeit"),
    };
    this._lastEventT = -1;
    this._lastGold = { 0: null, 1: null };
    this._buildingsByRace = new Map();   // race -> array (cached)
    this._my = { clientId: null, side: null, token: null };
    this._authHeaders = () => ({});
    this.el.sheetClose.addEventListener("click", () => this.closeBuildSheet());
    this.el.speedbar.addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-rate]");
      if (!btn) return;
      const rate = btn.getAttribute("data-rate");
      await fetch(`/speed?rate=${rate}`, { method: "POST", headers: this._authHeaders() }).catch(() => {});
    });
    this.el.heroL.addEventListener("click", () => this._hireHero(0));
    this.el.heroR.addEventListener("click", () => this._hireHero(1));
    this.el.btnForfeit.addEventListener("click", () => this._forfeit());
    this._myReady = false;
    this.el.btnReady.addEventListener("click", () => {
      this._myReady = !this._myReady;
      this._toggleReady(this._myReady);
    });
    this._setupHotkeys();
    this.el.logTabs.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-kind]");
      if (!btn) return;
      for (const b of this.el.logTabs.querySelectorAll("button")) b.classList.remove("active");
      btn.classList.add("active");
      this.el.logPanel.dataset.filter = btn.dataset.kind;
    });
  }

  _updateGold(player, goldEl) {
    const prev = this._lastGold[player.side];
    goldEl.textContent = player.gold;
    if (prev !== null && player.gold !== prev) {
      const diff = player.gold - prev;
      const fx = document.createElement("span");
      fx.className = "gold-fx " + (diff > 0 ? "plus" : "minus");
      fx.textContent = (diff > 0 ? "+" : "") + diff;
      goldEl.parentElement.appendChild(fx);
      setTimeout(() => fx.remove(), 900);
    }
    this._lastGold[player.side] = player.gold;
  }

  setMySession(my) {
    this._my = my;
    for (const cls of ["me-left", "me-right"]) document.body.classList.remove(cls);
    if (my.side === 0) document.body.classList.add("me-left");
    if (my.side === 1) document.body.classList.add("me-right");
    this.el.myside.classList.remove("left", "right", "spec");
    if (my.side === 0)      { this.el.myside.textContent = "你是 L"; this.el.myside.classList.add("left"); }
    else if (my.side === 1) { this.el.myside.textContent = "你是 R"; this.el.myside.classList.add("right"); }
    else                    { this.el.myside.textContent = "观战";   this.el.myside.classList.add("spec"); }
  }

  /** 当前 player 是否能操作此 side（自己 side + mode=player） */
  _canControl(side, mode) {
    return mode === "player" && this._my.side === side;
  }

  setAuth(headersFn) { this._authHeaders = headersFn; }

  async _hireHero(side) {
    const r = await fetch(`/hero?side=${side}`, { method: "POST", headers: this._authHeaders() })
      .then(r => r.json()).catch(err => ({ ok: false, reason: String(err) }));
    if (!r.ok) console.warn("hero hire failed:", r.reason);
    else hapticTap();
  }

  async _forfeit() {
    if (!confirm("确认投降？本局将判负。")) return;
    const r = await fetch("/forfeit", { method: "POST", headers: this._authHeaders() })
      .then(r => r.json()).catch(err => ({ ok: false, reason: String(err) }));
    if (!r.ok) console.warn("forfeit failed:", r.reason);
  }

  /** 桌面键盘快捷键：1-5 切速 / 空格 暂停↔上次速度 / r ready / h 叫英雄 / f 投降 / Esc 关面板 */
  _setupHotkeys() {
    this._lastNonZeroRate = 1;
    document.addEventListener("keydown", (e) => {
      // 输入态不抢键
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const rates = ["0", "0.5", "1", "2", "4"];
      const key = e.key;
      if (/^[1-5]$/.test(key)) {
        const rate = rates[Number(key) - 1];
        if (rate !== "0") this._lastNonZeroRate = Number(rate);
        this._applyRate(rate); e.preventDefault(); return;
      }
      if (key === " " || e.code === "Space") {
        const cur = this._lastSeenSpeed ?? 1;
        this._applyRate(cur > 0 ? "0" : String(this._lastNonZeroRate));
        e.preventDefault(); return;
      }
      if (key === "Escape") { this.closeBuildSheet(); return; }
      if (key === "r" || key === "R") {
        if (this._my.side === null) return;
        this._myReady = !this._myReady; this._toggleReady(this._myReady);
        e.preventDefault(); return;
      }
      if (key === "h" || key === "H") {
        if (this._my.side === null) return;
        this._hireHero(this._my.side); e.preventDefault(); return;
      }
      if (key === "f" || key === "F") {
        if (this._my.side === null) return;
        this._forfeit(); e.preventDefault(); return;
      }
    });
  }

  async _applyRate(rate) {
    await fetch(`/speed?rate=${rate}`, { method: "POST", headers: this._authHeaders() }).catch(() => {});
  }

  _refreshForfeit(state) {
    const mySide = this._my.side;
    const myMode = mySide === 0 ? state.modes?.left : mySide === 1 ? state.modes?.right : null;
    const canShow = mySide !== null && myMode === "player" && !state.ended && state.t > 0;
    this.el.btnForfeit.classList.toggle("hidden", !canShow);
  }

  /** 胜负状态首次变为 ended → 触发触感反馈。每次 state.ended 从 false 变 true 触发一次。 */
  _detectMatchEnd(state) {
    const now = !!state.ended;
    if (now && !this._endedBefore) hapticLong();
    this._endedBefore = now;
  }

  _refreshReady(state) {
    const rd = state.ready ?? { left: true, right: true, all: true };
    // 游戏已开或已结 → 隐藏
    if (rd.all || state.t > 0 || state.ended) {
      this.el.readyOverlay.classList.add("hidden");
      return;
    }
    this.el.readyOverlay.classList.remove("hidden");
    const label = (side, mode, ready) =>
      mode === "ai" ? `${side} · AI` : (ready ? `${side} · 已准备` : `${side} · 未准备`);
    this.el.readyL.textContent = label("L", state.modes?.left,  rd.left);
    this.el.readyR.textContent = label("R", state.modes?.right, rd.right);
    this.el.readyL.classList.toggle("go", rd.left  || state.modes?.left  === "ai");
    this.el.readyR.classList.toggle("go", rd.right || state.modes?.right === "ai");
    // 按钮仅给 player side 的玩家看
    const mySide = this._my.side;
    const myMode = mySide === 0 ? state.modes?.left : mySide === 1 ? state.modes?.right : null;
    const myRdy  = mySide === 0 ? rd.left : mySide === 1 ? rd.right : false;
    this._myReady = !!myRdy;
    if (mySide === null || myMode !== "player") {
      this.el.btnReady.textContent = "观战中...";
      this.el.btnReady.disabled = true;
    } else {
      this.el.btnReady.disabled = false;
      this.el.btnReady.textContent = myRdy ? "取消准备" : "准备";
    }
  }

  _refreshDisconnect(state) {
    const dc = state.disconnect;
    if (!dc || (dc.left === null && dc.right === null) || state.ended) {
      this.el.dcToast.classList.add("hidden");
      return;
    }
    const lines = [];
    if (dc.left  !== null) lines.push(`L 断线 ${dc.left.toFixed(1)}s 后判负`);
    if (dc.right !== null) lines.push(`R 断线 ${dc.right.toFixed(1)}s 后判负`);
    this.el.dcToast.textContent = lines.join(" · ");
    this.el.dcToast.classList.remove("hidden");
  }

  async _toggleReady(wantReady) {
    const r = await fetch(`/ready?ready=${wantReady ? "true" : "false"}`, { method: "POST", headers: this._authHeaders() })
      .then(r => r.json()).catch(err => ({ ok: false, reason: String(err) }));
    if (!r.ok) console.warn("ready failed:", r.reason);
  }

  _refreshHeroBtn(btn, hero, gold, mode, side) {
    btn.classList.remove("ready", "cooldown");
    if (!hero) {
      btn.disabled = true;
      btn.querySelector(".hero-name").textContent = "—";
      btn.querySelector(".hero-sub").textContent  = "无英雄";
      return;
    }
    const canCtl = this._canControl(side, mode);
    btn.querySelector(".hero-name").textContent = hero.nameCn;
    if (hero.alive) {
      btn.disabled = true;
      btn.querySelector(".hero-sub").textContent = "在场";
    } else if (hero.reviveIn > 0) {
      btn.disabled = true;
      btn.classList.add("cooldown");
      btn.querySelector(".hero-sub").textContent = `复活 ${hero.reviveIn.toFixed(0)}s`;
    } else {
      const afford = gold >= hero.nextCost;
      btn.disabled = !afford || !canCtl;
      btn.classList.toggle("ready", afford && canCtl);
      btn.querySelector(".hero-sub").textContent = `召唤 ${hero.nextCost}g`;
    }
  }

  modes() {
    return { left: this.el.modeL.value, right: this.el.modeR.value };
  }

  async openBuildSheet(slot, raceForSide, currentGold, onPick) {
    let list = this._buildingsByRace.get(raceForSide);
    if (!list) {
      try {
        list = await fetch(`/buildings?race=${encodeURIComponent(raceForSide)}`).then(r => r.json());
        this._buildingsByRace.set(raceForSide, list);
      } catch {
        list = [];
      }
    }
    this.el.sheetSlot.textContent = `#${slot.idx} · ${slot.side === 0 ? "L" : "R"}`;
    this.el.sheetList.innerHTML = "";
    for (const b of list) {
      const li = document.createElement("li");
      const afford = currentGold >= b.cost;
      if (!afford) li.classList.add("unaffordable");
      li.innerHTML =
        `<span class="nm">${b.nameCn}</span>` +
        `<span class="kind">${b.kind}${b.spawns ? ` · ${b.buildTimeSec}s` : ""}</span>` +
        `<span class="cost">${b.cost}g</span>`;
      if (afford) {
        li.addEventListener("click", () => {
          onPick(b.id);
          this.closeBuildSheet();
        });
      }
      this.el.sheetList.appendChild(li);
    }
    this.el.sheet.classList.remove("hidden");
  }

  closeBuildSheet() { this.el.sheet.classList.add("hidden"); }

  async populatePickers() {
    try {
      const r = await fetch("/races").then(r => r.json());
      for (const race of r) {
        const opL = document.createElement("option");
        opL.value = race.id; opL.textContent = race.nameCn;
        this.el.pickL.appendChild(opL);
        const opR = opL.cloneNode(true);
        this.el.pickR.appendChild(opR);
      }
      this.el.pickL.value = "human";
      this.el.pickR.value = "orc";
    } catch {
      // fallback
      for (const id of ["human","orc","undead","nightelf"]) {
        const opL = new Option(RACE_NAME_CN[id] ?? id, id);
        const opR = new Option(RACE_NAME_CN[id] ?? id, id);
        this.el.pickL.appendChild(opL);
        this.el.pickR.appendChild(opR);
      }
      this.el.pickL.value = "human";
      this.el.pickR.value = "orc";
    }
  }

  onNewGame(cb) {
    const fire = () => cb(this.el.pickL.value, this.el.pickR.value, this.el.modeL.value, this.el.modeR.value);
    this.el.btnNew.addEventListener("click", fire);
    this.el.btnRematch.addEventListener("click", fire);
    this.el.btnReplaySave.addEventListener("click", () => this._downloadReplay());
    this.el.btnReplayVerify.addEventListener("click", () => this._verifyReplay());
  }

  async _downloadReplay() {
    this.el.replayStatus.textContent = "下载中…";
    try {
      const r = await fetch("/replay/last").then(r => r.json());
      if (!r.ok) { this.el.replayStatus.textContent = "失败：" + r.reason; return; }
      const rec = r.recording;
      const name = `replay-${rec.config.l}-vs-${rec.config.r}-${new Date(rec.startedAt).toISOString().slice(0,19).replace(/[T:]/g,"")}.json`;
      const blob = new Blob([JSON.stringify(rec)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      a.click();
      URL.revokeObjectURL(url);
      const size = new Blob([JSON.stringify(rec)]).size;
      this.el.replayStatus.textContent = `已下载 ${name} (${size}B)`;
    } catch (err) { this.el.replayStatus.textContent = "失败：" + err; }
  }

  async _verifyReplay() {
    this.el.replayStatus.textContent = "服务端重放中…";
    try {
      const r = await fetch("/replay/verify", { method: "POST" }).then(r => r.json());
      if (!r.ok && r.matched === undefined) { this.el.replayStatus.textContent = "失败：" + r.reason; return; }
      const m = r.matched;
      const tag = r.ok ? "✓ 校验通过" : "✗ 校验失败";
      this.el.replayStatus.textContent =
        `${tag}  digest=${m.digest?"✓":"✗"} winner=${m.winner?"✓":"✗"} t=${m.finalT?"✓":"✗"}  应用指令 ${r.cmdsApplied}/${r.cmdsApplied + r.cmdsFailed}`;
    } catch (err) { this.el.replayStatus.textContent = "失败：" + err; }
  }

  update(state) {
    const lp = state.players.find(p => p.side === 0);
    const rp = state.players.find(p => p.side === 1);
    if (lp) {
      this._updateGold(lp, this.el.goldL);
      this.el.incomeL.textContent = `+${lp.income}/10s`;
      this.el.raceL.textContent = RACE_NAME_CN[lp.race] ?? lp.race;
    }
    if (rp) {
      this._updateGold(rp, this.el.goldR);
      this.el.incomeR.textContent = `+${rp.income}/10s`;
      this.el.raceR.textContent = RACE_NAME_CN[rp.race] ?? rp.race;
    }
    this._refreshHeroBtn(this.el.heroL, lp?.hero, lp?.gold ?? 0, state.modes?.left  ?? "ai", 0);
    this._refreshHeroBtn(this.el.heroR, rp?.hero, rp?.gold ?? 0, state.modes?.right ?? "ai", 1);
    this._refreshForfeit(state);
    this._detectMatchEnd(state);
    this._refreshReady(state);
    this._refreshDisconnect(state);

    this.el.timer.textContent    = state.t.toFixed(1) + "s";
    this.el.timerMax.textContent = state.maxT + "s";

    // speed bar highlight
    const curSpeed = state.speed ?? 1;
    this._lastSeenSpeed = curSpeed;
    if (curSpeed > 0) this._lastNonZeroRate = curSpeed;
    for (const btn of this.el.speedbar.querySelectorAll("button[data-rate]")) {
      const r = Number(btn.getAttribute("data-rate"));
      btn.classList.toggle("active", r === curSpeed);
    }

    // 阶段推断（和引擎一致：120/180/240 切换）
    const phase = state.t < 120 ? 0 : state.t < 180 ? 1 : state.t < 240 ? 2 : 3;
    const phaseName = ["准备期", "攻城 I", "攻城 II", "末日"][phase];
    this.el.phase.textContent = `Phase ${phase} · ${phaseName}`;
    this.el.phase.className = `phase p${phase}`;

    // Banner (胜负卡片)
    if (state.ended) {
      this.el.banner.classList.remove("hidden", "left", "right", "draw");
      if (state.winner === 0)       { this.el.winTitle.textContent = "LEFT WIN";  this.el.banner.classList.add("left"); }
      else if (state.winner === 1)  { this.el.winTitle.textContent = "RIGHT WIN"; this.el.banner.classList.add("right"); }
      else                          { this.el.winTitle.textContent = "DRAW";      this.el.banner.classList.add("draw"); }
      if (lp) {
        this.el.winRaceL.textContent  = RACE_NAME_CN[lp.race] ?? lp.race;
        this.el.winSpawnL.textContent = lp.unitsSpawned;
        this.el.winGoldL.textContent  = lp.gold;
      }
      if (rp) {
        this.el.winRaceR.textContent  = RACE_NAME_CN[rp.race] ?? rp.race;
        this.el.winSpawnR.textContent = rp.unitsSpawned;
        this.el.winGoldR.textContent  = rp.gold;
      }
    } else {
      this.el.banner.classList.add("hidden");
    }

    // 日志：只新增 t > lastEventT 的
    for (const ev of state.events) {
      if (ev.t <= this._lastEventT) continue;
      this._lastEventT = ev.t;
      const li = document.createElement("li");
      li.className = ev.kind;
      li.textContent = `[${ev.t.toFixed(1)}s] ${ev.kind.padEnd(7, " ")} ${ev.msg}`;
      this.el.log.prepend(li);
      while (this.el.log.childElementCount > 40) {
        this.el.log.removeChild(this.el.log.lastElementChild);
      }
    }
  }

  clearLog() {
    this.el.log.innerHTML = "";
    this._lastEventT = -1;
    this._lastGold = { 0: null, 1: null };
  }
}
