// Visual effects: tracers, muzzle flashes, bullet-hole decals, blood puffs, shell casings,
// explosion flash/smoke. All pooled and cheap.
import * as THREE from 'three';
import { makeSoftDot } from './textures.js';

const MAX_DECALS = 160;

export class FX {
  constructor(scene, mats) {
    this.scene = scene;
    this.tracers = [];
    this.sprites = [];
    this.casings = [];
    this.decalIdx = 0;

    this.flashTex = makeSoftDot('255,210,120', 64);
    this.bloodTex = makeSoftDot('120,10,10', 64);
    this.smokeTex = makeSoftDot('90,85,80', 128);
    this.holeTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, 'rgba(10,8,4,1)'); grd.addColorStop(0.35, 'rgba(20,15,6,0.9)');
      grd.addColorStop(0.6, 'rgba(60,50,25,0.35)'); grd.addColorStop(1, 'rgba(60,50,25,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();

    // bullet-hole decals: instanced quads oriented to the hit normal
    this.decals = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.11, 0.11),
      new THREE.MeshBasicMaterial({ map: this.holeTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
      MAX_DECALS);
    this.decals.count = 0; this.decals.frustumCulled = false;
    scene.add(this.decals);

    this.casingGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.03, 6);
    this.casingMat = new THREE.MeshStandardMaterial({ color: 0xd4a53a, metalness: 0.9, roughness: 0.3 });
    this.light = new THREE.PointLight(0xffc070, 0, 6, 2);
    scene.add(this.light);
    this._tmp = new THREE.Object3D();
  }

  tracer(from, to, color = 0xfff3b0, width = 1) {
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, linewidth: width });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0, ttl: 0.12 });
  }

  sprite(tex, pos, size, color, ttl, grow = 0, rise = 0, additive = true) {
    const mat = new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const s = new THREE.Sprite(mat);
    s.position.copy(pos); s.scale.setScalar(size);
    s.material.rotation = Math.random() * Math.PI * 2;
    this.scene.add(s);
    this.sprites.push({ s, life: 0, ttl, size, grow, rise });
    return s;
  }

  muzzleFlash(pos, dir) {
    this.sprite(this.flashTex, pos, 0.35 + Math.random() * 0.2, 0xffd890, 0.06, 2);
    this.light.position.copy(pos).addScaledVector(dir, 0.1);
    this.light.intensity = 14;
  }

  bulletHole(point, normal) {
    const i = this.decalIdx % MAX_DECALS;
    this.decalIdx++;
    this.decals.count = Math.min(MAX_DECALS, this.decalIdx);
    const o = this._tmp;
    o.position.copy(point).addScaledVector(normal, 0.004);
    o.lookAt(point.clone().add(normal));
    o.rotation.z = Math.random() * Math.PI * 2;
    o.updateMatrix();
    this.decals.setMatrixAt(i, o.matrix);
    this.decals.instanceMatrix.needsUpdate = true;
    // dust puff
    this.sprite(this.smokeTex, point.clone().addScaledVector(normal, 0.05), 0.15, 0xcbb988, 0.35, 1.5, 0.1, false);
  }

  blood(point) {
    for (let i = 0; i < 3; i++) {
      const p = point.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.15));
      this.sprite(this.bloodTex, p, 0.12 + Math.random() * 0.12, 0xaa1a1a, 0.3, 1.8, -0.4, false);
    }
  }

  casing(pos, right) {
    const m = new THREE.Mesh(this.casingGeo, this.casingMat);
    m.position.copy(pos);
    this.scene.add(m);
    this.casings.push({ m, v: right.clone().multiplyScalar(1.4 + Math.random()).add(new THREE.Vector3(0, 1.6, 0)), life: 0, spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, 0) });
  }

  explosion(pos) {
    this.sprite(this.flashTex, pos, 2.5, 0xffe0a0, 0.12, 6);
    this.sprite(this.flashTex, pos, 1.5, 0xff9040, 0.3, 4);
    for (let i = 0; i < 12; i++) {
      const p = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random() * 1.2, (Math.random() - 0.5) * 1.5));
      this.sprite(this.smokeTex, p, 0.8 + Math.random(), 0x3a3530, 1.6 + Math.random(), 1.2, 0.6, false);
    }
    this.light.position.copy(pos); this.light.position.y += 0.5; this.light.intensity = 60;
  }

  update(dt) {
    this.light.intensity = Math.max(0, this.light.intensity - dt * 120);
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i]; t.life += dt;
      t.line.material.opacity = Math.max(0, 1 - t.life / t.ttl);
      if (t.life > t.ttl) { this.scene.remove(t.line); t.line.geometry.dispose(); t.line.material.dispose(); this.tracers.splice(i, 1); }
    }
    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const p = this.sprites[i]; p.life += dt;
      const k = p.life / p.ttl;
      p.s.material.opacity = 1 - k;
      p.s.scale.setScalar(p.size * (1 + p.grow * k));
      p.s.position.y += p.rise * dt;
      if (k >= 1) { this.scene.remove(p.s); p.s.material.dispose(); this.sprites.splice(i, 1); }
    }
    for (let i = this.casings.length - 1; i >= 0; i--) {
      const c = this.casings[i]; c.life += dt;
      c.v.y -= 12 * dt;
      c.m.position.addScaledVector(c.v, dt);
      c.m.rotation.x += c.spin.x * dt; c.m.rotation.y += c.spin.y * dt;
      if (c.m.position.y < 0.015) { c.m.position.y = 0.015; c.v.set(0, 0, 0); c.spin.set(0, 0, 0); c.m.rotation.x = Math.PI / 2; }
      if (c.life > 6) { this.scene.remove(c.m); this.casings.splice(i, 1); }
    }
  }

  clear() {
    this.tracers.forEach(t => { this.scene.remove(t.line); t.line.geometry.dispose(); });
    this.sprites.forEach(p => this.scene.remove(p.s));
    this.casings.forEach(c => this.scene.remove(c.m));
    this.tracers = []; this.sprites = []; this.casings = [];
    this.decals.count = 0; this.decalIdx = 0;
  }
}
