import type { Aim, Hand, Lane, PunchEvent, PunchType } from '../game/types';
import type { Calibration } from './Calibration';
import { elbowAngle, len, mid, shoulderWidth, sub } from './frame';
import type { PoseFrame, V3 } from './frame';

export const TUNE = {
  launchSpeed: 3.2,     // shoulder-widths / s
  minTravel: 0.55,      // shoulder-widths the wrist must cover
  maxDuration: 0.55,    // s from launch to peak
  straightAngle: 148,   // elbow angle (deg) that counts as extended
  hookAngle: 135,       // below this the arm is bent like a hook / uppercut
  cooldown: 0.18,
  speedForMaxPower: 10,
};

type St = 'idle' | 'active' | 'retract';

class HandTracker {
  st: St = 'idle';
  prev?: V3; prevT = 0; v = 0;
  start: V3 = { x: 0, y: 0, z: 0 }; startT = 0; startAngle = 0; startRatio = 1; peakV = 0; maxTravel = 0;
  coolUntil = 0;
  constructor(public hand: Hand) {}
}

export class PunchDetector {
  private trk = { L: new HandTracker('L'), R: new HandTracker('R') };
  /** set while a punch is in flight (used by the defense detector to ignore shoulder turn) */
  active = false;
  lastSpeed = { L: 0, R: 0 };
  lastAngle = { L: 180, R: 180 };

  constructor(public cal: Calibration) {}

  update(f: PoseFrame): PunchEvent[] {
    const out: PunchEvent[] = [];
    const sw = this.cal.sw;
    for (const h of ['L', 'R'] as const) {
      const ev = this.hand(h, f, sw);
      if (ev) out.push(ev);
    }
    this.active = this.trk.L.st === 'active' || this.trk.R.st === 'active';
    return out;
  }

  private hand(h: Hand, f: PoseFrame, sw: number): PunchEvent | null {
    const tr = this.trk[h];
    const s = h === 'L' ? f.sL : f.sR, e = h === 'L' ? f.eL : f.eR, w = h === 'L' ? f.wL : f.wR;
    const rel: V3 = { x: (w.x - s.x) / sw, y: (w.y - s.y) / sw, z: (w.z - s.z) / sw };
    const angle = elbowAngle(s, e, w);
    this.lastAngle[h] = angle;
    if (!tr.prev) { tr.prev = rel; tr.prevT = f.t; return null; }
    const dt = Math.max(1e-3, f.t - tr.prevT);
    const inst = len(sub(rel, tr.prev)) / dt;
    tr.v += 0.6 * (inst - tr.v); // light extra smoothing
    tr.prev = rel; tr.prevT = f.t;
    this.lastSpeed[h] = tr.v;
    const ratio = shoulderWidth(f) / sw;

    switch (tr.st) {
      case 'idle':
        if (f.t >= tr.coolUntil && tr.v > TUNE.launchSpeed) {
          // tr.start is the last slow (resting) position, so travel is measured from the guard
          tr.st = 'active'; tr.startT = f.t; tr.startAngle = angle; tr.startRatio = ratio; tr.peakV = tr.v; tr.maxTravel = 0;
        } else if (tr.v < 0.8) tr.start = { ...rel };
        break;
      case 'active': {
        tr.peakV = Math.max(tr.peakV, tr.v);
        const travel = len(sub(rel, tr.start));
        tr.maxTravel = Math.max(tr.maxTravel, travel);
        const dur = f.t - tr.startT;
        const decel = tr.v < tr.peakV * 0.45;
        const extended = angle > TUNE.straightAngle && tr.v < tr.peakV * 0.7;
        if ((decel || extended) && travel >= TUNE.minTravel || (dur > TUNE.maxDuration && travel >= TUNE.minTravel)) {
          const ev = this.fire(h, f, rel, angle, ratio);
          tr.st = 'retract'; tr.coolUntil = f.t + TUNE.cooldown;
          return ev;
        }
        if (dur > TUNE.maxDuration || (decel && travel < TUNE.minTravel * 0.6)) { tr.st = 'idle'; tr.coolUntil = f.t + 0.1; }
        break;
      }
      case 'retract': {
        const back = len(sub(rel, tr.start));
        if (f.t >= tr.coolUntil && (back < 0.6 || tr.v < 0.6)) { tr.st = 'idle'; }
        break;
      }
    }
    return null;
  }

  private fire(h: Hand, f: PoseFrame, rel: V3, angle: number, ratio: number): PunchEvent | null {
    const tr = this.trk[h];
    const d = sub(rel, tr.start);
    const total = len(d) || 1;
    const lateral = Math.abs(d.x);
    const up = -d.y;
    const nose = f.nose;
    const sh = mid(f.sL, f.sR);
    const sw = this.cal.sw;
    const wy = (h === 'L' ? f.wL.y : f.wR.y);
    // arms thrown overhead are waving, not punching
    if (wy < nose.y - 0.6 * sw) return null;

    let type: PunchType;
    if (up > 0.55 * total && up > 0.4 && angle < TUNE.straightAngle) type = 'uppercut';
    else if (lateral > 0.55 * total && angle < TUNE.hookAngle + 10) type = 'hook';
    else type = h === this.cal.lead ? 'jab' : 'cross';

    const aim: Aim = (wy - sh.y) / sw > 0.45 ? 'body' : 'head';
    const wx = ((h === 'L' ? f.wL.x : f.wR.x) - this.cal.cx) / sw;
    const lane: Lane = wx < -0.6 ? -1 : wx > 0.6 ? 1 : 0;

    const speedN = Math.max(0, Math.min(1, (tr.peakV - TUNE.launchSpeed) / (TUNE.speedForMaxPower - TUNE.launchSpeed)));
    const rot = Math.min(1, Math.abs(ratio - tr.startRatio) / 0.18);
    const power = Math.max(0.15, Math.min(1, 0.2 + speedN * 0.62 + rot * 0.18));
    return { kind: 'punch', hand: h, type, power, aim, lane };
  }
}
