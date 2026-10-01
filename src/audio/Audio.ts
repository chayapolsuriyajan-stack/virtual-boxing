/** Fully synthesized sound: no asset files needed. */
export class Sfx {
  private ctx?: AudioContext;
  private master?: GainNode;
  private crowdGain?: GainNode;
  muted = false;

  /** must be called from a user gesture */
  init() {
    if (this.ctx) { void this.ctx.resume(); return; }
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(this.ctx.destination);
    // crowd: looping filtered noise
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise(2);
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 0.6;
    this.crowdGain = this.ctx.createGain();
    this.crowdGain.gain.value = 0.05;
    src.connect(f).connect(this.crowdGain).connect(this.master);
    src.start();
  }

  private noiseBuf?: AudioBuffer;
  private noise(sec: number) {
    if (this.noiseBuf) return this.noiseBuf;
    const c = this.ctx!;
    const b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return (this.noiseBuf = b);
  }

  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private burst(freq: number, q: number, type: BiquadFilterType, peak: number, dur: number, slide = 0) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource();
    s.buffer = this.noise(2);
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    const g = c.createGain();
    this.env(g, t, 0.005, peak, dur);
    s.connect(f).connect(g).connect(this.master!);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  private tone(f0: number, f1: number, peak: number, dur: number, type: OscillatorType = 'sine', at = 0) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    this.env(g, t, 0.004, peak, dur);
    o.connect(g).connect(this.master!);
    o.start(t); o.stop(t + dur + 0.05);
  }

  swish(power: number) { this.burst(1800, 1.2, 'bandpass', 0.12 + power * 0.12, 0.14, -900); }
  hit(power: number, head = true) {
    this.burst(head ? 700 : 400, 0.8, 'lowpass', 0.5 + power * 0.5, 0.16);
    this.tone(head ? 150 : 110, 45, 0.7 + power * 0.3, 0.2);
    if (power > 0.7) this.crowd(0.5);
  }
  block() { this.burst(1200, 2, 'bandpass', 0.35, 0.1); this.tone(260, 160, 0.2, 0.08, 'square'); }
  playerHit(dmg: number) { this.burst(500, 0.8, 'lowpass', 0.8, 0.22); this.tone(95, 35, 0.9, 0.28); this.crowd(Math.min(1, dmg / 12)); }
  whoosh() { this.burst(900, 1, 'bandpass', 0.1, 0.25, 700); }
  tell() { this.tone(880, 880, 0.12, 0.07, 'triangle'); }
  dodge() { this.tone(520, 900, 0.14, 0.12, 'triangle'); this.crowd(0.25); }
  beep() { this.tone(660, 660, 0.18, 0.12, 'square'); }
  bell(n = 1) {
    for (let i = 0; i < n; i++) {
      for (const [f, p] of [[880, 0.3], [1320, 0.18], [2210, 0.1]] as const) this.tone(f, f * 0.99, p, 1.4, 'sine', i * 0.28);
    }
  }
  knockdown() { this.tone(80, 30, 1, 0.5); this.burst(300, 0.7, 'lowpass', 0.9, 0.4); this.crowd(1); }
  crowd(amount: number) {
    if (!this.ctx || !this.crowdGain) return;
    const g = this.crowdGain.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.05 + amount * 0.25, t + 0.1);
    g.linearRampToValueAtTime(0.05, t + 1.8);
  }
}
