// Backrooms level builder: maze walls (merged geometry), floor, ceiling, light panels,
// litter props and the collider list the player + AI use.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRNG } from '../rng.js';

export const WALL_H = 3.2;
export const GRID = 13;
export const CELL = 5;
export const HALF = GRID * CELL / 2;
export const YELLOW = 0xd8c35f;
const WALL_T = 0.28;
const TEX_W = 2.5;      // metres covered by one wallpaper repeat

function wallBox(x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
  if (len < 0.01) return null;
  const geo = new THREE.BoxGeometry(WALL_T, WALL_H, len);
  // Scale UVs so the wallpaper never stretches on long or short segments.
  const uv = geo.attributes.uv;
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      let u = uv.getX(i), w = uv.getY(i);
      if (f < 2)       { u *= len / TEX_W; }        // ±x faces: run along z
      else if (f >= 4) { u *= WALL_T / TEX_W; }     // ±z end caps
      else             { u *= WALL_T / TEX_W; w *= len / TEX_W; }
      uv.setXY(i, u, w);
    }
  }
  const m = new THREE.Matrix4();
  m.makeRotationY(Math.atan2(dx, dz));
  m.setPosition((x1 + x2) / 2, WALL_H / 2, (z1 + z2) / 2);
  geo.applyMatrix4(m);
  geo.computeBoundingBox();
  return geo;
}

export function buildBackrooms(scene, level, mats, preset) {
  const rng = makeRNG(level * 1337 + 7);
  const colliders = [];
  const wallGeos = [];
  const nearSpawn = (x, z, r = 7) => Math.hypot(x, z) < r;

  const add = (x1, z1, x2, z2) => {
    const g = wallBox(x1, z1, x2, z2);
    if (!g) return;
    wallGeos.push(g);
    colliders.push(g.boundingBox.clone());
  };

  // ---- maze (same generator as v1 so layouts stay familiar) ----
  for (let gx = 0; gx < GRID; gx++) {
    for (let gz = 0; gz < GRID; gz++) {
      const x = -HALF + gx * CELL, z = -HALF + gz * CELL;
      if (rng() < 0.38 && !(nearSpawn(x, z) && nearSpawn(x + CELL, z))) {
        if (rng() < 0.30) { const gs = x + CELL * (0.25 + rng() * 0.3); add(x, z, gs, z); add(gs + 1.4, z, x + CELL, z); }
        else add(x, z, x + CELL, z);
      }
      if (rng() < 0.38 && !(nearSpawn(x, z) && nearSpawn(x, z + CELL))) {
        if (rng() < 0.30) { const gs = z + CELL * (0.25 + rng() * 0.3); add(x, z, x, gs); add(x, gs + 1.4, x, z + CELL); }
        else add(x, z, x, z + CELL);
      }
    }
  }
  add(-HALF, -HALF, HALF, -HALF); add(HALF, -HALF, HALF, HALF);
  add(HALF, HALF, -HALF, HALF);   add(-HALF, HALF, -HALF, -HALF);

  const wallMesh = new THREE.Mesh(mergeGeometries(wallGeos, false), mats.wall);
  wallMesh.castShadow = preset.shadows; wallMesh.receiveShadow = preset.shadows;
  scene.add(wallMesh);
  wallGeos.forEach(g => g.dispose());

  // ---- floor & ceiling ----
  const W = GRID * CELL + 10;
  const floorGeo = new THREE.PlaneGeometry(W, W);
  const floor = new THREE.Mesh(floorGeo, mats.carpet);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = preset.shadows;
  mats.carpet.map.repeat.set(W / 2.2, W / 2.2);
  mats.carpet.normalMap.repeat.copy(mats.carpet.map.repeat);
  mats.carpet.roughnessMap.repeat.copy(mats.carpet.map.repeat);
  scene.add(floor);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, W), mats.ceiling);
  ceil.rotation.x = Math.PI / 2; ceil.position.y = WALL_H;
  mats.ceiling.map.repeat.set(W / 1.2, W / 1.2);
  mats.ceiling.normalMap.repeat.copy(mats.ceiling.map.repeat);
  scene.add(ceil);

  // ---- light panels (instanced, per-instance brightness for flicker) ----
  const panelPos = [];
  for (let gx = 0; gx < GRID; gx += 2)
    for (let gz = 0; gz < GRID; gz += 1)
      panelPos.push(new THREE.Vector3(-HALF + gx * CELL + CELL / 2, WALL_H - 0.105, -HALF + gz * CELL + CELL / 2));

  const panelGeo = new THREE.PlaneGeometry(2.4, 1.0);
  panelGeo.rotateX(Math.PI / 2);
  const panels = new THREE.InstancedMesh(panelGeo, mats.lightPanel, panelPos.length);
  const frameGeo = new THREE.BoxGeometry(2.6, 0.08, 1.2);
  const frames = new THREE.InstancedMesh(frameGeo, mats.lightFrame, panelPos.length);
  const tmp = new THREE.Object3D();
  const lights = [];   // { pos, mode: 'on'|'flicker'|'dead', phase }
  const lrng = makeRNG(level * 77 + 3);
  panelPos.forEach((p, i) => {
    tmp.position.copy(p); tmp.rotation.set(0, 0, 0); tmp.updateMatrix();
    panels.setMatrixAt(i, tmp.matrix);
    tmp.position.y = WALL_H - 0.06; tmp.updateMatrix();
    frames.setMatrixAt(i, tmp.matrix);
    const r = lrng();
    const mode = r < 0.04 ? 'dead' : r < 0.16 ? 'flicker' : 'on';
    lights.push({ pos: p, mode, phase: lrng() * 10, level: mode === 'dead' ? 0.08 : 1 });
    panels.setColorAt(i, new THREE.Color().setScalar(mode === 'dead' ? 0.08 : 1.6));
  });
  panels.instanceColor.needsUpdate = true;
  panels.computeBoundingSphere(); frames.computeBoundingSphere();
  scene.add(panels, frames);

  // ---- props ----
  const prng = makeRNG(level * 991 + 11);
  const density = preset.props;
  const freeSpot = () => {
    for (let t = 0; t < 30; t++) {
      const x = prng.range(-HALF + 1, HALF - 1), z = prng.range(-HALF + 1, HALF - 1);
      const b = new THREE.Box3(new THREE.Vector3(x - 0.3, 0, z - 0.3), new THREE.Vector3(x + 0.3, 0.5, z + 0.3));
      if (!colliders.some(c => c.intersectsBox(b))) return { x, z };
    }
    return null;
  };
  // paper litter
  const paperN = Math.floor(70 * density);
  const paper = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.3, 0.42), mats.paper, paperN);
  for (let i = 0; i < paperN; i++) {
    const s = freeSpot() || { x: 0, z: 0 };
    tmp.position.set(s.x, 0.006 + prng() * 0.01, s.z);
    tmp.rotation.set(-Math.PI / 2 + prng.range(-0.08, 0.08), 0, prng() * Math.PI * 2);
    tmp.updateMatrix(); paper.setMatrixAt(i, tmp.matrix);
  }
  paper.receiveShadow = preset.shadows; paper.computeBoundingSphere();
  scene.add(paper);
  // bottles
  const botN = Math.floor(18 * density);
  const bottleGeo = new THREE.CylinderGeometry(0.04, 0.045, 0.24, 10);
  const bottles = new THREE.InstancedMesh(bottleGeo, mats.plastic, botN);
  for (let i = 0; i < botN; i++) {
    const s = freeSpot() || { x: 1, z: 1 };
    const lying = prng() < 0.7;
    tmp.position.set(s.x, lying ? 0.045 : 0.12, s.z);
    tmp.rotation.set(lying ? Math.PI / 2 : 0, prng() * Math.PI * 2, lying ? prng() * Math.PI * 2 : 0);
    tmp.updateMatrix(); bottles.setMatrixAt(i, tmp.matrix);
  }
  bottles.castShadow = preset.shadows; bottles.computeBoundingSphere();
  scene.add(bottles);
  // wet patches on carpet
  const wetN = Math.floor(14 * density);
  const wet = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mats.wetDecal, wetN);
  for (let i = 0; i < wetN; i++) {
    const s = freeSpot() || { x: 2, z: 2 };
    const sc = prng.range(1.2, 3.2);
    tmp.position.set(s.x, 0.004, s.z); tmp.rotation.set(-Math.PI / 2, 0, prng() * Math.PI * 2);
    tmp.scale.set(sc, sc * prng.range(0.6, 1), 1); tmp.updateMatrix(); wet.setMatrixAt(i, tmp.matrix);
  }
  tmp.scale.set(1, 1, 1); wet.computeBoundingSphere();
  scene.add(wet);
  // cables running along the ceiling edge of some walls
  const cableGeos = [];
  colliders.forEach(b => {
    if (prng() > 0.18 * density) return;
    const sx = b.max.x - b.min.x, sz = b.max.z - b.min.z;
    const g = new THREE.BoxGeometry(sx > sz ? sx : 0.03, 0.03, sz > sx ? sz : 0.03);
    const m = new THREE.Matrix4().setPosition(
      (b.min.x + b.max.x) / 2 + (sx > sz ? 0 : (prng() < 0.5 ? 0.17 : -0.17)),
      WALL_H - 0.12,
      (b.min.z + b.max.z) / 2 + (sz > sx ? 0 : (prng() < 0.5 ? 0.17 : -0.17)));
    g.applyMatrix4(m); cableGeos.push(g);
  });
  if (cableGeos.length) scene.add(new THREE.Mesh(mergeGeometries(cableGeos, false), mats.cable));

  // ---- flicker update ----
  const col = new THREE.Color();
  function update(t) {
    let dirty = false;
    for (let i = 0; i < lights.length; i++) {
      const L = lights[i];
      if (L.mode !== 'flicker') continue;
      // irregular buzz: product of two sines + random dropouts
      const s = Math.sin(t * 23 + L.phase) * Math.sin(t * 7.3 + L.phase * 2);
      let lvl = 0.85 + s * 0.35;
      if (Math.sin(t * 1.7 + L.phase) > 0.93) lvl = 0.1;
      L.level = lvl;
      panels.setColorAt(i, col.setScalar(lvl * 1.6));
      dirty = true;
    }
    if (dirty) panels.instanceColor.needsUpdate = true;
  }

  return { colliders, lights, update, bounds: HALF };
}

/** Random walkable point at least minDist from `from`, clear of walls. */
export function randomSpawn(colliders, from, minDist, rng = Math.random) {
  for (let i = 0; i < 80; i++) {
    const x = (rng() - 0.5) * (GRID * CELL - 8), z = (rng() - 0.5) * (GRID * CELL - 8);
    if (from && Math.hypot(x - from.x, z - from.z) < minDist) continue;
    const box = new THREE.Box3(new THREE.Vector3(x - 0.5, 0.2, z - 0.5), new THREE.Vector3(x + 0.5, 1.8, z + 0.5));
    if (!colliders.some(c => c.intersectsBox(box))) return { x, z };
  }
  return { x: 0, z: 0 };
}
