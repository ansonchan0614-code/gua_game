// First-person controller: WASD + sprint + jump, AABB collision against wall colliders,
// mouse look, head-bob, and a camera "shake" channel other systems can kick.
import * as THREE from 'three';

export const PLAYER_SPEED = 6.2;
export const SPRINT_MULT = 1.35;
const EYE_H = 1.7;
const RADIUS = 0.42;

export class Player {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0; this.pitch = 0;
    this.vy = 0; this.onGround = true;
    this.keys = {};
    this.walking = false; this.sprinting = false;
    this.bob = 0; this.shake = 0; this.shakeVec = new THREE.Vector3();
    this.hp = 100;
    this.lastDamage = -10;
    this.colliders = [];
    this.speedMult = 1;
    this.sensitivity = 0.0022;
    this.recoilPitch = 0; this.recoilYaw = 0;   // weapons feed these; decays over time
    camera.rotation.order = 'YXZ';
  }

  reset() {
    this.camera.position.set(0, EYE_H, 0);
    this.yaw = 0; this.pitch = 0; this.vy = 0; this.onGround = true;
    this.hp = 100; this.lastDamage = -10; this.shake = 0;
    this.recoilPitch = 0; this.recoilYaw = 0;
    this.applyLook();
  }

  look(dx, dy) {
    this.yaw -= dx * this.sensitivity;
    this.pitch -= dy * this.sensitivity;
    const lim = Math.PI / 2 - 0.05;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }
  applyLook() {
    this.camera.rotation.y = this.yaw + this.recoilYaw;
    this.camera.rotation.x = this.pitch + this.recoilPitch;
  }

  tryMoveAxis(axis, amount) {
    if (amount === 0) return;
    const pos = this.camera.position;
    const p = pos.clone(); p[axis] += amount;
    const box = new THREE.Box3(
      new THREE.Vector3(p.x - RADIUS, p.y - EYE_H + 0.1, p.z - RADIUS),
      new THREE.Vector3(p.x + RADIUS, p.y + 0.1, p.z + RADIUS));
    for (let i = 0; i < this.colliders.length; i++) if (this.colliders[i].intersectsBox(box)) return;
    pos[axis] = p[axis];
  }

  update(dt, allowMove = true) {
    const k = this.keys;
    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
    const fwdX = -sinY, fwdZ = -cosY, rgtX = cosY, rgtZ = -sinY;
    let mx = 0, mz = 0;
    if (allowMove) {
      if (k.KeyW || k.ArrowUp)    { mx += fwdX; mz += fwdZ; }
      if (k.KeyS || k.ArrowDown)  { mx -= fwdX; mz -= fwdZ; }
      if (k.KeyD || k.ArrowRight) { mx += rgtX; mz += rgtZ; }
      if (k.KeyA || k.ArrowLeft)  { mx -= rgtX; mz -= rgtZ; }
    }
    const len = Math.hypot(mx, mz);
    this.walking = len > 0;
    this.sprinting = this.walking && !!k.ShiftLeft && (k.KeyW || k.ArrowUp);
    if (len > 0) {
      const spd = PLAYER_SPEED * this.speedMult * (this.sprinting ? SPRINT_MULT : 1);
      const step = spd * dt / len;
      this.tryMoveAxis('x', mx * step);
      this.tryMoveAxis('z', mz * step);
    }
    if (allowMove && k.Space && this.onGround) { this.vy = 6.5; this.onGround = false; }
    this.vy -= 22 * dt;
    this.camera.position.y += this.vy * dt;
    if (this.camera.position.y <= EYE_H) { this.camera.position.y = EYE_H; this.vy = 0; this.onGround = true; }

    // head bob
    if (this.walking && this.onGround) this.bob += dt * (this.sprinting ? 12 : 9);
    const bobY = Math.abs(Math.sin(this.bob)) * (this.sprinting ? 0.05 : 0.03);
    const bobX = Math.sin(this.bob * 0.5) * (this.sprinting ? 0.03 : 0.015);

    // recoil decay
    this.recoilPitch *= Math.exp(-dt * 9);
    this.recoilYaw *= Math.exp(-dt * 9);

    // shake
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const s = this.shake * this.shake;
    this.shakeVec.set((Math.random() - 0.5) * s * 0.12, (Math.random() - 0.5) * s * 0.12, 0);

    this.applyLook();
    this.camera.rotation.z = Math.sin(this.bob * 0.5) * (this.walking ? 0.006 : 0) + this.shakeVec.x * 0.2;
    this.camera.rotation.x += this.shakeVec.y;
    this.bobOffset = { x: bobX, y: bobY };
  }

  kick(amount) { this.shake = Math.min(1, this.shake + amount); }
}
