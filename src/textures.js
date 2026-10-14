// Procedural canvas textures: albedo / normal / roughness for carpet, wallpaper, ceiling tiles,
// light panels and small props. Everything is generated at load so the repo ships no image files.
import * as THREE from 'three';
import { makeRNG } from './rng.js';

const SIZE = 512;

/* ---------- noise helpers ---------- */
function valueNoise(size, rng, scale) {
  // bilinear-interpolated lattice noise, returns Float32Array in [0,1]
  const cells = Math.max(2, Math.floor(size / scale));
  const lat = new Float32Array((cells + 1) * (cells + 1));
  for (let i = 0; i < lat.length; i++) lat[i] = rng();
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const fy = (y / size) * cells, iy = Math.floor(fy), ty = smooth(fy - iy);
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells, ix = Math.floor(fx), tx = smooth(fx - ix);
      const a = lat[iy * (cells + 1) + ix], b = lat[iy * (cells + 1) + ix + 1];
      const c = lat[(iy + 1) * (cells + 1) + ix], d = lat[(iy + 1) * (cells + 1) + ix + 1];
      out[y * size + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }
  }
  return out;
}
function smooth(t) { return t * t * (3 - 2 * t); }
function fbm(size, rng, baseScale, octaves, gain = 0.5) {
  const out = new Float32Array(size * size);
  let amp = 1, total = 0, scale = baseScale;
  for (let o = 0; o < octaves; o++) {
    const n = valueNoise(size, rng, Math.max(2, scale));
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    total += amp; amp *= gain; scale /= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

function canvas(size = SIZE) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}
function toTexture(c, { repeat = [1, 1], srgb = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}
function heightToNormal(h, size, strength = 2) {
  // Sobel-based tangent-space normal map from a height field
  const c = canvas(size), g = c.getContext('2d');
  const img = g.createImageData(size, size), d = img.data;
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      let nx = -dx, ny = -dy, nz = 1;
      const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}
function grayCanvas(v, size) {
  // v: Float32Array in [0,1] -> grayscale canvas (used for roughness maps)
  const c = canvas(size), g = c.getContext('2d');
  const img = g.createImageData(size, size), d = img.data;
  for (let i = 0; i < v.length; i++) { const k = clamp01(v[i]) * 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = k; d[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  return c;
}
function stains(g, rng, size, count, rgba, rMin, rMax) {
  for (let i = 0; i < count; i++) {
    const x = rng() * size, y = rng() * size, r = rng.range(rMin, rMax);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, rgba(0.9));
    grd.addColorStop(0.6, rgba(0.45));
    grd.addColorStop(1, rgba(0));
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
}

/* ---------- CARPET ---------- */
export function makeCarpet(aniso) {
  const rng = makeRNG(101), size = SIZE;
  const fibre = fbm(size, rng, 4, 3, 0.6);       // fine fuzz
  const blotch = fbm(size, rng, 128, 3, 0.5);    // broad discolouration
  const c = canvas(size), g = c.getContext('2d');
  const img = g.createImageData(size, size), d = img.data;
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const f = fibre[i], b = blotch[i];
    const shade = 0.72 + f * 0.38 + (b - 0.5) * 0.25;
    // base #b8a352-ish with hue drift
    d[i * 4]     = clamp01(0.72 * shade + (b - 0.5) * 0.05) * 255;
    d[i * 4 + 1] = clamp01(0.64 * shade) * 255;
    d[i * 4 + 2] = clamp01(0.32 * shade - (b - 0.5) * 0.05) * 255;
    d[i * 4 + 3] = 255;
    height[i] = f * 0.8 + b * 0.2;
    rough[i] = 0.85 + (0.5 - b) * 0.2;
  }
  g.putImageData(img, 0, 0);
  // dark water stains + dirt tracks
  stains(g, rng, size, 7, a => `rgba(60,45,15,${0.35 * a})`, 20, 70);
  stains(g, rng, size, 3, a => `rgba(40,30,10,${0.5 * a})`, 50, 120);
  // wet patches are shinier
  const roughC = grayCanvas(rough, size), rg = roughC.getContext('2d');
  const rr = makeRNG(102);
  stains(rg, rr, size, 5, a => `rgba(60,60,60,${0.9 * a})`, 30, 90);
  return {
    map: toTexture(c, { aniso }),
    normalMap: toTexture(heightToNormal(height, size, 1.6), { srgb: false, aniso }),
    roughnessMap: toTexture(roughC, { srgb: false, aniso })
  };
}

/* ---------- WALLPAPER ---------- */
export function makeWallpaper(aniso) {
  const rng = makeRNG(202), size = SIZE;
  const c = canvas(size), g = c.getContext('2d');
  const grime = fbm(size, rng, 96, 4, 0.55);
  const img = g.createImageData(size, size), d = img.data;
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const stripeW = size / 24;
  for (let y = 0; y < size; y++) {
    const yellowing = 1 - (y / size) * 0.18;   // darker toward the bottom
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const sp = (x % stripeW) / stripeW;
      const stripe = sp < 0.42 ? 1 : 0.9;            // two-tone stripes
      const ridge = sp < 0.42 ? 0.6 : 0.4;
      const gr = grime[i];
      const s = (0.95 - (gr - 0.5) * 0.18) * yellowing;
      d[i * 4]     = clamp01(0.91 * s * stripe) * 255;
      d[i * 4 + 1] = clamp01(0.86 * s * stripe) * 255;
      d[i * 4 + 2] = clamp01(0.53 * s * stripe) * 255;
      d[i * 4 + 3] = 255;
      height[i] = ridge + gr * 0.1;
      rough[i] = 0.75 + gr * 0.15;
    }
  }
  g.putImageData(img, 0, 0);
  // grime band at the bottom and drips
  const grd = g.createLinearGradient(0, size * 0.78, 0, size);
  grd.addColorStop(0, 'rgba(70,55,20,0)'); grd.addColorStop(1, 'rgba(70,55,20,0.45)');
  g.fillStyle = grd; g.fillRect(0, size * 0.78, size, size * 0.22);
  stains(g, rng, size, 6, a => `rgba(90,70,30,${0.35 * a})`, 15, 60);
  // torn patches: plaster showing through
  for (let i = 0; i < 2; i++) {
    const x = rng() * size, y = size * rng.range(0.6, 0.95), w = rng.range(10, 26), h = rng.range(8, 20);
    g.fillStyle = '#bdb3a0';
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 7; k++) g.lineTo(x + Math.cos(k / 7 * Math.PI * 2) * w * rng.range(0.6, 1), y + Math.sin(k / 7 * Math.PI * 2) * h * rng.range(0.6, 1));
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(60,45,20,0.6)'; g.lineWidth = 1.5; g.stroke();
  }
  // scuff marks
  g.strokeStyle = 'rgba(50,40,20,0.25)'; g.lineWidth = 1;
  for (let i = 0; i < 20; i++) {
    const x = rng() * size, y = size * rng.range(0.6, 1);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + rng.range(-20, 20), y + rng.range(-3, 3)); g.stroke();
  }
  return {
    map: toTexture(c, { aniso }),
    normalMap: toTexture(heightToNormal(height, size, 1.2), { srgb: false, aniso }),
    roughnessMap: toTexture(grayCanvas(rough, size), { srgb: false, aniso })
  };
}

/* ---------- CEILING TILES ---------- */
export function makeCeiling(aniso) {
  const rng = makeRNG(303), size = SIZE;
  const c = canvas(size), g = c.getContext('2d');
  const speck = fbm(size, rng, 3, 2, 0.5);
  const img = g.createImageData(size, size), d = img.data;
  const height = new Float32Array(size * size);
  const tiles = 2;                       // texture covers 2x2 tiles
  const tw = size / tiles, gap = 3;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const inGap = (x % tw) < gap || (y % tw) < gap;
      const sp = speck[i];
      let s = 0.82 + sp * 0.18;
      if (inGap) s = 0.35;
      d[i * 4] = 0.90 * s * 255; d[i * 4 + 1] = 0.85 * s * 255; d[i * 4 + 2] = 0.60 * s * 255; d[i * 4 + 3] = 255;
      height[i] = inGap ? 0 : 0.5 + sp * 0.5;
    }
  }
  g.putImageData(img, 0, 0);
  stains(g, rng, size, 5, a => `rgba(80,60,20,${0.4 * a})`, 20, 80);
  return {
    map: toTexture(c, { aniso }),
    normalMap: toTexture(heightToNormal(height, size, 1.5), { srgb: false, aniso })
  };
}

/* ---------- LIGHT PANEL ---------- */
export function makeLightPanel() {
  const size = 256, c = canvas(size), g = c.getContext('2d');
  g.fillStyle = '#fff6d2'; g.fillRect(0, 0, size, size);
  // diffuser grid
  g.strokeStyle = 'rgba(200,190,150,0.25)'; g.lineWidth = 1;
  for (let x = 0; x < size; x += 12) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, size); g.stroke(); }
  for (let y = 0; y < size; y += 12) { g.beginPath(); g.moveTo(0, y); g.lineTo(size, y); g.stroke(); }
  // two tubes glowing through
  const tube = (y) => {
    const grd = g.createLinearGradient(0, y - 22, 0, y + 22);
    grd.addColorStop(0, 'rgba(255,255,245,0)'); grd.addColorStop(0.5, 'rgba(255,255,250,0.85)'); grd.addColorStop(1, 'rgba(255,255,245,0)');
    g.fillStyle = grd; g.fillRect(10, y - 22, size - 20, 44);
  };
  tube(size * 0.33); tube(size * 0.67);
  // dead bugs / dirt in corners
  const rng = makeRNG(404);
  g.fillStyle = 'rgba(60,50,30,0.5)';
  for (let i = 0; i < 25; i++) { g.beginPath(); g.arc(rng() * size, size * (rng() < 0.5 ? rng.range(0, 0.1) : rng.range(0.9, 1)), rng.range(1, 2.5), 0, Math.PI * 2); g.fill(); }
  return toTexture(c, { aniso: 2 });
}

/* ---------- PAPER (floor litter) ---------- */
export function makePaper() {
  const size = 128, c = canvas(size), g = c.getContext('2d');
  g.fillStyle = '#e9e2c8'; g.fillRect(0, 0, size, size);
  g.fillStyle = 'rgba(40,40,40,0.55)';
  const rng = makeRNG(505);
  for (let y = 14; y < size - 10; y += 9) {
    const w = rng.range(0.5, 0.95) * (size - 24);
    g.fillRect(12, y, w, 2);
  }
  g.fillStyle = 'rgba(120,90,30,0.35)';
  g.beginPath(); g.arc(size * 0.7, size * 0.3, 18, 0, Math.PI * 2); g.fill();
  return toTexture(c, { aniso: 2 });
}

/* ---------- generic dirty metal / plastic ---------- */
export function makeMetal(aniso, tint = [0.55, 0.55, 0.56]) {
  const rng = makeRNG(606), size = 256;
  const n = fbm(size, rng, 32, 4, 0.5);
  const c = canvas(size), g = c.getContext('2d');
  const img = g.createImageData(size, size), d = img.data;
  const rough = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const s = 0.8 + (n[i] - 0.5) * 0.5;
    d[i * 4] = tint[0] * s * 255; d[i * 4 + 1] = tint[1] * s * 255; d[i * 4 + 2] = tint[2] * s * 255; d[i * 4 + 3] = 255;
    rough[i] = 0.35 + n[i] * 0.4;
  }
  g.putImageData(img, 0, 0);
  // scratches
  g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1;
  for (let i = 0; i < 40; i++) {
    const x = rng() * size, y = rng() * size, a = rng() * Math.PI, l = rng.range(5, 30);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  return { map: toTexture(c, { aniso }), roughnessMap: toTexture(grayCanvas(rough, size), { srgb: false, aniso }) };
}

/* ---------- soft round sprite (used for decals, muzzle flash, smoke) ---------- */
export function makeSoftDot(color = '255,255,255', size = 128) {
  const c = canvas(size), g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, `rgba(${color},1)`); grd.addColorStop(0.4, `rgba(${color},0.6)`); grd.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
