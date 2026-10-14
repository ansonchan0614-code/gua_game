// Frag grenade: arc preview, thrown projectile with wall/floor bounces, timed explosion
// with radius falloff damage to enemies and the player.
import * as THREE from 'three';

const GRAVITY = 14;
const FUSE = 3.5;
export const BLAST_RADIUS = 6;
export const BLAST_DMG = 130;
const R = 0.06;

let geo = null, mat = null, leverMat = null;
function makeMesh() {
  if (!geo) {
    geo = new THREE.SphereGeometry(R, 12, 10);
    mat = new THREE.MeshStandardMaterial({ color: 0x2f3a22, roughness: 0.55, metalness: 0.3 });
    leverMat = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.4, metalness: 0.8 });
  }
  const g = new THREE.Group();
  const body = new THREE.Mesh(geo, mat);
  // segmented pattern
  for (let i = 0; i < 3; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 1.0, 0.004, 6, 20), leverMat); ring.position.y = -0.03 + i * 0.03; ring.rotation.x = Math.PI / 2; g.add(ring); }
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.03, 10), leverMat); cap.position.y = R + 0.01; g.add(cap);
  g.add(body);
  return g;
}

export class Grenade {
  constructor(scene, pos, vel) {
    this.scene = scene;
    this.mesh = makeMesh();
    this.mesh.position.copy(pos);
    scene.add(this.mesh);
    this.pos = this.mesh.position;
    this.vel = vel.clone();
    this.t = 0;
    this.spin = new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8);
    this.done = false;
  }

  /** returns true when it explodes this frame */
  update(dt, colliders) {
    this.t += dt;
    this.vel.y -= GRAVITY * dt;
    // substep for bounces
    const steps = 2;
    for (let s = 0; s < steps; s++) {
      const h = dt / steps;
      stepWithBounce(this.pos, this.vel, h, colliders, R);
    }
    // ground friction
    if (this.pos.y <= R + 0.001) { this.vel.x *= Math.exp(-dt * 3); this.vel.z *= Math.exp(-dt * 3); }
    this.mesh.rotation.x += this.spin.x * dt; this.mesh.rotation.z += this.spin.z * dt;
    if (this.vel.lengthSq() < 0.01) this.spin.multiplyScalar(0.9);
    if (this.t >= FUSE) { this.done = true; this.scene.remove(this.mesh); return true; }
    return false;
  }
}

/** Shared integrator (also used for the arc preview). Mutates pos & vel. */
export function stepWithBounce(pos, vel, h, colliders, r) {
  // X
  pos.x += vel.x * h;
  if (hitsWall(pos, colliders, r)) { pos.x -= vel.x * h; vel.x *= -0.45; vel.z *= 0.8; }
  // Z
  pos.z += vel.z * h;
  if (hitsWall(pos, colliders, r)) { pos.z -= vel.z * h; vel.z *= -0.45; vel.x *= 0.8; }
  // Y
  pos.y += vel.y * h;
  if (pos.y < r) { pos.y = r; if (vel.y < -0.8) { vel.y *= -0.4; vel.x *= 0.7; vel.z *= 0.7; } else vel.y = 0; }
  if (pos.y > 3.2 - r) { pos.y = 3.2 - r; vel.y = -Math.abs(vel.y) * 0.4; }
}
function hitsWall(p, colliders, r) {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (p.x + r < c.min.x || p.x - r > c.max.x || p.z + r < c.min.z || p.z - r > c.max.z) continue;
    if (p.y > c.max.y || p.y < c.min.y) continue;
    return true;
  }
  return false;
}

/** Preview arc as a dotted line. */
export class ArcPreview {
  constructor(scene) {
    this.scene = scene;
    this.N = 40;
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.N * 3), 3));
    this.line = new THREE.Line(this.geo, new THREE.LineDashedMaterial({ color: 0xfff0a0, dashSize: 0.12, gapSize: 0.1, transparent: true, opacity: 0.8, depthTest: false }));
    this.line.visible = false; this.line.renderOrder = 999;
    scene.add(this.line);
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 24), new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.8, depthTest: false, side: THREE.DoubleSide }));
    this.marker.rotation.x = -Math.PI / 2; this.marker.visible = false; this.marker.renderOrder = 999;
    scene.add(this.marker);
    this._p = new THREE.Vector3(); this._v = new THREE.Vector3();
  }
  show(pos, vel, colliders) {
    const a = this.geo.attributes.position.array;
    this._p.copy(pos); this._v.copy(vel);
    const h = FUSE / this.N * 0.55;
    for (let i = 0; i < this.N; i++) {
      a[i * 3] = this._p.x; a[i * 3 + 1] = this._p.y; a[i * 3 + 2] = this._p.z;
      this._v.y -= GRAVITY * h;
      stepWithBounce(this._p, this._v, h, colliders, R);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeBoundingSphere();
    this.line.computeLineDistances();
    this.line.visible = true;
    this.marker.position.set(this._p.x, 0.02, this._p.z); this.marker.visible = true;
  }
  hide() { this.line.visible = false; this.marker.visible = false; }
}
