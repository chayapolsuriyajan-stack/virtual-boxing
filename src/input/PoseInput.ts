import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { DefenseState, InputEvent, InputSource } from '../game/types';
import { Calibrator } from '../pose/Calibration';
import type { Calibration } from '../pose/Calibration';
import { DefenseDetector } from '../pose/DefenseDetector';
import { PunchDetector } from '../pose/PunchDetector';
import { FrameBuilder, elbowAngle, mid, shoulderWidth } from '../pose/frame';
import type { PoseFrame } from '../pose/frame';

export type TrackStatus = 'loading' | 'ok' | 'lost' | 'too-close' | 'too-far' | 'error';

const CONNECT: [keyof PoseFrame, keyof PoseFrame][] = [['sL', 'sR'], ['sL', 'eL'], ['eL', 'wL'], ['sR', 'eR'], ['eR', 'wR']];
const CALIB_FRAMES = 45;

export class PoseInput implements InputSource {
  status: TrackStatus = 'loading';
  error = '';
  cal: Calibration | null = null;
  debug = false;
  fps = 0;
  last: PoseFrame | null = null;
  lastEvent = '';
  stance?: 'L' | 'R';
  private lm?: PoseLandmarker;
  private video = document.getElementById('cam') as HTMLVideoElement;
  private pip = document.getElementById('pip') as HTMLCanvasElement;
  private fb = new FrameBuilder();
  private pd?: PunchDetector;
  private dd?: DefenseDetector;
  private calib: Calibrator | null = null;
  private q: InputEvent[] = [];
  private def: DefenseState = { guard: false, evade: null };
  private lastVideoT = -1;
  private frames = 0;
  private fpsT = 0;
  private missed = 0;
  private gl: { L: [number, number, number]; R: [number, number, number] } | null = null;

  async start() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera needs a secure (https) page and a browser that supports it.');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 }, facingMode: 'user' }, audio: false });
      this.video.srcObject = stream;
      await this.video.play();
      const base = import.meta.env.BASE_URL;
      const fileset = await FilesetResolver.forVisionTasks(`${base}wasm`);
      const make = (delegate: 'GPU' | 'CPU') => PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${base}models/pose_landmarker_lite.task`, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      try { this.lm = await make('GPU'); } catch { this.lm = await make('CPU'); }
      this.status = 'lost';
      this.loop();
    } catch (e) {
      this.status = 'error';
      this.error = e instanceof Error ? e.message : String(e);
      throw e;
    }
  }

  /** begin collecting calibration frames */
  beginCalibration() { this.calib = new Calibrator(); this.cal = null; }
  get calibrationProgress() { return this.calib ? Math.min(1, this.calib.count / CALIB_FRAMES) : 0; }
  finishCalibration(): Calibration | null {
    if (!this.calib || this.calib.count < CALIB_FRAMES) return null;
    this.cal = this.calib.finish(this.stance);
    this.calib = null;
    this.pd = new PunchDetector(this.cal);
    this.dd = new DefenseDetector(this.cal);
    return this.cal;
  }

  private loop = () => {
    requestAnimationFrame(this.loop);
    const v = this.video;
    if (!this.lm || v.readyState < 2 || v.currentTime === this.lastVideoT) return;
    this.lastVideoT = v.currentTime;
    const now = performance.now();
    const res = this.lm.detectForVideo(v, now);
    this.frames++;
    if (now - this.fpsT > 1000) { this.fps = this.frames; this.frames = 0; this.fpsT = now; }
    const lm = res.landmarks[0];
    const f = lm ? this.fb.build(lm, v.videoWidth, v.videoHeight, now / 1000) : null;
    if (!f) {
      if (++this.missed > 10) this.status = 'lost';
      this.draw(null);
      return;
    }
    this.missed = 0;
    this.last = f;
    const ratio = shoulderWidth(f) / v.videoWidth;
    this.status = ratio > 0.42 ? 'too-close' : ratio < 0.1 ? 'too-far' : 'ok';
    if (this.calib && this.status === 'ok') this.calib.add(f);
    if (this.pd && this.dd) {
      for (const e of this.pd.update(f)) {
        this.q.push(e);
        this.lastEvent = `${e.hand} ${e.type} ${e.aim} p=${e.power.toFixed(2)}`;
      }
      this.def = this.dd.update(f, this.pd.active);
      const sw = this.cal!.sw;
      const m = mid(f.sL, f.sR);
      const g = (h: 'L' | 'R'): [number, number, number] => {
        const w = h === 'L' ? f.wL : f.wR, s = h === 'L' ? f.sL : f.sR, e = h === 'L' ? f.eL : f.eR;
        const ext = Math.max(0, Math.min(1, (elbowAngle(s, e, w) - 70) / 100));
        return [0.5 + (w.x - m.x) / (sw * 4), 0.5 + (w.y - m.y) / (sw * 3) - 0.1, ext];
      };
      this.gl = { L: g('L'), R: g('R') };
    }
    this.draw(f);
  };

  private draw(f: PoseFrame | null) {
    const c = this.pip.getContext('2d')!;
    const v = this.video;
    c.save();
    c.clearRect(0, 0, this.pip.width, this.pip.height);
    c.translate(this.pip.width, 0);
    c.scale(-1, 1); // mirror
    c.drawImage(v, 0, 0, this.pip.width, this.pip.height);
    c.restore();
    if (!f) return;
    // frame x is already mirrored, so it maps straight onto the mirrored preview
    const sx = this.pip.width / v.videoWidth, sy = this.pip.height / v.videoHeight;
    c.strokeStyle = '#ffd23f';
    c.lineWidth = 3;
    c.fillStyle = '#ff3b3b';
    for (const [a, b] of CONNECT) {
      const p = f[a] as { x: number; y: number }, q = f[b] as { x: number; y: number };
      c.beginPath(); c.moveTo(p.x * sx, p.y * sy); c.lineTo(q.x * sx, q.y * sy); c.stroke();
    }
    for (const k of ['wL', 'wR', 'nose'] as const) { c.beginPath(); c.arc(f[k].x * sx, f[k].y * sy, 6, 0, 7); c.fill(); }
  }

  drain() { const q = this.q; this.q = []; return q; }
  defense() { return this.def; }
  gloves() { return this.gl; }
}
