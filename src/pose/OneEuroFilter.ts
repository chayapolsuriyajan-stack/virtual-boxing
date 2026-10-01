/** 1€ filter: low jitter when still, low lag when moving fast (Casiez et al.) */
export class OneEuro {
  private x?: number;
  private dx = 0;
  private t?: number;
  constructor(private minCutoff = 1.6, private beta = 0.08, private dCutoff = 1) {}
  private alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(v: number, t: number): number {
    if (this.x === undefined || this.t === undefined) { this.x = v; this.t = t; return v; }
    const dt = Math.max(1e-3, t - this.t);
    const rawD = (v - this.x) / dt;
    this.dx += this.alpha(this.dCutoff, dt) * (rawD - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += this.alpha(cutoff, dt) * (v - this.x);
    this.t = t;
    return this.x;
  }
  reset() { this.x = undefined; this.t = undefined; this.dx = 0; }
}
