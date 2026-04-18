// HUD / DOM 叠加层：金币、时间、阶段、胜负 banner、日志、种族选择

const RACE_NAME_CN = {
  human: "人族", orc: "兽族", undead: "不死族", nightelf: "暗夜精灵",
};

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
    };
    this._lastEventT = -1;
    this._buildingsByRace = new Map();   // race -> array (cached)
    this.el.sheetClose.addEventListener("click", () => this.closeBuildSheet());
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
    this.el.btnNew.addEventListener("click", () => {
      cb(this.el.pickL.value, this.el.pickR.value, this.el.modeL.value, this.el.modeR.value);
    });
  }

  update(state) {
    const lp = state.players.find(p => p.side === 0);
    const rp = state.players.find(p => p.side === 1);
    if (lp) {
      this.el.goldL.textContent = lp.gold;
      this.el.incomeL.textContent = `+${lp.income}/10s`;
      this.el.raceL.textContent = RACE_NAME_CN[lp.race] ?? lp.race;
    }
    if (rp) {
      this.el.goldR.textContent = rp.gold;
      this.el.incomeR.textContent = `+${rp.income}/10s`;
      this.el.raceR.textContent = RACE_NAME_CN[rp.race] ?? rp.race;
    }

    this.el.timer.textContent    = state.t.toFixed(1) + "s";
    this.el.timerMax.textContent = state.maxT + "s";

    // 阶段推断（和引擎一致：120/180/240 切换）
    const phase = state.t < 120 ? 0 : state.t < 180 ? 1 : state.t < 240 ? 2 : 3;
    const phaseName = ["准备期", "攻城 I", "攻城 II", "末日"][phase];
    this.el.phase.textContent = `Phase ${phase} · ${phaseName}`;
    this.el.phase.className = `phase p${phase}`;

    // Banner
    if (state.ended) {
      this.el.banner.classList.remove("hidden", "left", "right", "draw");
      if (state.winner === 0) {
        this.el.banner.textContent = "LEFT WIN";
        this.el.banner.classList.add("left");
      } else if (state.winner === 1) {
        this.el.banner.textContent = "RIGHT WIN";
        this.el.banner.classList.add("right");
      } else {
        this.el.banner.textContent = "DRAW";
        this.el.banner.classList.add("draw");
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
  }
}
