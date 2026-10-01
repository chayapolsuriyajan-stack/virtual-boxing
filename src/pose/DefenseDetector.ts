import type { DefenseState, Evade } from '../game/types';
import type { Calibration } from './Calibration';
import { len, mid, shoulderWidth, sub } from './frame';
import type { PoseFrame } from './frame';

export const DEF_TUNE = { slip: 0.32, duck: 0.38, lean: 0.86, guardDist: 0.95, hysteresis: 0.7, hold: 0.05 };

export class DefenseDetector {
  private evade: Evade | null = null;
  private cand: Evade | null = null;
  private candT = 0;
  private cx: number;
  constructor(private cal: Calibration) { this.cx = cal.cx; }

  update(f: PoseFrame, punching: boolean): DefenseState {
    const sw = this.cal.sw;
    const sh = mid(f.sL, f.sR);
    const off = (f.nose.x - this.cx) / sw;
    const drop = (f.nose.y - this.cal.noseY) / sw;
    const ratio = shoulderWidth(f) / sw;

    const holding = this.evade;
    const k = (e: Evade) => (holding === e ? DEF_TUNE.hysteresis : 1);
    let want: Evade | null = null;
    if (drop > DEF_TUNE.duck * k('duck')) want = 'duck';
    else if (off < -DEF_TUNE.slip * k('slipL')) want = 'slipL';
    else if (off > DEF_TUNE.slip * k('slipR')) want = 'slipR';
    else if (!punching && ratio < 1 - (1 - DEF_TUNE.lean) * k('lean')) want = 'lean';

    // require the pose for a couple of frames to avoid flicker; release is immediate
    if (want === null) { this.evade = null; this.cand = null; this.candT = 0; }
    else if (want === this.evade) { /* hold */ }
    else if (want === this.cand) { if (f.t - this.candT >= DEF_TUNE.hold) { this.evade = want; } }
    else { this.cand = want; this.candT = f.t; }

    // slowly follow the body when the player is simply drifting side to side
    if (!this.evade) this.cx += (sh.x - this.cx) * 0.01;

    const dl = len(sub(f.wL, f.nose)) / sw, dr = len(sub(f.wR, f.nose)) / sw;
    const guard = dl < DEF_TUNE.guardDist && dr < DEF_TUNE.guardDist && !punching;
    return { guard, evade: this.evade };
  }
}
