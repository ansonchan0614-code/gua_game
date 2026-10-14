// Holds the current weapon under the camera: sway, bob, ADS lerp, recoil kick,
// reload / swap animations, and arm meshes.
import * as THREE from 'three';

const _v = new THREE.Vector3();

export class ViewModel {
  constructor(camera, mats) {
    this.camera = camera;
    // own scene + camera (mirrors the world camera) so the gun is lit independently
    this.scene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(62, camera.aspect, 0.01, 10);
    this.scene.add(this.vmCamera);
    this.scene.add(new THREE.HemisphereLight(0xfff2c8, 0x6a5a30, 1.6));
    const sun = new THREE.DirectionalLight(0xfff0c0, 2.2); sun.position.set(0.6, 2, 0.8); this.scene.add(sun);
    this.root = new THREE.Group();
    this.vmCamera.add(this.root);
    this.pivot = new THREE.Group();
    this.root.add(this.pivot);
    this.weapon = null;
    this.ads = 0;            // 0..1
    this.adsTarget = 0;
    this.kick = 0;           // recoil kick 0..1
    this.swayX = 0; this.swayY = 0;
    this.reloadT = -1; this.swapT = -1; this.throwT = -1;
    this.bob = 0;
    this.lowered = 0;        // 1 = weapon lowered (sprint / swap)
    this.arms = this.buildArms(mats);
    this.pivot.add(this.arms.group);
    // a light that only lights the view model so it never goes fully black in a dark corner
    this.fill = new THREE.PointLight(0xfff0d0, 0.5, 2.5, 2);
    this.fill.position.set(0.3, 0.3, 0.2);
    this.vmCamera.add(this.fill);
  }

  buildArms(mats) {
    const g = new THREE.Group();
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x4b5236, roughness: 0.9 });
    const glove = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.85 });
    const mk = (geo, mat, p, r) => { const m = new THREE.Mesh(geo, mat); m.position.set(...p); if (r) m.rotation.set(...r); m.frustumCulled = false; g.add(m); return m; };
    // right arm: from lower-right toward the grip
    mk(new THREE.CylinderGeometry(0.045, 0.055, 0.42, 10), sleeve, [0.1, -0.33, 0.12], [1.25, 0, -0.2]);
    this.rHand = mk(new THREE.BoxGeometry(0.075, 0.085, 0.07), glove, [0.06, -0.16, 0.06], [0.3, 0, 0]);
    // left arm: reaches forward under the handguard
    mk(new THREE.CylinderGeometry(0.04, 0.05, 0.46, 10), sleeve, [-0.08, -0.28, -0.2], [1.45, 0, 0.3]);
    this.lHand = mk(new THREE.BoxGeometry(0.07, 0.075, 0.09), glove, [-0.01, -0.075, -0.36], [0, 0, 0.2]);
    return { group: g };
  }

  equip(weapon) {
    if (this.weapon) this.pivot.remove(this.weapon.group);
    this.weapon = weapon;
    this.pivot.add(weapon.group);
    this.swapT = 0;
    this.reloadT = -1;
    // hands follow the weapon's grip offsets
    const h = weapon.hands || {};
    if (h.right) this.rHand.position.set(...h.right);
    if (h.left) this.lHand.position.set(...h.left);
  }

  startReload(time) { this.reloadT = 0; this.reloadDur = time; }
  cancelReload() { this.reloadT = -1; }
  get reloading() { return this.reloadT >= 0; }
  get swapping() { return this.swapT >= 0 && this.swapT < 0.45; }

  fire() { this.kick = 1; }
  throwAnim() { this.throwT = 0; }
  get throwing() { return this.throwT >= 0; }
  get scoped() { return !!(this.weapon && this.weapon.stats.scope) && this.ads > 0.85; }

  update(dt, player, lookDx, lookDy) {
    const w = this.weapon;
    if (!w) return;
    const s = w.stats;
    // ADS lerp (no ADS while reloading / sprinting / swapping)
    const wantAds = this.adsTarget && !this.reloading && !player.sprinting && !this.swapping ? 1 : 0;
    this.ads += (wantAds - this.ads) * Math.min(1, dt * 11);
    // lower weapon while sprinting
    const wantLow = player.sprinting ? 1 : 0;
    this.lowered += (wantLow - this.lowered) * Math.min(1, dt * 7);
    // sway from mouse movement
    this.swayX += (-lookDx * 0.0009 - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (-lookDy * 0.0009 - this.swayY) * Math.min(1, dt * 10);
    this.swayX = THREE.MathUtils.clamp(this.swayX, -0.03, 0.03);
    this.swayY = THREE.MathUtils.clamp(this.swayY, -0.03, 0.03);
    // bob
    if (player.walking && player.onGround) this.bob += dt * (player.sprinting ? 11 : 8);
    const bobAmt = (1 - this.ads * 0.85) * (player.sprinting ? 1.8 : 1);
    const bx = Math.sin(this.bob) * 0.012 * bobAmt, by = Math.abs(Math.cos(this.bob)) * 0.01 * bobAmt;
    // recoil
    this.kick = Math.max(0, this.kick - dt * 10);
    const k = this.kick;

    // base pose
    const hip = s.hip;
    const adsPos = [0, -w.sightHeight, -0.26];
    const px = THREE.MathUtils.lerp(hip.pos[0], adsPos[0], this.ads);
    const py = THREE.MathUtils.lerp(hip.pos[1], adsPos[1], this.ads);
    const pz = THREE.MathUtils.lerp(hip.pos[2], adsPos[2], this.ads);
    const rx = THREE.MathUtils.lerp(hip.rot[0], 0, this.ads);
    const ry = THREE.MathUtils.lerp(hip.rot[1], 0, this.ads);
    const rz = THREE.MathUtils.lerp(hip.rot[2], 0, this.ads);

    this.pivot.position.set(
      px + bx + this.swayX * (1 - this.ads * 0.7),
      py + by + this.swayY * (1 - this.ads * 0.7) - this.lowered * 0.18 + k * 0.012,
      pz + k * 0.06);
    this.pivot.rotation.set(
      rx + this.swayY * 0.5 + k * 0.08 + this.lowered * 0.55,
      ry + this.swayX * 0.6 + this.lowered * 0.35,
      rz + Math.sin(this.bob * 0.5) * 0.004 * bobAmt - k * 0.03);

    // reload animation: drop mag, bring it back
    if (this.reloadT >= 0) {
      this.reloadT += dt;
      const t = this.reloadT / this.reloadDur;
      if (w.mag) {
        const drop = t < 0.35 ? t / 0.35 : t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
        w.mag.position.y = -0.11 - drop * 0.18;
        w.mag.rotation.x = 0.08 + drop * 0.4;
        this.lHand.position.y = (w.hands?.left?.[1] ?? -0.075) - drop * 0.16;
      }
      this.pivot.rotation.x += Math.sin(t * Math.PI) * 0.25;
      this.pivot.position.y -= Math.sin(t * Math.PI) * 0.05;
      if (t >= 1) { this.reloadT = -1; if (w.mag) { w.mag.position.y = -0.11; w.mag.rotation.x = 0.08; } this.lHand.position.y = w.hands?.left?.[1] ?? -0.075; }
    }
    // bolt-action cycle: lift, pull, push, drop
    if (w.model.bolt) {
      const b = w.model.bolt, bt = w.boltT;
      if (bt >= 0) {
        const t = bt / w.stats.bolt;
        const lift = t < 0.2 ? t / 0.2 : t > 0.8 ? (1 - t) / 0.2 : 1;
        const pull = t < 0.25 ? 0 : t < 0.45 ? (t - 0.25) / 0.2 : t < 0.6 ? 1 : t < 0.8 ? 1 - (t - 0.6) / 0.2 : 0;
        b.rotation.z = -lift * 1.2;
        b.position.z = 0.06 + pull * 0.09;
        this.pivot.rotation.x += lift * 0.08;
        this.pivot.position.x += lift * 0.02;
      } else { b.rotation.z = 0; b.position.z = 0.06; }
    }
    // throw animation: gun dips right, hand comes up
    if (this.throwT >= 0) {
      this.throwT += dt;
      const t = Math.min(1, this.throwT / 0.7);
      const dip = Math.sin(t * Math.PI);
      this.pivot.position.x += dip * 0.12; this.pivot.position.y -= dip * 0.2;
      this.pivot.rotation.z -= dip * 0.5; this.pivot.rotation.x += dip * 0.3;
      if (this.throwT > 0.7) this.throwT = -1;
    }
    // swap animation: raise from below
    if (this.swapT >= 0) {
      this.swapT += dt;
      const t = Math.min(1, this.swapT / 0.45);
      const e = 1 - Math.pow(1 - t, 3);
      this.pivot.position.y -= (1 - e) * 0.35;
      this.pivot.rotation.x += (1 - e) * 0.8;
      if (this.swapT > 1) this.swapT = -1;
    }
    // scoped: hide the rifle so the full-screen scope overlay reads cleanly
    this.root.visible = !this.scoped;
    // mirror the world camera
    this.vmCamera.position.copy(this.camera.position);
    this.vmCamera.quaternion.copy(this.camera.quaternion);
    this.vmCamera.updateMatrixWorld(true);
  }

  resize(aspect) { this.vmCamera.aspect = aspect; this.vmCamera.updateProjectionMatrix(); }
  muzzleWorld(out) { return this.weapon.group.localToWorld(out.copy(this.weapon.muzzle)); }
  ejectWorld(out) { return this.weapon.group.localToWorld(out.copy(this.weapon.ejectPort)); }
}
