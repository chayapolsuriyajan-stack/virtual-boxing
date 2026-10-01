import * as THREE from 'three';
import type { Evade } from '../game/types';
import { CAM_POS } from './Scene';

/** Camera rig (evade offsets, shake, knockdown fall), screen overlays and hit particles. */
export class Effects {
  private shake = 0;
  private kick = new THREE.Vector3();
  private cam = CAM_POS.clone();
  private roll = 0;
  private fall = 0;
  private flash = 0;
  private particles: THREE.Points;
  private pPos: Float32Array;
  private pVel: Float32Array;
  private pLife: Float32Array;
  private vignette = document.getElementById('vignette') as HTMLElement;
  private canvas = document.getElementById('game') as HTMLElement;
  hitStop = 0;

  constructor(private camera: THREE.PerspectiveCamera, scene: THREE.Scene) {
    const N = 120;
    this.pPos = new Float32Array(N * 3);
    this.pVel = new Float32Array(N * 3);
    this.pLife = new Float32Array(N);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    this.particles = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xcfe8ff, size: 0.05, transparent: true, opacity: 0.85, depthWrite: false }));
    this.particles.frustumCulled = false;
    scene.add(this.particles);
    for (let i = 0; i < N; i++) this.pPos[i * 3 + 1] = -99;
  }

  burst(at: THREE.Vector3, power: number) {
    const n = Math.floor(10 + power * 24);
    let k = 0;
    for (let i = 0; i < this.pLife.length && k < n; i++) {
      if (this.pLife[i] > 0) continue;
      this.pLife[i] = 0.5 + Math.random() * 0.4;
      this.pPos.set([at.x, at.y, at.z], i * 3);
      this.pVel.set([(Math.random() - 0.5) * 2.4, Math.random() * 2 + 0.4, (Math.random() - 0.2) * 2.4], i * 3);
      k++;
    }
  }

  /** player gets hit: camera jolt + red flash. dir is -1/1 sideways, up adds a head-snap */
  playerHit(dmg: number, dir: number, up = 0) {
    this.shake = Math.min(1, 0.25 + dmg / 14);
    this.kick.set(dir * 0.12 * this.shake, up * 0.1, 0.1);
    this.roll = dir * 0.08 * this.shake * 2;
    this.flash = Math.min(0.85, 0.3 + dmg / 20);
    this.hitStop = 0.06 + Math.min(0.04, dmg / 400);
  }
  landed(power: number) { this.shake = Math.max(this.shake, 0.08 + 0.12 * power); this.hitStop = 0.04 + 0.05 * power; }
  setFall(down: boolean) { this.fall = down ? 1 : 0; }

  update(dt: number, evade: Evade | null, healthFrac: number, down: boolean) {
    this.shake = Math.max(0, this.shake - dt * 3);
    this.kick.multiplyScalar(Math.exp(-dt * 9));
    this.roll *= Math.exp(-dt * 7);
    this.flash = Math.max(0, this.flash - dt * 1.4);

    const want = CAM_POS.clone();
    if (evade === 'slipL') { want.x -= 0.32; this.roll += (0.12 - this.roll) * 0.1; }
    if (evade === 'slipR') { want.x += 0.32; this.roll += (-0.12 - this.roll) * 0.1; }
    if (evade === 'duck') want.y -= 0.42;
    if (evade === 'lean') want.z += 0.28;
    if (down) want.y -= 1.0;
    this.cam.lerp(want, 1 - Math.exp(-dt * 12));
    const sh = this.shake * this.shake;
    this.camera.position.set(
      this.cam.x + this.kick.x + (Math.random() - 0.5) * 0.06 * sh,
      this.cam.y + this.kick.y + (Math.random() - 0.5) * 0.06 * sh,
      this.cam.z + this.kick.z,
    );
    const lookAt = new THREE.Vector3(this.camera.position.x * 0.3, down ? 1.4 : 1.35, -1);
    this.camera.lookAt(lookAt);
    this.camera.rotation.z += this.roll + (down ? 0.35 : 0);

    // overlays: damage flash + low health heartbeat vignette, blur when badly hurt
    const low = Math.max(0, 0.35 - healthFrac) / 0.35;
    const pulse = low * (0.35 + 0.25 * Math.sin(performance.now() / 180));
    this.vignette.style.opacity = String(Math.min(1, this.flash + pulse));
    this.canvas.style.filter = low > 0.2 ? `blur(${(low * 2.2).toFixed(2)}px) saturate(${(1 - low * 0.5).toFixed(2)})` : '';

    // particles
    for (let i = 0; i < this.pLife.length; i++) {
      if (this.pLife[i] <= 0) { this.pPos[i * 3 + 1] = -99; continue; }
      this.pLife[i] -= dt;
      this.pVel[i * 3 + 1] -= 7 * dt;
      for (let k = 0; k < 3; k++) this.pPos[i * 3 + k] += this.pVel[i * 3 + k] * dt;
    }
    (this.particles.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
