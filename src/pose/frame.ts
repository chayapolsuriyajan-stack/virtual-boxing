import { OneEuro } from './OneEuroFilter';

export interface V3 { x: number; y: number; z: number }
/** Smoothed upper-body pose. x is mirrored (screen-right = +x), y down, z negative = toward camera.
 *  All values are in video pixels (z scaled by video width like MediaPipe does). */
export interface PoseFrame { t: number; nose: V3; sL: V3; sR: V3; eL: V3; eR: V3; wL: V3; wR: V3 }

export const LM = { nose: 0, sL: 11, sR: 12, eL: 13, eR: 14, wL: 15, wR: 16 } as const;
const KEYS = Object.keys(LM) as (keyof typeof LM)[];

export const shoulderWidth = (f: PoseFrame) => Math.hypot(f.sL.x - f.sR.x, f.sL.y - f.sR.y) || 1;
export const mid = (a: V3, b: V3): V3 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
export const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const len = (a: V3) => Math.hypot(a.x, a.y, a.z);

export function elbowAngle(s: V3, e: V3, w: V3): number {
  const a = sub(s, e), b = sub(w, e);
  const c = (a.x * b.x + a.y * b.y + a.z * b.z) / ((len(a) * len(b)) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}

export class FrameBuilder {
  private f: Record<string, OneEuro[]> = {};
  build(lm: { x: number; y: number; z: number; visibility?: number }[], vw: number, vh: number, t: number): PoseFrame | null {
    const out: Record<string, V3> = {};
    for (const k of KEYS) {
      const p = lm[LM[k]];
      if (!p) return null;
      if (k !== 'nose' && (p.visibility ?? 1) < 0.3) return null;
      const fs = (this.f[k] ??= [new OneEuro(), new OneEuro(), new OneEuro(1, 0.04)]);
      out[k] = { x: fs[0].filter((1 - p.x) * vw, t), y: fs[1].filter(p.y * vh, t), z: fs[2].filter(p.z * vw, t) };
    }
    return { t, ...(out as any) } as PoseFrame;
  }
}
