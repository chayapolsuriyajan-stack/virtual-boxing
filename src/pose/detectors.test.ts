import { describe, expect, it } from 'vitest';
import { Calibrator } from './Calibration';
import { DefenseDetector } from './DefenseDetector';
import { PunchDetector } from './PunchDetector';
import type { PoseFrame, V3 } from './frame';

const v = (x: number, y: number, z: number): V3 => ({ x, y, z });
const CX = 320;

interface Arm { e: V3; w: V3 }
interface Pose { nose: V3; L: Arm; R: Arm }

const guard: Pose = {
  nose: v(CX, 200, 0),
  L: { e: v(CX - 105, 390, 0), w: v(CX - 70, 240, -60) },
  R: { e: v(CX + 105, 390, 0), w: v(CX + 70, 240, -40) },
};
const lerp = (a: V3, b: V3, p: number): V3 => v(a.x + (b.x - a.x) * p, a.y + (b.y - a.y) * p, a.z + (b.z - a.z) * p);
const mixArm = (a: Arm, b: Arm, p: number): Arm => ({ e: lerp(a.e, b.e, p), w: lerp(a.w, b.w, p) });
const frame = (t: number, p: Pose): PoseFrame => ({
  t, nose: p.nose, sL: v(CX - 100, 300, 0), sR: v(CX + 100, 300, 0),
  eL: p.L.e, wL: p.L.w, eR: p.R.e, wR: p.R.w,
});

/** Plays rest → target → rest. outFrames = frames to reach the target, back = frames to return. */
function play(target: (base: Pose) => Pose, out = 6, hold = 2, back = 8, fps = 60) {
  const frames: PoseFrame[] = [];
  let t = 0;
  const tgt = target(guard);
  for (let i = 0; i < 20; i++, t += 1 / fps) frames.push(frame(t, guard));
  for (let i = 1; i <= out; i++, t += 1 / fps) { const p = i / out; frames.push(frame(t, mix(guard, tgt, p * p * (3 - 2 * p)))); }
  for (let i = 0; i < hold; i++, t += 1 / fps) frames.push(frame(t, tgt));
  for (let i = 1; i <= back; i++, t += 1 / fps) frames.push(frame(t, mix(tgt, guard, i / back)));
  for (let i = 0; i < 20; i++, t += 1 / fps) frames.push(frame(t, guard));
  return frames;
}
const mix = (a: Pose, b: Pose, p: number): Pose => ({ nose: lerp(a.nose, b.nose, p), L: mixArm(a.L, b.L, p), R: mixArm(a.R, b.R, p) });

function calibrate() {
  const c = new Calibrator();
  for (let i = 0; i < 60; i++) c.add(frame(i / 30, guard));
  return c.finish('L');
}

const detect = (frames: PoseFrame[]) => {
  const d = new PunchDetector(calibrate());
  return frames.flatMap((f) => d.update(f));
};

describe('PunchDetector', () => {
  it('calibrates shoulder width and lead hand', () => {
    const cal = calibrate();
    expect(cal.sw).toBeCloseTo(200);
    expect(cal.lead).toBe('L');
  });

  it('detects a jab from the lead hand', () => {
    const ev = detect(play((b) => ({ ...b, L: { e: v(CX - 110, 330, -140), w: v(CX - 90, 255, -330) } })));
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ hand: 'L', type: 'jab', aim: 'head' });
    expect(ev[0].power).toBeGreaterThan(0.2);
  });

  it('detects a cross from the rear hand', () => {
    const ev = detect(play((b) => ({ ...b, R: { e: v(CX + 100, 330, -140), w: v(CX + 60, 255, -330) } })));
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ hand: 'R', type: 'cross' });
  });

  it('detects a hook (lateral swing, bent elbow)', () => {
    const ev = detect(play((b) => ({ ...b, L: { e: v(CX - 90, 285, -40), w: v(CX + 90, 255, -150) } })));
    expect(ev).toHaveLength(1);
    expect(ev[0].type).toBe('hook');
  });

  it('detects an uppercut (upward drive from low)', () => {
    const low: Pose = { ...guard, R: { e: v(CX + 90, 400, -20), w: v(CX + 60, 400, -40) } };
    const up: Pose = { ...low, R: { e: v(CX + 90, 380, -40), w: v(CX + 50, 230, -110) } };
    const frames: PoseFrame[] = [];
    let t = 0;
    for (let i = 0; i < 20; i++, t += 1 / 60) frames.push(frame(t, low));
    for (let i = 1; i <= 6; i++, t += 1 / 60) frames.push(frame(t, mix(low, up, i / 6)));
    for (let i = 0; i < 4; i++, t += 1 / 60) frames.push(frame(t, up));
    for (let i = 0; i < 20; i++, t += 1 / 60) frames.push(frame(t, low));
    const ev = detect(frames);
    expect(ev).toHaveLength(1);
    expect(ev[0].type).toBe('uppercut');
  });

  it('ignores slow arm movement and arm waving overhead', () => {
    expect(detect(play((b) => ({ ...b, L: { e: v(CX - 110, 330, -140), w: v(CX - 90, 255, -330) } }), 60, 10, 60))).toHaveLength(0);
    expect(detect(play((b) => ({ ...b, L: { e: v(CX - 140, 150, 0), w: v(CX - 150, 40, 0) } })))).toHaveLength(0);
  });

  it('does not double-count one punch', () => {
    const ev = detect(play((b) => ({ ...b, L: { e: v(CX - 110, 330, -140), w: v(CX - 90, 255, -330) } }), 6, 6, 12));
    expect(ev).toHaveLength(1);
  });
});

describe('DefenseDetector', () => {
  const run = (nose: V3) => {
    const d = new DefenseDetector(calibrate());
    let s = d.update(frame(0, guard), false);
    for (let i = 1; i < 15; i++) s = d.update(frame(i / 60, { ...guard, nose }), false);
    return s;
  };
  it('sees a high guard', () => expect(run(v(CX, 200, 0)).guard).toBe(true));
  it('sees slips left/right', () => {
    expect(run(v(CX - 90, 200, 0)).evade).toBe('slipL');
    expect(run(v(CX + 90, 200, 0)).evade).toBe('slipR');
  });
  it('sees a duck', () => expect(run(v(CX, 290, 0)).evade).toBe('duck'));
  it('no evade when standing still', () => expect(run(v(CX + 10, 205, 0)).evade).toBeNull());
  it('drops guard when hands are down', () => {
    const d = new DefenseDetector(calibrate());
    const down = { ...guard, L: { e: guard.L.e, w: v(CX - 90, 480, 0) }, R: { e: guard.R.e, w: v(CX + 90, 480, 0) } };
    expect(d.update(frame(0, down), false).guard).toBe(false);
  });
});
