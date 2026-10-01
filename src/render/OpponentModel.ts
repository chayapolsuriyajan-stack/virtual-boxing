import * as THREE from 'three';
import type { OppAttack } from '../game/combat';
import type { OpponentAI } from '../game/ai/OpponentAI';
import type { Profile } from '../game/types';
import { OPP_POS } from './Scene';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => x * x * (3 - 2 * x);

/** limb segment: a unit-height cylinder stretched between two points */
function segment(parent: THREE.Object3D, r: number, mat: THREE.Material) {
  const g = new THREE.CylinderGeometry(r, r * 0.88, 1, 10);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  parent.add(m);
  return m;
}
const UP = V(0, 1, 0);
function place(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
  const d = b.clone().sub(a);
  const l = d.length() || 1e-3;
  m.position.copy(a).addScaledVector(d, 0.5);
  m.scale.set(1, l, 1);
  m.quaternion.setFromUnitVectors(UP, d.divideScalar(l));
}

/** two-bone IK: returns elbow position */
function elbow(s: THREE.Vector3, t: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3) {
  const d = t.clone().sub(s);
  const dist = Math.min(l1 + l2 - 1e-3, Math.max(Math.abs(l1 - l2) + 1e-3, d.length()));
  const u = d.normalize();
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const pp = pole.clone().addScaledVector(u, -pole.dot(u));
  if (pp.lengthSq() < 1e-6) pp.set(0, -1, 0);
  pp.normalize();
  return s.clone().addScaledVector(u, a).addScaledVector(pp, h);
}

interface Arm {
  sign: -1 | 1;
  shoulder: THREE.Vector3;
  upper: THREE.Mesh; fore: THREE.Mesh; glove: THREE.Mesh;
  gloveMat: THREE.MeshStandardMaterial;
  target: THREE.Vector3;
}

const L1 = 0.3, L2 = 0.32;

export class OpponentModel {
  group = new THREE.Group();
  private upper = new THREE.Group();
  private head = new THREE.Group();
  private arms: Arm[] = [];
  private t = 0;
  private downAmt = 0;
  private hit = { t: 0, pitch: 0, yaw: 0 };
  private blockT = 0;
  private slipT = 0; private slipSide = 1;
  private lastAtk: OppAttack = 'jab';
  private lastSide: -1 | 1 = 1;
  private stunAmt = 0;

  constructor(profile: Profile) {
    const skin = new THREE.MeshStandardMaterial({ color: 0xc68a63, roughness: 0.7 });
    const shorts = new THREE.MeshStandardMaterial({ color: profile.color, roughness: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x151518, roughness: 0.6 });
    const g = this.group;
    g.position.copy(OPP_POS);

    // legs (static-ish, in a boxing stance)
    for (const [x, z] of [[-0.17, 0.12], [0.17, -0.14]] as const) {
      const leg = segment(g, 0.075, skin);
      place(leg, V(x * 0.7, 0.95, 0), V(x, 0.07, z));
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.28), dark);
      boot.position.set(x, 0.05, z + 0.05);
      boot.castShadow = true;
      g.add(boot);
    }
    const trunks = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.3, 14), shorts);
    trunks.position.y = 0.95;
    trunks.castShadow = true;
    g.add(trunks);

    // upper body pivots at the waist
    this.upper.position.y = 1.0;
    g.add(this.upper);
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.19, 0.56, 14), skin);
    torso.position.y = 0.28;
    torso.scale.z = 0.7;
    torso.castShadow = true;
    this.upper.add(torso);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 14), new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 0.6, roughness: 0.3 }));
    belt.position.y = 0.02;
    belt.scale.z = 0.75;
    this.upper.add(belt);

    this.head.position.set(0, 0.68, 0.02);
    this.upper.add(this.head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.125, 18, 14), skin);
    skull.scale.set(0.95, 1.1, 1);
    skull.position.y = 0.1;
    skull.castShadow = true;
    this.head.add(skull);
    const gear = new THREE.Mesh(new THREE.SphereGeometry(0.135, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: profile.color, roughness: 0.4 }));
    gear.scale.set(0.97, 1.15, 1.02);
    gear.position.y = 0.11;
    this.head.add(gear);
    for (const x of [-0.045, 0.045]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), dark);
      eye.position.set(x, 0.12, 0.118);
      this.head.add(eye);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), skin);
    nose.position.set(0, 0.09, 0.128);
    this.head.add(nose);

    // arms
    for (const sign of [-1, 1] as const) {
      const gloveMat = new THREE.MeshStandardMaterial({ color: profile.color, roughness: 0.35, emissive: 0xff0000, emissiveIntensity: 0 });
      const arm: Arm = {
        sign,
        shoulder: V(sign * 0.25, 0.5, 0),
        upper: segment(this.upper, 0.06, skin),
        fore: segment(this.upper, 0.055, skin),
        glove: new THREE.Mesh(new THREE.SphereGeometry(0.105, 14, 12), gloveMat),
        gloveMat,
        target: V(0, 0, 0),
      };
      arm.glove.castShadow = true;
      this.upper.add(arm.glove);
      this.arms.push(arm);
    }
  }

  add(scene: THREE.Scene) { scene.add(this.group); }

  /** world position of the head centre, for particles */
  headWorld() { return this.head.localToWorld(V(0, 0.1, 0.1)); }

  onHit(power: number, type: string, lane: number) {
    const hook = type === 'hook';
    this.hit = { t: 0.32, pitch: type === 'uppercut' ? -0.8 * power - 0.2 : -0.35 * power - 0.1, yaw: hook ? (lane >= 0 ? -1 : 1) * (0.5 + 0.6 * power) : (Math.random() - 0.5) * 0.3 };
  }
  onBlock() { this.blockT = 0.22; }
  onSlip() { this.slipT = 0.3; this.slipSide = Math.random() < 0.5 ? -1 : 1; }

  // glove targets in the upper-body frame
  private guardPos(a: Arm) { return V(a.sign * 0.14, 0.6, a.sign < 0 ? 0.28 : 0.22); }
  private windPos(a: Arm, atk: OppAttack, side: number) {
    const s = a.sign;
    switch (atk) {
      case 'jab': return V(s * 0.2, 0.46, 0.0);
      case 'cross': return V(s * 0.22, 0.46, -0.06);
      case 'hook': return V(s * 0.66, 0.58, 0.08);
      case 'uppercut': return V(s * 0.2, 0.2, 0.1);
      case 'body': return V(s * 0.45, 0.38, 0.0);
    }
    return this.guardPos(a);
  }
  private strikePos(a: Arm, atk: OppAttack) {
    const s = a.sign;
    switch (atk) {
      case 'jab': return V(s * 0.06, 0.68, 0.64);
      case 'cross': return V(-s * 0.04, 0.68, 0.64);
      case 'hook': return V(-s * 0.14, 0.62, 0.46);
      case 'uppercut': return V(-s * 0.02, 0.74, 0.5);
      case 'body': return V(-s * 0.06, 0.16, 0.56);
    }
    return this.guardPos(a);
  }
  private activeArm(atk: OppAttack, side: number) {
    if (atk === 'jab') return -1;
    if (atk === 'cross') return 1;
    return side < 0 ? -1 : 1;
  }

  update(dt: number, ai: OpponentAI) {
    this.t += dt;
    const t = this.t;
    if (ai.attack) { this.lastAtk = ai.attack; this.lastSide = ai.side; }
    const atk = this.lastAtk;
    const active = this.activeArm(atk, this.lastSide);

    // phase blends
    let wind = 0, strike = 0;
    switch (ai.state) {
      case 'windup': wind = ease(clamp01(ai.t / ai.windupDur)); break;
      case 'strike': wind = 1; strike = ease(clamp01(ai.t / 0.1)); break;
      case 'recover': strike = ai.attack ? 1 - ease(clamp01(ai.t / 0.4)) : 0; wind = strike > 0 ? 1 : 0; break;
    }
    this.hit.t = Math.max(0, this.hit.t - dt);
    this.blockT = Math.max(0, this.blockT - dt);
    this.slipT = Math.max(0, this.slipT - dt);
    const h = this.hit.t / 0.32; // 1 → 0
    const hitK = h * h;

    const downTarget = ai.state === 'down' ? 1 : 0;
    this.downAmt += (downTarget - this.downAmt) * Math.min(1, dt * (downTarget ? 6 : 3));
    const stunTarget = ai.state === 'stunned' ? 1 : 0;
    this.stunAmt += (stunTarget - this.stunAmt) * Math.min(1, dt * 6);

    // body
    const bob = Math.sin(t * 3.1) * 0.02;
    const sway = Math.sin(t * 1.3) * 0.1 * (1 - this.downAmt);
    const slip = this.slipT > 0 ? Math.sin((this.slipT / 0.3) * Math.PI) * 0.3 * this.slipSide : 0;
    this.group.position.set(OPP_POS.x + sway + slip, 0, OPP_POS.z + Math.sin(t * 0.8) * 0.12 + strike * 0.5 - hitK * 0.15);
    this.group.rotation.x = -this.downAmt * 1.45;
    this.group.rotation.z = Math.sin(t * 9) * 0.1 * this.stunAmt - slip * 0.5;
    this.group.position.y = this.downAmt * 0.18;
    this.upper.position.y = 1.0 + bob - wind * 0.05 * (1 - strike) - this.stunAmt * 0.06;
    const twistDir = active === -1 ? 1 : -1;
    this.upper.rotation.y = twistDir * (atk === 'cross' || atk === 'hook' ? 0.45 : 0.2) * (strike - wind * 0.4) + hitK * this.hit.yaw * 0.4;
    this.upper.rotation.x = 0.1 + strike * 0.25 + this.stunAmt * 0.3 + hitK * this.hit.pitch * 0.4;
    this.head.rotation.set(hitK * this.hit.pitch - this.stunAmt * 0.25, hitK * this.hit.yaw, Math.sin(t * 7) * 0.15 * this.stunAmt);

    // arms
    for (const a of this.arms) {
      const g = this.guardPos(a);
      g.y += Math.sin(t * 3.1 + a.sign) * 0.015;
      let target = g.clone();
      if (a.sign === active && (ai.state === 'windup' || ai.state === 'strike' || (ai.state === 'recover' && ai.attack))) {
        const w = this.windPos(a, atk, this.lastSide);
        const s = this.strikePos(a, atk);
        target = g.clone().lerp(w, wind).lerp(s, strike);
      } else if (this.blockT > 0 || (ai.state === 'guard' && ai.nextAction < 0.0 && false)) {
        target = V(a.sign * 0.07, 0.72, 0.34);
      }
      if (this.blockT > 0) target = V(a.sign * 0.07, 0.72, 0.34);
      target.y -= this.stunAmt * 0.25;
      target.z += hitK * -0.1;
      a.target.copy(target);
      const pole = V(a.sign * 0.8, -1, -0.3);
      const e = elbow(a.shoulder, target, L1, L2, pole);
      place(a.upper, a.shoulder, e);
      place(a.fore, e, target);
      a.glove.position.copy(target).addScaledVector(target.clone().sub(e).normalize(), 0.05);
      const glow = a.sign === active && ai.state === 'windup' ? wind : 0;
      a.gloveMat.emissiveIntensity = glow * 1.4;
    }
  }
}
