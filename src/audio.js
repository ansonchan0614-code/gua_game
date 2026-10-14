// Synthesized audio (no sample files): ambient hum, rifle shots with room reverb,
// enemy shots, hit markers, reload clicks, explosion with tinnitus ring.
export class Audio {
  constructor() { this.ctx = null; this.master = null; this.verb = null; this.ring = null; }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = ctx.createGain(); this.master.gain.value = 0.9;
      // simple feedback-delay "room"
      this.verb = ctx.createGain(); this.verb.gain.value = 0.35;
      const d1 = ctx.createDelay(1); d1.delayTime.value = 0.07;
      const d2 = ctx.createDelay(1); d2.delayTime.value = 0.113;
      const fb = ctx.createGain(); fb.gain.value = 0.42;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
      this.verb.connect(d1); d1.connect(lp); lp.connect(fb); fb.connect(d2); d2.connect(d1); lp.connect(this.master);
      this.master.connect(ctx.destination);
      this.hum();
      this.noiseBuf = this.makeNoise();
    } catch (e) { /* no audio */ }
  }

  makeNoise() {
    const len = this.ctx.sampleRate * 1.5, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  hum() {
    const ctx = this.ctx;
    const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 60;
    const g1 = ctx.createGain(); g1.gain.value = 0; o1.connect(g1).connect(this.master); o1.start();
    g1.gain.linearRampToValueAtTime(0.02, ctx.currentTime + 1.5);
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 120;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    const g2 = ctx.createGain(); g2.gain.value = 0; o2.connect(f).connect(g2).connect(this.master); o2.start();
    g2.gain.linearRampToValueAtTime(0.008, ctx.currentTime + 1.5);
    // fluorescent buzz
    const o3 = ctx.createOscillator(); o3.type = 'square'; o3.frequency.value = 100;
    const f3 = ctx.createBiquadFilter(); f3.type = 'bandpass'; f3.frequency.value = 2400; f3.Q.value = 8;
    const g3 = ctx.createGain(); g3.gain.value = 0; o3.connect(f3).connect(g3).connect(this.master); o3.start();
    g3.gain.linearRampToValueAtTime(0.004, ctx.currentTime + 2);
  }

  noiseBurst(dur, gain, filterFreq, type = 'lowpass', dest) {
    const ctx = this.ctx, t0 = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(dest || this.master); src.start(t0); src.stop(t0 + dur + 0.05);
    return g;
  }

  rifleShot() {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    // crack
    this.noiseBurst(0.09, 0.5, 3200, 'highpass');
    this.noiseBurst(0.18, 0.35, 900, 'lowpass', this.verb);
    // body thump
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(180, t0); o.frequency.exponentialRampToValueAtTime(45, t0 + 0.08);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.35, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
    o.connect(g).connect(this.master); o.start(t0); o.stop(t0 + 0.13);
  }

  sniperShot() {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    this.noiseBurst(0.14, 0.7, 2200, 'highpass');
    this.noiseBurst(0.6, 0.45, 600, 'lowpass', this.verb);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(120, t0); o.frequency.exponentialRampToValueAtTime(35, t0 + 0.25);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.6, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
    o.connect(g).connect(this.master); o.start(t0); o.stop(t0 + 0.36);
  }

  dryFire() {
    if (!this.ctx) return;
    this.noiseBurst(0.03, 0.15, 2500, 'bandpass');
  }

  enemyShot(dist) {
    if (!this.ctx) return;
    const v = Math.max(0.05, 1 - dist / 40);
    this.noiseBurst(0.08, 0.25 * v, 1800, 'bandpass', this.verb);
    const ctx = this.ctx, t0 = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(300, t0); o.frequency.exponentialRampToValueAtTime(80, t0 + 0.07);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.12 * v, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.1);
    o.connect(g).connect(this.master); o.start(t0); o.stop(t0 + 0.11);
  }

  hitMarker(head) {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = head ? 1800 : 1200;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.06, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);
    o.connect(g).connect(this.master); o.start(t0); o.stop(t0 + 0.06);
  }

  reloadClick(phase) {
    if (!this.ctx) return;
    this.noiseBurst(0.04, phase ? 0.2 : 0.12, phase ? 1200 : 600, 'bandpass');
  }

  bolt() { if (!this.ctx) return; this.noiseBurst(0.06, 0.18, 900, 'bandpass'); setTimeout(() => this.noiseBurst(0.05, 0.2, 1400, 'bandpass'), 180); }

  pickup() {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(600, t0); o.frequency.setValueAtTime(900, t0 + 0.07);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.08, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
    o.connect(g).connect(this.master); o.start(t0); o.stop(t0 + 0.2);
  }

  explosion(dist) {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const v = Math.max(0.15, 1 - dist / 30);
    this.noiseBurst(0.9, 1.2 * v, 400, 'lowpass');
    this.noiseBurst(0.25, 0.6 * v, 3000, 'highpass');
    this.noiseBurst(1.6, 0.5 * v, 300, 'lowpass', this.verb);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(70, t0); o.frequency.exponentialRampToValueAtTime(25, t0 + 0.6);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.9 * v, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.7);
    o.connect(g).connect(this.master); o.start(t0); o.stop(t0 + 0.72);
    if (dist < 8) this.tinnitus();
  }

  tinnitus() {
    const ctx = this.ctx, t0 = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 3800;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.2);
    o.connect(g).connect(this.master); o.start(t0); o.stop(t0 + 2.3);
    // duck master briefly
    this.master.gain.setValueAtTime(0.25, t0); this.master.gain.linearRampToValueAtTime(0.9, t0 + 2.0);
  }

  hurt() {
    if (!this.ctx) return;
    this.noiseBurst(0.15, 0.2, 500, 'lowpass');
  }
}
