// Shared PBR materials built from procedural textures. Built once per session.
import * as THREE from 'three';
import * as T from './textures.js';

let cache = null;

export function getMaterials(aniso) {
  if (cache) return cache;
  const carpet = T.makeCarpet(aniso);
  const wall = T.makeWallpaper(aniso);
  const ceil = T.makeCeiling(aniso);
  const metal = T.makeMetal(aniso);

  cache = {
    carpet: new THREE.MeshStandardMaterial({
      map: carpet.map, normalMap: carpet.normalMap, roughnessMap: carpet.roughnessMap,
      normalScale: new THREE.Vector2(0.9, 0.9), roughness: 1, metalness: 0
    }),
    wall: new THREE.MeshStandardMaterial({
      map: wall.map, normalMap: wall.normalMap, roughnessMap: wall.roughnessMap,
      normalScale: new THREE.Vector2(0.5, 0.5), roughness: 1, metalness: 0
    }),
    ceiling: new THREE.MeshStandardMaterial({
      map: ceil.map, normalMap: ceil.normalMap, normalScale: new THREE.Vector2(0.7, 0.7),
      color: 0xb8b0a0, roughness: 0.95, metalness: 0
    }),
    lightPanel: new THREE.MeshBasicMaterial({ map: T.makeLightPanel(), toneMapped: true }),
    lightFrame: new THREE.MeshStandardMaterial({ map: metal.map, roughnessMap: metal.roughnessMap, color: 0xbfb79a, metalness: 0.6, roughness: 0.5 }),
    paper: new THREE.MeshStandardMaterial({ map: T.makePaper(), roughness: 0.9, side: THREE.DoubleSide }),
    plastic: new THREE.MeshPhysicalMaterial({ color: 0xdfe6e0, roughness: 0.15, metalness: 0, transmission: 0.6, thickness: 0.3, transparent: true, opacity: 0.85 }),
    cable: new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.6 }),
    metal: new THREE.MeshStandardMaterial({ map: metal.map, roughnessMap: metal.roughnessMap, metalness: 0.85, roughness: 0.45 }),
    darkMetal: new THREE.MeshStandardMaterial({ map: metal.map, roughnessMap: metal.roughnessMap, color: 0x3a3a3c, metalness: 0.8, roughness: 0.5 }),
    wetDecal: new THREE.MeshStandardMaterial({
      map: T.makeSoftDot('30,22,8'), transparent: true, opacity: 0.55, roughness: 0.15, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2
    }),
    softDot: T.makeSoftDot('255,255,255')
  };
  cache.carpet.map.repeat.set(1, 1);
  return cache;
}
