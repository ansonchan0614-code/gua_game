// Procedural M416 view model. Origin = bore axis at the rear of the receiver; -Z is forward.
import * as THREE from 'three';

export function buildM416(mats) {
  const g = new THREE.Group();
  const dark = mats.darkMetal, metal = mats.metal;
  const polymer = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.72, metalness: 0.05 });
  const tan = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.75 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.95 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x88aaff, roughness: 0.05, metalness: 0, transmission: 0.85, transparent: true, opacity: 0.5, thickness: 0.01 });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m;
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (r1, r2, h, s = 16) => new THREE.CylinderGeometry(r1, r2, h, s);

  // --- upper receiver ---
  add(box(0.072, 0.07, 0.24), dark, 0, 0.0, -0.08);
  add(box(0.05, 0.02, 0.1), metal, 0.02, 0.0, -0.02);                 // ejection port cover bulge
  add(box(0.03, 0.028, 0.07), new THREE.MeshStandardMaterial({ color: 0x0a0a0a }), 0.037, 0.004, -0.06); // ejection port
  add(box(0.03, 0.012, 0.03), dark, 0.0, 0.03, 0.03);                 // charging handle
  add(box(0.09, 0.01, 0.02), dark, 0.0, 0.03, 0.045);                 // charging latch
  // --- top rail (upper) ---
  for (let i = 0; i < 11; i++) add(box(0.07, 0.008, 0.012), metal, 0, 0.042, -0.19 + i * 0.021);
  add(box(0.07, 0.006, 0.24), metal, 0, 0.037, -0.08);
  // --- lower receiver ---
  add(box(0.066, 0.055, 0.19), dark, 0, -0.058, -0.05);
  add(box(0.05, 0.06, 0.08), dark, 0, -0.085, -0.08);                 // mag well
  add(box(0.012, 0.012, 0.018), metal, 0.036, -0.045, -0.055);         // mag release
  add(box(0.03, 0.006, 0.02), metal, -0.036, -0.03, 0.02, 0, 0, 0.5);  // selector lever
  // trigger guard + trigger
  add(box(0.028, 0.004, 0.07), dark, 0, -0.105, 0.0);
  add(box(0.028, 0.03, 0.004), dark, 0, -0.095, -0.035);
  add(box(0.028, 0.03, 0.004), dark, 0, -0.095, 0.035);
  add(box(0.008, 0.028, 0.006), metal, 0, -0.092, -0.005, 0.3);
  // pistol grip
  add(box(0.034, 0.11, 0.045), polymer, 0, -0.135, 0.06, 0.32);
  add(box(0.036, 0.012, 0.047), rubber, 0, -0.19, 0.078, 0.32);
  // --- magazine (two segments, slight curve) ---
  const mag = new THREE.Group();
  const m1 = new THREE.Mesh(box(0.036, 0.1, 0.075), polymer); m1.position.y = -0.05; mag.add(m1);
  const m2 = new THREE.Mesh(box(0.036, 0.09, 0.075), polymer); m2.position.set(0, -0.135, 0.012); m2.rotation.x = 0.22; mag.add(m2);
  const base = new THREE.Mesh(box(0.04, 0.012, 0.08), rubber); base.position.set(0, -0.185, 0.024); base.rotation.x = 0.22; mag.add(base);
  for (let i = 0; i < 5; i++) { const rib = new THREE.Mesh(box(0.038, 0.004, 0.077), rubber); rib.position.y = -0.02 - i * 0.02; mag.add(rib); }
  mag.position.set(0, -0.11, -0.08); mag.rotation.x = 0.08;
  g.add(mag);
  // --- handguard (quad rail) ---
  add(box(0.062, 0.062, 0.25), dark, 0, 0.0, -0.33);
  for (let i = 0; i < 12; i++) {
    add(box(0.07, 0.008, 0.012), metal, 0, 0.038, -0.44 + i * 0.021);     // top rail
    add(box(0.008, 0.045, 0.012), metal, 0.036, 0.0, -0.44 + i * 0.021);   // right rail
    add(box(0.008, 0.045, 0.012), metal, -0.036, 0.0, -0.44 + i * 0.021);  // left rail
    add(box(0.045, 0.008, 0.012), metal, 0, -0.036, -0.44 + i * 0.021);    // bottom rail
  }
  // vent holes in handguard
  const holeMat = new THREE.MeshStandardMaterial({ color: 0x050505 });
  for (let i = 0; i < 6; i++) { add(box(0.004, 0.012, 0.02), holeMat, 0.032, 0.018, -0.42 + i * 0.038); add(box(0.004, 0.012, 0.02), holeMat, -0.032, 0.018, -0.42 + i * 0.038); }
  add(box(0.07, 0.07, 0.015), metal, 0, 0, -0.205);                   // delta ring
  // front grip (angled)
  add(box(0.03, 0.07, 0.04), polymer, 0, -0.07, -0.36, 0.5);
  // --- barrel, gas block, flash hider ---
  add(cyl(0.011, 0.011, 0.22), metal, 0, 0, -0.56, Math.PI / 2);
  add(box(0.028, 0.045, 0.03), dark, 0, 0.01, -0.5);                  // gas block
  add(box(0.006, 0.03, 0.006), dark, 0, 0.045, -0.5);                  // front sight post
  add(cyl(0.004, 0.004, 0.24), dark, 0, 0.025, -0.37, Math.PI / 2);    // gas tube
  const fh = add(cyl(0.016, 0.014, 0.065, 12), dark, 0, 0, -0.665, Math.PI / 2);
  for (let i = 0; i < 4; i++) add(box(0.004, 0.012, 0.04), holeMat, Math.cos(i * Math.PI / 2) * 0.016, Math.sin(i * Math.PI / 2) * 0.016, -0.67);
  // --- buffer tube + stock ---
  add(cyl(0.017, 0.017, 0.18), metal, 0, 0.012, 0.13, Math.PI / 2);
  for (let i = 0; i < 5; i++) add(box(0.005, 0.005, 0.006), holeMat, 0, -0.006, 0.08 + i * 0.03);
  const stock = new THREE.Group();
  stock.add(new THREE.Mesh(box(0.045, 0.045, 0.1), polymer));
  const cheek = new THREE.Mesh(box(0.04, 0.03, 0.1), polymer); cheek.position.y = 0.03; stock.add(cheek);
  const toe = new THREE.Mesh(box(0.04, 0.09, 0.03), polymer); toe.position.set(0, -0.03, 0.05); toe.rotation.x = -0.15; stock.add(toe);
  const pad = new THREE.Mesh(box(0.042, 0.11, 0.012), rubber); pad.position.set(0, -0.025, 0.07); stock.add(pad);
  stock.position.set(0, 0.0, 0.2); g.add(stock);
  // --- red dot sight ---
  const rd = new THREE.Group();
  rd.add(new THREE.Mesh(box(0.03, 0.012, 0.06), dark));                       // mount
  const body = new THREE.Mesh(box(0.028, 0.024, 0.05), dark); body.position.y = 0.018; rd.add(body);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.004, 8, 24), dark); ring.position.set(0, 0.052, 0.0); rd.add(ring);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.018, 24), glass); lens.position.set(0, 0.052, 0.0); rd.add(lens);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0017, 10), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
  dot.position.set(0, 0.052, 0.002); rd.add(dot);
  const emis = new THREE.PointLight(0xff2020, 0, 0.2); rd.add(emis);
  rd.position.set(0, 0.044, -0.1);
  g.add(rd);

  g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; } });
  return {
    group: g,
    mag,
    muzzle: new THREE.Vector3(0, 0, -0.7),           // local
    ejectPort: new THREE.Vector3(0.04, 0.0, -0.06),
    sightHeight: 0.096,                              // y of red dot above bore axis (0.044 + 0.052)
    stats: {
      name: 'M416', dmg: 24, rpm: 700, auto: true, mag: 30, reserve: 90, reloadTime: 2.2,
      hipSpread: 0.028, adsSpread: 0.003, recoilUp: 0.011, recoilSide: 0.0045, adsFov: 58,
      hip: { pos: [0.2, -0.21, -0.5], rot: [0.02, -0.07, 0.01] }
    }
  };
}
