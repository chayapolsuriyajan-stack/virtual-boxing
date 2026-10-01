import { mid, shoulderWidth } from './frame';
import type { PoseFrame } from './frame';

export interface Calibration {
  sw: number;        // shoulder width in pixels
  cx: number;        // body centre x
  noseY: number;
  noseZ: number;
  lead: 'L' | 'R';   // lead hand (orthodox = left)
}

/** Averages ~1.5 s of steady guard-stance frames. */
export class Calibrator {
  private n = 0;
  private acc = { sw: 0, cx: 0, noseY: 0, noseZ: 0, zDiff: 0 };
  private sx = { min: Infinity, max: -Infinity };
  add(f: PoseFrame) {
    const m = mid(f.sL, f.sR);
    this.acc.sw += shoulderWidth(f);
    this.acc.cx += m.x;
    this.acc.noseY += f.nose.y;
    this.acc.noseZ += f.nose.z - m.z;
    this.acc.zDiff += f.wR.z - f.wL.z; // >0 → left wrist closer → left lead
    this.sx.min = Math.min(this.sx.min, m.x); this.sx.max = Math.max(this.sx.max, m.x);
    this.n++;
  }
  get count() { return this.n; }
  /** how much the player moved while calibrating (px) */
  get wobble() { return this.sx.max - this.sx.min; }
  finish(stanceOverride?: 'L' | 'R'): Calibration {
    const n = Math.max(1, this.n);
    const sw = this.acc.sw / n;
    const zd = this.acc.zDiff / n / sw;
    return {
      sw, cx: this.acc.cx / n, noseY: this.acc.noseY / n, noseZ: this.acc.noseZ / n,
      lead: stanceOverride ?? (zd < -0.25 ? 'R' : 'L'),
    };
  }
}
