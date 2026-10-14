// Procedural Kar98k with 4x scope. Origin = bore axis at the receiver; -Z forward.
import * as THREE from 'three';
import { makeRNG } from '../rng.js';

function woodTexture() {
  const size = 256, c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), rng = makeRNG(777);
  g.fillStyle = '#5a3a1c'; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = `rgba(${30 + rng() * 40},${18 + rng() * 20},${5 + rng() * 10},${0.25 + rng() * 0.4})`;
    g.lineWidth = 0.6 + rng() * 2.2;
    g.beginPath();
    const y = rng() * size;
    g.moveTo(0, y);
    for (let x = 0; x <= size; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 4 + (rng() - 0.5) * 2);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildKar98(mats) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.55, metalness: 0 });
  const steel = mats.darkMetal, bright = mats.metal;
  const black = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.5, metalness: 0.6 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x6fa0ff, roughness: 0.02, metalness: 0, transmission: 0.9, transparent: true, opacity: 0.45 });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (r1, r2, h, s = 16) => new THREE.CylinderGeometry(r1, r2, h, s);

  // stock: butt, grip, forend
  add(box(0.05, 0.11, 0.26), wood, 0, -0.045, 0.3, -0.06);           // butt
  add(box(0.052, 0.12, 0.02), black, 0, -0.05, 0.43);                  // butt plate
  add(box(0.045, 0.08, 0.16), wood, 0, -0.06, 0.12, 0.35);             // wrist / grip
  add(box(0.05, 0.075, 0.42), wood, 0, -0.03, -0.3);                   // forend
  add(box(0.05, 0.05, 0.18), wood, 0, 0.01, -0.57);                    // upper handguard
  add(box(0.052, 0.085, 0.025), bright, 0, -0.03, -0.52);              // barrel band
  add(box(0.052, 0.06, 0.02), bright, 0, 0.0, -0.66);                  // front band
  // receiver / action
  add(cyl(0.02, 0.02, 0.2), steel, 0, 0.0, -0.02, Math.PI / 2);
  add(box(0.045, 0.04, 0.2), steel, 0, 0.0, -0.02);
  // bolt (animated)
  const bolt = new THREE.Group();
  bolt.add(new THREE.Mesh(cyl(0.011, 0.011, 0.11), bright).rotateX(Math.PI / 2));
  const handle = new THREE.Mesh(cyl(0.006, 0.006, 0.06), bright); handle.rotation.z = Math.PI / 2; handle.position.set(0.04, -0.01, 0.0); bolt.add(handle);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), bright); knob.position.set(0.07, -0.015, 0); bolt.add(knob);
  bolt.position.set(0, 0.012, 0.06); g.add(bolt);
  // trigger
  add(box(0.03, 0.004, 0.06), steel, 0, -0.085, 0.03);
  add(box(0.006, 0.025, 0.005), bright, 0, -0.07, 0.02, 0.3);
  // barrel
  add(cyl(0.012, 0.011, 0.5), steel, 0, 0.0, -0.78, Math.PI / 2);
  add(cyl(0.013, 0.013, 0.03), steel, 0, 0.0, -1.02, Math.PI / 2);
  add(box(0.006, 0.03, 0.006), steel, 0, 0.025, -1.0);                 // front sight
  add(box(0.03, 0.02, 0.02), steel, 0, 0.03, -0.2);                    // rear sight base
  // sling swivels
  add(new THREE.TorusGeometry(0.012, 0.003, 6, 12), bright, 0, -0.1, 0.25, 0, Math.PI / 2);
  // --- 4x scope ---
  const sc = new THREE.Group();
  const tube = new THREE.Mesh(cyl(0.016, 0.016, 0.22), black); tube.rotation.x = Math.PI / 2; sc.add(tube);
  const obj = new THREE.Mesh(cyl(0.024, 0.018, 0.07), black); obj.rotation.x = Math.PI / 2; obj.position.z = -0.14; sc.add(obj);
  const eye = new THREE.Mesh(cyl(0.02, 0.022, 0.06), black); eye.rotation.x = Math.PI / 2; eye.position.z = 0.13; sc.add(eye);
  const turret = new THREE.Mesh(cyl(0.012, 0.012, 0.02), black); turret.position.y = 0.022; sc.add(turret);
  const turret2 = new THREE.Mesh(cyl(0.012, 0.012, 0.02), black); turret2.rotation.z = Math.PI / 2; turret2.position.x = 0.022; sc.add(turret2);
  const lensF = new THREE.Mesh(new THREE.CircleGeometry(0.022, 20), glass); lensF.position.z = -0.176; lensF.rotation.y = Math.PI; sc.add(lensF);
  const lensB = new THREE.Mesh(new THREE.CircleGeometry(0.019, 20), glass); lensB.position.z = 0.161; sc.add(lensB);
  // mounts
  for (const z of [-0.05, 0.06]) { const m = new THREE.Mesh(box(0.03, 0.035, 0.02), black); m.position.set(0, -0.03, z); sc.add(m); }
  sc.position.set(0, 0.075, -0.02);
  g.add(sc);

  g.traverse(o => { if (o.isMesh) { o.frustumCulled = false; } });
  return {
    group: g, bolt,
    muzzle: new THREE.Vector3(0, 0, -1.04),
    ejectPort: new THREE.Vector3(0.03, 0.02, 0.0),
    sightHeight: 0.075,
    hands: { right: [0.04, -0.13, 0.12], left: [-0.01, -0.09, -0.4] },
    stats: {
      name: 'Kar98k', dmg: 90, rpm: 50, auto: false, bolt: 1.2, mag: 5, reserve: 20, reloadTime: 0.8, perRound: true,
      hipSpread: 0.05, adsSpread: 0.0005, recoilUp: 0.06, recoilSide: 0.01, adsFov: 20, scope: true,
      hip: { pos: [0.19, -0.2, -0.45], rot: [0.03, -0.09, 0.02] }
    }
  };
}
