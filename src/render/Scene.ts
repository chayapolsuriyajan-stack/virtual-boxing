import * as THREE from 'three';

export const IS_MOBILE = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
export const OPP_POS = new THREE.Vector3(0, 0, -0.5);
export const CAM_POS = new THREE.Vector3(0, 1.68, 1.5);

function canvasTexture(draw: (c: CanvasRenderingContext2D, s: number) => void, size = 512) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class Arena {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, 1, 0.05, 80);
  renderer: THREE.WebGLRenderer;
  private crowd: THREE.InstancedMesh;
  private crowdBase: { x: number; y: number; z: number; ph: number }[] = [];
  private dummy = new THREE.Object3D();
  crowdEnergy = 0;
  private t = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, IS_MOBILE ? 1.25 : 2));
    this.renderer.shadowMap.enabled = !IS_MOBILE;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.background = new THREE.Color(0x07070c);
    this.scene.fog = new THREE.Fog(0x07070c, 7, 24);
    this.camera.position.copy(CAM_POS);
    this.scene.add(this.camera);
    this.buildRing();
    this.crowd = this.buildCrowd();
    this.buildLights();
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight(0x9aa7ff, 0x221018, 0.55));
    const key = new THREE.SpotLight(0xfff1d6, 260, 22, Math.PI / 4.2, 0.55, 1.4);
    key.position.set(0, 7.5, 0.5);
    key.target.position.set(0, 0, -0.5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key, key.target);
    const rim = new THREE.PointLight(0xff3b3b, 20, 14);
    rim.position.set(-4, 3, -4);
    const rim2 = new THREE.PointLight(0x3b6bff, 20, 14);
    rim2.position.set(4, 3, -4);
    this.scene.add(rim, rim2);
    // overhead lamp housings
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff1d6 });
    for (const x of [-1.5, 1.5]) {
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.55, 0.2, 16), lampMat);
      lamp.position.set(x, 7.6, -0.5);
      this.scene.add(lamp);
    }
  }

  private buildRing() {
    const S = 6; // ring side in metres
    const canvasTex = canvasTexture((c, s) => {
      c.fillStyle = '#1d3b8a'; c.fillRect(0, 0, s, s);
      for (let i = 0; i < 4000; i++) { c.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`; c.fillRect(Math.random() * s, Math.random() * s, 2, 2); }
      c.strokeStyle = '#ffffff22'; c.lineWidth = 2;
      for (let i = 0; i <= s; i += s / 12) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, s); c.stroke(); }
      c.fillStyle = '#ffffffcc'; c.font = 'bold 120px Impact, sans-serif'; c.textAlign = 'center';
      c.fillText('VIRTUAL', s / 2, s / 2 - 10);
      c.fillText('BOXING', s / 2, s / 2 + 110);
      c.strokeStyle = '#d93636'; c.lineWidth = 14; c.strokeRect(14, 14, s - 28, s - 28);
    });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(S + 1.2, 0.5, S + 1.2), new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.9 }));
    floor.position.y = -0.25;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(S, S), new THREE.MeshStandardMaterial({ map: canvasTex, roughness: 0.85 }));
    mat.rotation.x = -Math.PI / 2;
    mat.position.y = 0.002;
    mat.receiveShadow = true;
    this.scene.add(mat);
    // arena floor around the ring
    const around = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshStandardMaterial({ color: 0x0c0c12, roughness: 1 }));
    around.rotation.x = -Math.PI / 2;
    around.position.y = -0.5;
    this.scene.add(around);

    const h = S / 2;
    const post = new THREE.CylinderGeometry(0.07, 0.07, 1.6, 12);
    const pad = new THREE.CylinderGeometry(0.11, 0.11, 1.0, 12);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x888899, metalness: 0.7, roughness: 0.4 });
    const padMat = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.6 });
    const ropeColors = [0xffffff, 0xd93636, 0x2e5cd9];
    const corners: [number, number][] = [[-h, -h], [h, -h], [h, h], [-h, h]];
    corners.forEach(([x, z], i) => {
      const p = new THREE.Mesh(post, postMat); p.position.set(x, 0.8, z);
      const pd = new THREE.Mesh(pad, i < 2 ? padMat : new THREE.MeshStandardMaterial({ color: 0x2e5cd9, roughness: 0.6 })); pd.position.set(x, 0.75, z);
      this.scene.add(p, pd);
      const [nx, nz] = corners[(i + 1) % 4];
      const dx = nx - x, dz = nz - z, L = Math.hypot(dx, dz);
      [0.55, 0.95, 1.35].forEach((y, k) => {
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, L, 8), new THREE.MeshStandardMaterial({ color: ropeColors[k], roughness: 0.5 }));
        rope.position.set((x + nx) / 2, y, (z + nz) / 2);
        rope.rotation.z = Math.PI / 2;
        rope.rotation.y = -Math.atan2(dz, dx);
        rope.castShadow = true;
        this.scene.add(rope);
      });
    });
  }

  private buildCrowd() {
    const N = IS_MOBILE ? 180 : 520;
    const geo = new THREE.SphereGeometry(0.22, 8, 6);
    const mat = new THREE.MeshStandardMaterial({ roughness: 1, color: 0xffffff });
    const m = new THREE.InstancedMesh(geo, mat, N);
    const col = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const per = N / 4;
      const ring = 5 + Math.floor(i / per) * 1.6;
      const a = (i % per) / per * Math.PI * 2 + Math.random() * 0.05;
      const r = ring + 3 + Math.random() * 0.6;
      const x = Math.cos(a) * r * 1.2, z = Math.sin(a) * r * 1.2;
      const y = 0.9 + Math.floor(i / per) * 0.7;
      this.crowdBase.push({ x, y, z, ph: Math.random() * 6.28 });
      col.setHSL(Math.random(), 0.25, 0.1 + Math.random() * 0.12);
      m.setColorAt(i, col);
    }
    this.scene.add(m);
    return m;
  }

  update(dt: number) {
    this.t += dt;
    this.crowdEnergy = Math.max(0, this.crowdEnergy - dt * 0.35);
    const amp = 0.04 + this.crowdEnergy * 0.35;
    this.crowdBase.forEach((b, i) => {
      this.dummy.position.set(b.x, b.y + Math.abs(Math.sin(this.t * (2 + this.crowdEnergy * 4) + b.ph)) * amp, b.z);
      this.dummy.updateMatrix();
      this.crowd.setMatrixAt(i, this.dummy.matrix);
    });
    this.crowd.instanceMatrix.needsUpdate = true;
  }

  render() { this.renderer.render(this.scene, this.camera); }
}
