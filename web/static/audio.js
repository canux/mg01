// 音效系统：Web Audio API + 合成器兜底（无外部文件即可发声）
// 移动端注意：AudioContext 必须在用户手势内 resume，否则 iOS/Android 静音
//
// 用法：
//   const audio = new AudioManager();
//   document.addEventListener("pointerdown", () => audio.unlock(), { once: true });
//   audio.play("build");
//
// 替换为真实 SFX：把 .wav/.ogg 放到 web/static/sfx/，改 manifest.json，
//   AudioManager.loadManifest("/sfx/manifest.json") 自动覆盖合成器。

const SYNTH = {
  // [波形, 起始频率Hz, 终止频率Hz, 时长s, 增益, 滑音类型]
  tap:           ["square",   880,   880,  0.04, 0.18, "exp"],
  build:         ["triangle", 440,   880,  0.12, 0.25, "exp"],
  hero:          ["sawtooth", 110,   220,  0.35, 0.28, "exp"],
  death:         ["sine",     220,    80,  0.18, 0.22, "exp"],
  building_down: ["square",   180,    50,  0.30, 0.30, "exp"],
  castle_down:   ["sawtooth", 100,    25,  0.80, 0.40, "exp"],
  phase:         ["triangle", 660,  1320,  0.25, 0.22, "lin"],
  income:        ["square",  1320,  1760,  0.06, 0.12, "exp"],
  end_win:       ["triangle", 523,  1047,  0.50, 0.30, "lin"],
  end_lose:      ["sawtooth", 330,   147,  0.60, 0.30, "exp"],
  end_draw:      ["sine",     440,   440,  0.40, 0.22, "lin"],
};

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.unlocked = false;
    this.muted = localStorage.getItem("mg01.muted") === "1";
    this.buffers = new Map();   // name → AudioBuffer (file 覆盖优先)
    this._lastPlayedAt = new Map();  // name → ctx.currentTime；防 1 帧多发同声
  }

  /** iOS/Android 必须在用户手势内调用一次 */
  unlock() {
    if (this.unlocked) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      // 一些浏览器 ctx 创建即 suspended，必须 resume
      if (this.ctx.state === "suspended") this.ctx.resume();
      // 静默 buffer 推一下解锁
      const b = this.ctx.createBuffer(1, 1, 22050);
      const s = this.ctx.createBufferSource();
      s.buffer = b; s.connect(this.ctx.destination); s.start(0);
      this.unlocked = true;
    } catch (err) { console.warn("audio unlock failed", err); }
  }

  setMuted(v) {
    this.muted = !!v;
    localStorage.setItem("mg01.muted", v ? "1" : "0");
  }
  toggleMuted() { this.setMuted(!this.muted); return this.muted; }

  async loadManifest(url) {
    if (!this.ctx) return;
    try {
      const m = await fetch(url).then(r => r.ok ? r.json() : null).catch(() => null);
      if (!m) return;
      const tasks = Object.entries(m).map(async ([name, path]) => {
        if (name.startsWith("_") || typeof path !== "string") return;
        try {
          const url = path.startsWith("/") ? path : `/sfx/${path}`;
          const r = await fetch(url);
          if (!r.ok) return;          // 文件未提供 → 静默回落合成器
          const decoded = await this.ctx.decodeAudioData(await r.arrayBuffer());
          this.buffers.set(name, decoded);
        } catch (err) { /* 文件可选，缺失即静默回落 */ }
      });
      await Promise.all(tasks);
    } catch (err) { console.warn("manifest load fail", err); }
  }

  play(name, opts = {}) {
    if (this.muted || !this.ctx) return;
    if (this.ctx.state === "suspended") this.ctx.resume();
    // 防同帧多发同声爆音
    const now = this.ctx.currentTime;
    const last = this._lastPlayedAt.get(name) ?? 0;
    if (now - last < 0.03) return;
    this._lastPlayedAt.set(name, now);

    const buf = this.buffers.get(name);
    if (buf) { this._playBuffer(buf, opts); return; }
    const synth = SYNTH[name];
    if (synth) this._playSynth(synth, opts);
  }

  _playBuffer(buf, opts) {
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    g.gain.value = opts.gain ?? 0.6;
    src.buffer = buf;
    src.connect(g).connect(this.ctx.destination);
    src.start(0);
  }

  _playSynth([wave, f0, f1, dur, gain, slope], opts) {
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(f0, t0);
    if (slope === "exp") osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    else osc.frequency.linearRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain * (opts.gain ?? 1), t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
}
