// Procedural soldier: shared geometries + camo texture, simple bone hierarchy for walk /
// aim / death animation, and tagged hitboxes (head ×2.5, torso ×1, limbs ×0.6).
import * as THREE from 'three';
import { makeRNG } from '../rng.js';

let shared = null;

function camoTexture(seed, palette) {
  const size = 128, c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), rng = makeRNG(seed);
  g.fillStyle = palette[0]; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 70; i++) {
    g.fillStyle = palette[1 + Math.floor(rng() * (palette.length - 1))];
    const x = rng() * size, y = rng() * size;
    g.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2, r = rng.range(6, 16);
      k ? g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    g.closePath(); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function faceTexture() {
  const size = 64, c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#c9a07a'; g.fillRect(0, 0, size, size);
  g.fillStyle = '#222'; g.fillRect(14, 26, 10, 5); g.fillRect(40, 26, 10, 5);    // eyes
  g.fillStyle = '#2a2a2a'; g.fillRect(0, 40, size, 24);                          // face mask
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function getShared() {
  if (shared) return shared;
  const camoA = camoTexture(11, ['#4f5a3a', '#3a4228', '#6b6a44', '#2c3120']);
  const camoB = camoTexture(12, ['#5c5440', '#3d3828', '#7a6e52', '#2b2820']);
  shared = {
    camo: [new THREE.MeshStandardMaterial({ map: camoA, roughness: 0.9 }), new THREE.MeshStandardMaterial({ map: camoB, roughness: 0.9 })],
    vest: new THREE.MeshStandardMaterial({ color: 0x2b2e2a, roughness: 0.85 }),
    helmet: [
      new THREE.MeshStandardMaterial({ color: 0x5a6a4a, roughness: 0.6, metalness: 0.1 }),
      new THREE.MeshStandardMaterial({ color: 0x3a3f3a, roughness: 0.5, metalness: 0.2 }),
      new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.4, metalness: 0.3 })
    ],
    skin: new THREE.MeshStandardMaterial({ map: faceTexture(), roughness: 0.8 }),
    boots: new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.7 }),
    gun: new THREE.MeshStandardMaterial({ color: 0x232323, roughness: 0.45, metalness: 0.7 }),
    gunWood: new THREE.MeshStandardMaterial({ color: 0x5a3a1e, roughness: 0.7 }),
    geo: {
      head: new THREE.BoxGeometry(0.24, 0.26, 0.26),
      helmet: new THREE.SphereGeometry(0.19, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      torso: new THREE.BoxGeometry(0.46, 0.56, 0.26),
      vest: new THREE.BoxGeometry(0.5, 0.42, 0.32),
      pelvis: new THREE.BoxGeometry(0.42, 0.18, 0.26),
      upperArm: new THREE.BoxGeometry(0.13, 0.3, 0.13),
      foreArm: new THREE.BoxGeometry(0.11, 0.3, 0.11),
      thigh: new THREE.BoxGeometry(0.17, 0.42, 0.18),
      shin: new THREE.BoxGeometry(0.15, 0.42, 0.16),
      boot: new THREE.BoxGeometry(0.16, 0.1, 0.26),
      pack: new THREE.BoxGeometry(0.34, 0.36, 0.16),
      gunBody: new THREE.BoxGeometry(0.06, 0.08, 0.62),
      gunMag: new THREE.BoxGeometry(0.04, 0.16, 0.08),
      gunStock: new THREE.BoxGeometry(0.05, 0.1, 0.22),
      gunBarrel: new THREE.CylinderGeometry(0.012, 0.012, 0.3, 8)
    }
  };
  return shared;
}

const _tmpBox = new THREE.Box3();

export class Soldier {
  constructor(level, shadows) {
    const S = getShared();
    this.level = level;
    const camo = S.camo[level % 2];
    const helmetTier = level >= 7 ? 2 : level >= 4 ? 1 : 0;
    this.helmetHP = [1, 1, 2][helmetTier];

    const g = new THREE.Group();
    this.group = g;
    const mk = (geo, mat, part, mult) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = shadows; m.receiveShadow = shadows;
      if (part) { m.userData.part = part; m.userData.mult = mult; m.userData.enemy = this; this.hitboxes.push(m); }
      return m;
    };
    this.hitboxes = [];

    // pelvis root at hip height
    this.hips = new THREE.Group(); this.hips.position.y = 0.95; g.add(this.hips);
    this.hips.add(mk(S.geo.pelvis, camo, 'torso', 1));

    // legs
    this.legs = [];
    for (const side of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(side * 0.12, -0.05, 0);
      const thigh = mk(S.geo.thigh, camo, 'limb', 0.6); thigh.position.y = -0.22; hip.add(thigh);
      const knee = new THREE.Group(); knee.position.y = -0.44; hip.add(knee);
      const shin = mk(S.geo.shin, camo, 'limb', 0.6); shin.position.y = -0.22; knee.add(shin);
      const boot = mk(S.geo.boot, S.boots, 'limb', 0.6); boot.position.set(0, -0.46, 0.04); knee.add(boot);
      this.hips.add(hip); this.legs.push({ hip, knee });
    }

    // torso
    this.torso = new THREE.Group(); this.torso.position.y = 0.1; this.hips.add(this.torso);
    const torso = mk(S.geo.torso, camo, 'torso', 1); torso.position.y = 0.3; this.torso.add(torso);
    const vest = mk(S.geo.vest, S.vest, 'torso', 1); vest.position.y = 0.34; this.torso.add(vest);
    const pack = mk(S.geo.pack, S.vest, 'torso', 1); pack.position.set(0, 0.32, -0.2); this.torso.add(pack);

    // head
    this.neck = new THREE.Group(); this.neck.position.y = 0.62; this.torso.add(this.neck);
    const head = mk(S.geo.head, S.skin, 'head', 2.5); head.position.y = 0.14; this.neck.add(head);
    const helmet = new THREE.Mesh(S.geo.helmet, S.helmet[helmetTier]); helmet.position.y = 0.17; helmet.castShadow = shadows;
    helmet.userData = { part: 'helmet', mult: 2.5, enemy: this }; this.hitboxes.push(helmet);
    this.neck.add(helmet);
    this.helmet = helmet;

    // arms + rifle (aiming pose)
    this.arms = [];
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group(); shoulder.position.set(side * 0.3, 0.52, 0);
      const upper = mk(S.geo.upperArm, camo, 'limb', 0.6); upper.position.y = -0.15; shoulder.add(upper);
      const elbow = new THREE.Group(); elbow.position.y = -0.3; shoulder.add(elbow);
      const fore = mk(S.geo.foreArm, camo, 'limb', 0.6); fore.position.y = -0.15; elbow.add(fore);
      this.torso.add(shoulder); this.arms.push({ shoulder, elbow });
    }
    // aim pose
    this.arms[0].shoulder.rotation.set(-1.25, 0.35, 0.1);  this.arms[0].elbow.rotation.x = -0.9;
    this.arms[1].shoulder.rotation.set(-1.35, -0.5, -0.1); this.arms[1].elbow.rotation.x = -1.3;

    const rifle = new THREE.Group();
    rifle.add(new THREE.Mesh(S.geo.gunBody, S.gun));
    const mag = new THREE.Mesh(S.geo.gunMag, S.gun); mag.position.set(0, -0.1, 0.05); rifle.add(mag);
    const stock = new THREE.Mesh(S.geo.gunStock, S.gunWood); stock.position.set(0, -0.02, 0.4); rifle.add(stock);
    const barrel = new THREE.Mesh(S.geo.gunBarrel, S.gun); barrel.rotation.x = Math.PI / 2; barrel.position.z = -0.45; rifle.add(barrel);
    rifle.position.set(0.12, 0.42, 0.3); rifle.rotation.y = 0.08;
    rifle.traverse(o => { if (o.isMesh) o.castShadow = shadows; });
    this.torso.add(rifle);
    this.rifle = rifle;
    this.muzzle = new THREE.Object3D(); this.muzzle.position.set(0, 0, -0.62); rifle.add(this.muzzle);

    this.alive = true; this.hp = 100; this.phase = Math.random() * Math.PI * 2;
    this.deathT = -1; this.flinch = 0; this.aimPitch = 0;
  }

  get position() { return this.group.position; }

  /** Returns damage multiplier applied, or 0 if the helmet ate the shot. */
  hit(mesh, baseDamage) {
    const part = mesh.userData.part;
    if (part === 'helmet' && this.helmetHP > 0) {
      this.helmetHP--;
      if (this.helmetHP === 0) { this.helmet.visible = false; }
      this.flinch = 1;
      return { damage: Math.round(baseDamage * 0.35), part: 'helmet' };
    }
    const mult = mesh.userData.mult || 1;
    this.flinch = 1;
    return { damage: Math.round(baseDamage * mult), part };
  }

  applyDamage(d) {
    if (!this.alive) return false;
    this.hp -= d;
    if (this.hp <= 0) { this.alive = false; this.deathT = 0; this.hp = 0; return true; }
    return false;
  }

  animate(dt, moving, speedFactor = 1) {
    if (!this.alive) {
      // fall over then sink
      this.deathT += dt;
      const k = Math.min(1, this.deathT / 0.45);
      const ease = 1 - Math.pow(1 - k, 3);
      this.group.rotation.x = -Math.PI / 2 * ease;
      this.group.position.y = -ease * 0.6;
      if (this.deathT > 2.2) this.group.position.y -= (this.deathT - 2.2) * 0.6;
      return;
    }
    this.phase += dt * (moving ? 9 * speedFactor : 2);
    const swing = moving ? 0.55 : 0.04;
    const s = Math.sin(this.phase);
    this.legs[0].hip.rotation.x = s * swing;
    this.legs[1].hip.rotation.x = -s * swing;
    this.legs[0].knee.rotation.x = Math.max(0, -s) * swing * 1.2;
    this.legs[1].knee.rotation.x = Math.max(0, s) * swing * 1.2;
    this.hips.position.y = 0.95 + Math.abs(Math.sin(this.phase)) * (moving ? 0.04 : 0.005);
    this.torso.rotation.z = Math.sin(this.phase) * (moving ? 0.04 : 0);
    // flinch
    this.flinch = Math.max(0, this.flinch - dt * 5);
    this.torso.rotation.x = -this.flinch * 0.25;
    this.neck.rotation.x = this.aimPitch * 0.4 - this.flinch * 0.3;
    this.rifle.rotation.x = this.aimPitch;
  }

  /** World-space muzzle position for tracers. */
  muzzleWorld(out) { return this.muzzle.getWorldPosition(out); }

  isGone() { return !this.alive && this.deathT > 3.5; }

  dispose(scene) { scene.remove(this.group); }
}
