// A small pool of real PointLights re-assigned every frame to the ceiling panels nearest
// the camera, so a 49-panel room only pays for 4-8 dynamic lights.
import * as THREE from 'three';

export class LightPool {
  constructor(scene, preset) {
    this.count = preset.ssao ? 8 : preset.shadows ? 6 : 4;
    this.lights = [];
    for (let i = 0; i < this.count; i++) {
      const l = new THREE.PointLight(0xfff0c0, 0, 16, 2);
      l.position.y = 3.0;
      if (i < preset.shadowLights) {
        l.castShadow = true;
        l.shadow.mapSize.set(512, 512);
        l.shadow.bias = -0.004;
        l.shadow.camera.near = 0.2;
        l.shadow.camera.far = 16;
      }
      scene.add(l);
      this.lights.push(l);
    }
    this.scene = scene;
    this.hemi = new THREE.HemisphereLight(0xfff2c8, 0x4a3c18, 0.28);
    this.amb = new THREE.AmbientLight(0xffe9a8, 0.08);
    scene.add(this.hemi, this.amb);
    this._sorted = [];
  }

  update(panelLights, camPos) {
    // panelLights: [{pos, level}]
    this._sorted.length = 0;
    for (let i = 0; i < panelLights.length; i++) {
      const p = panelLights[i];
      if (p.level < 0.05) continue;
      this._sorted.push({ p, d: (p.pos.x - camPos.x) ** 2 + (p.pos.z - camPos.z) ** 2 });
    }
    this._sorted.sort((a, b) => a.d - b.d);
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i], s = this._sorted[i];
      if (!s) { l.intensity = 0; continue; }
      l.position.set(s.p.pos.x, 2.95, s.p.pos.z);
      l.intensity = 22 * s.p.level;
    }
  }

  dispose() {
    this.lights.forEach(l => { this.scene.remove(l); l.dispose && l.dispose(); });
    this.scene.remove(this.hemi, this.amb);
  }
}
