import * as THREE from 'three';
import type { Hand } from '../game/types';

/** First-person gloves parented to the camera. Tracked wrist positions drive them,
 *  and a detected punch layers a forward lunge on top so punches read clearly even when depth is noisy. */
export class PlayerGloves {
  private mesh: Record<Hand, THREE.Group> = { L: new THREE.Group(), R: new THREE.Group() };
  private pos: Record<Hand, THREE.Vector3> = { L: new THREE.Vector3(-0.25, -0.3, -0.6), R: new THREE.Vector3(0.25, -0.3, -0.6) };
  private punch: Record<Hand, number> = { L: 0, R: 0 };
  private tilt: Record<Hand, number> = { L: 0, R: 0 };
  private ghostT = 0;

  constructor(camera: THREE.Camera) {
    for (const h of ['L', 'R'] as const) {
      const g = this.mesh[h];
      const mat = new THREE.MeshStandardMaterial({ color: 0xd62828, roughness: 0.35, metalness: 0.05 });
      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 14), mat);
      glove.scale.set(1, 0.9, 1.25);
      const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), mat);
      thumb.position.set(h === 'L' ? 0.07 : -0.07, 0.01, -0.03);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.075, 0.09, 12), new THREE.MeshStandardMaterial({ color: 0xf1f1f1, roughness: 0.6 }));
      cuff.rotation.x = Math.PI / 2;
      cuff.position.z = 0.13;
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.5, 10), new THREE.MeshStandardMaterial({ color: 0xc68a63, roughness: 0.7 }));
      sleeve.rotation.x = Math.PI / 2;
      sleeve.position.z = 0.42;
      g.add(glove, thumb, cuff, sleeve);
      camera.add(g);
      g.position.copy(this.pos[h]);
      g.renderOrder = 10;
      g.traverse((o) => { (o as THREE.Mesh).frustumCulled = false; });
    }
    // gloves are lit by a light attached to the camera
    const lamp = new THREE.PointLight(0xffffff, 6, 4);
    lamp.position.set(0, 0.2, 0.2);
    camera.add(lamp);
  }

  throwPunch(h: Hand) { this.punch[h] = 1; }

  update(dt: number, g: { L: [number, number, number]; R: [number, number, number] } | null, guard: boolean) {
    for (const h of ['L', 'R'] as const) {
      this.punch[h] = Math.max(0, this.punch[h] - dt * 5.5);
      const src = g?.[h];
      const sign = h === 'L' ? -1 : 1;
      let tx = sign * 0.22, ty = -0.2, tz = -0.55;
      if (src) {
        const [nx, ny, ext] = src;
        tx = (nx - 0.5) * 1.6;
        ty = -(ny - 0.5) * 1.1 - 0.12;
        tz = -0.5 - ext * 0.5;
      } else if (guard) { tx = sign * 0.14; ty = -0.02; }
      const p = this.punch[h];
      const lunge = Math.sin((1 - p) * Math.PI) * (p > 0 ? 1 : 0);
      // punches travel toward the centre line and forward
      tz -= lunge * 0.6;
      tx += -sign * lunge * 0.1;
      ty += lunge * 0.08;
      const target = new THREE.Vector3(tx, ty, tz);
      this.pos[h].lerp(target, 1 - Math.exp(-dt * 22));
      this.mesh[h].position.copy(this.pos[h]);
      this.mesh[h].rotation.set(0, -sign * 0.15 + lunge * -sign * 0.2, sign * 0.1);
    }
  }
}
