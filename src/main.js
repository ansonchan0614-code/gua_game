// Game bootstrap: renderer, state machine (menu → ready → playing → won/lost), level flow,
// input, shooting, enemy orchestration, HUD. Systems live in their own modules.
import * as THREE from 'three';
import { settings } from './settings.js';
import { getMaterials } from './materials.js';
import { buildBackrooms, randomSpawn, YELLOW } from './world/backrooms.js';
import { LightPool } from './lights.js';
import { PostFX } from './postfx.js';
import { Player } from './player.js';
import { Soldier } from './enemies/soldier.js';
import { enemyCfg, makeBrain, stepEnemy } from './enemies/ai.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { HUD } from './hud.js';
import { ViewModel } from './weapons/viewmodel.js';
import { Weapon } from './weapons/weapon.js';
import { buildM416 } from './weapons/m416.js';
import { makeRNG } from './rng.js';

const LEVELS = [
  { time: 25, enemies: 2,  tier: 1, name: 'THE HUM' },
  { time: 30, enemies: 4,  tier: 1, name: 'DAMP CARPET' },
  { time: 35, enemies: 6,  tier: 2, name: 'WRONG TURN' },
  { time: 40, enemies: 8,  tier: 2, name: 'ENDLESS HALL' },
  { time: 45, enemies: 11, tier: 3, name: 'THE BUZZ' },
  { time: 50, enemies: 14, tier: 3, name: 'LOST SOULS' },
  { time: 55, enemies: 17, tier: 4, name: 'THEY KNOW' },
  { time: 60, enemies: 20, tier: 4, name: 'NO EXIT' },
  { time: 65, enemies: 24, tier: 5, name: 'TERMINAL' },
  { time: 75, enemies: 28, tier: 5, name: 'LEVEL 0' }
];
const DIFF = ['EASY','EASY','NORMAL','NORMAL','HARD','HARD','VERY HARD','VERY HARD','EXTREME','EXTREME'];
const BASE_FOV = 78;

/* ---------------- renderer ---------------- */
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const preset = settings.preset;
renderer.setPixelRatio(Math.min(devicePixelRatio, preset.pixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = preset.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;

const camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, 0.03, 200);
const mats = getMaterials(Math.min(preset.aniso, renderer.capabilities.getMaxAnisotropy()));

let scene = new THREE.Scene();
let postfx = new PostFX(renderer, scene, camera, preset);
const player = new Player(camera);
const hud = new HUD();
const audio = new Audio();
const viewmodel = new ViewModel(camera, mats);
postfx.setViewModel(viewmodel.scene, viewmodel.vmCamera);

/* ---------------- state ---------------- */
let state = 'menu';
let level = 1, cfg = enemyCfg(1);
let world = null, lightPool = null, fx = null;
let enemies = [];
let timeLeft = 0, kills = 0;
let isLocked = false;
let mouseDown = false, lookDx = 0, lookDy = 0;
let weapon = null;
const raycaster = new THREE.Raycaster();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const clock = new THREE.Clock();

function lsReset() { settings.progress = 1; }

/* ---------------- menu ---------------- */
const menuEl = document.getElementById('menu');
const gridEl = document.getElementById('levelGrid');
const progressEl = document.getElementById('progressText');
const endEl = document.getElementById('endScreen');
const endTitle = document.getElementById('endTitle');
const endSub = document.getElementById('endSub');
const endBtns = document.getElementById('endBtns');

function renderMenu() {
  const progress = settings.progress;
  gridEl.innerHTML = '';
  LEVELS.forEach((lv, i) => {
    const card = document.createElement('div');
    const locked = (i + 1) > progress;
    card.className = 'levelCard tier-' + lv.tier + (locked ? ' locked' : '');
    card.innerHTML = `<div class="num">${i + 1}</div><div class="meta">${lv.time}s · ${lv.enemies} en</div><div class="diff">${DIFF[i]}</div>`;
    if (!locked) card.addEventListener('click', () => startLevel(i + 1));
    gridEl.appendChild(card);
  });
  progressEl.textContent = 'Progress: ' + progress + ' / 10';
  document.querySelectorAll('#gfxSeg button').forEach(b => b.classList.toggle('active', b.dataset.gfx === settings.gfx));
}
document.querySelectorAll('#gfxSeg button').forEach(b => b.addEventListener('click', () => {
  if (b.dataset.gfx === settings.gfx) return;
  settings.setGfx(b.dataset.gfx);
  location.reload();   // renderer-level settings need a fresh context
}));
document.getElementById('resetBtn').addEventListener('click', function () {
  if (this.dataset.armed === '1') { lsReset(); this.dataset.armed = ''; this.textContent = 'Reset Progress'; renderMenu(); }
  else { this.dataset.armed = '1'; this.textContent = 'Click again to confirm'; setTimeout(() => { if (this.dataset.armed === '1') { this.dataset.armed = ''; this.textContent = 'Reset Progress'; } }, 3000); }
});

/* ---------------- scene build ---------------- */
function buildScene(n) {
  if (lightPool) lightPool.dispose();
  scene = new THREE.Scene();
  scene.background = new THREE.Color(YELLOW).multiplyScalar(0.55);
  scene.fog = new THREE.FogExp2(new THREE.Color(0xcbb45a).multiplyScalar(0.75).getHex(), 0.055);
  scene.add(camera);
  world = buildBackrooms(scene, n, mats, preset);
  lightPool = new LightPool(scene, preset);
  if (fx) fx.clear();
  fx = new FX(scene, mats);
  postfx.setScene(scene, camera);
  player.colliders = world.colliders;
}

function spawnEnemies(n) {
  enemies.forEach(e => e.dispose(scene));
  enemies = [];
  const rng = makeRNG(n * 99991);
  const count = LEVELS[n - 1].enemies;
  for (let i = 0; i < count; i++) {
    const s = randomSpawn(world.colliders, camera.position, 20, rng);
    const e = new Soldier(n, preset.shadows);
    e.group.position.set(s.x, 0, s.z);
    e.brain = makeBrain(s.x, s.z);
    e.hp = cfg.hp;
    scene.add(e.group);
    enemies.push(e);
  }
}

/* ---------------- level flow ---------------- */
function startLevel(n) {
  level = n; cfg = enemyCfg(n);
  timeLeft = LEVELS[n - 1].time; kills = 0;
  player.reset();
  buildScene(n);
  spawnEnemies(n);
  weapon = new Weapon(buildM416(mats));
  weapon.model.hands = { right: [0.06, -0.16, 0.06], left: [-0.01, -0.075, -0.36] };
  viewmodel.equip(weapon);
  camera.fov = BASE_FOV; camera.updateProjectionMatrix();

  menuEl.style.display = 'none';
  endEl.classList.remove('on');
  hud.show(true);
  canvas.classList.add('in-game');
  hud.ready('LEVEL ' + n + ' — ' + LEVELS[n - 1].name,
    `Survive ${LEVELS[n - 1].time}s &nbsp;·&nbsp; Click to begin<br><span style="opacity:.7"><kbd>WASD</kbd> move · <kbd>Shift</kbd> sprint · <kbd>RMB</kbd> aim · <kbd>R</kbd> reload</span>`);
  updateHud();
  state = 'ready';
}

function beginPlay() {
  if (state !== 'ready') return;
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
}

function endLevel(win) {
  if (state === 'won' || state === 'lost') return;
  state = win ? 'won' : 'lost';
  if (document.pointerLockElement) document.exitPointerLock();
  const progress = settings.progress;
  if (win && level >= progress && level < 10) settings.progress = level + 1;
  else if (win && level === 10) settings.progress = 10;

  endTitle.textContent = win ? 'LEVEL CLEAR' : 'YOU DIED';
  endTitle.className = win ? 'win' : 'lose';
  endSub.textContent = win ? `Survived ${LEVELS[level - 1].time}s — Kills: ${kills}` : `Killed ${kills} soldiers before falling`;
  endBtns.innerHTML = '';
  const btn = (txt, cls, fn) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = txt; b.addEventListener('click', fn); endBtns.appendChild(b); };
  if (win) {
    if (level < 10) btn('Next Level', 'primary', () => startLevel(level + 1));
    else { const d = document.createElement('div'); d.style.cssText = 'color:#a8e07a;font-size:14px;letter-spacing:3px;padding:14px'; d.textContent = '🏆  YOU ESCAPED'; endBtns.appendChild(d); }
    btn('Replay', '', () => startLevel(level));
  } else btn('Retry', 'primary', () => startLevel(level));
  btn('Menu', '', backToMenu);
  endEl.classList.add('on');
  renderMenu();
}

function backToMenu() {
  state = 'menu';
  if (document.pointerLockElement) document.exitPointerLock();
  endEl.classList.remove('on');
  hud.show(false); hud.hideReady();
  canvas.classList.remove('in-game');
  menuEl.style.display = 'flex';
  renderMenu();
}

/* ---------------- input ---------------- */
canvas.addEventListener('mousedown', (e) => {
  if (state === 'ready' && e.button === 0) { beginPlay(); return; }
  if (state !== 'playing' || !isLocked) return;
  if (e.button === 0) { mouseDown = true; tryShoot(); }
  if (e.button === 2) viewmodel.adsTarget = 1;
});
canvas.addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; if (e.button === 2) viewmodel.adsTarget = 0; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('pointerlockchange', () => {
  isLocked = document.pointerLockElement === canvas;
  if (isLocked) {
    audio.start();
    if (state === 'ready') { hud.hideReady(); state = 'playing'; clock.getDelta(); }
  } else if (state === 'playing') {
    hud.ready('PAUSED', 'Click to resume');
    state = 'ready'; mouseDown = false; viewmodel.adsTarget = 0;
  }
});
document.addEventListener('mousemove', (e) => {
  if (!isLocked) return;
  const sens = viewmodel.ads > 0.5 ? 0.55 : 1;
  player.sensitivity = 0.0022 * sens;
  player.look(e.movementX, e.movementY);
  lookDx += e.movementX; lookDy += e.movementY;
});
document.addEventListener('keydown', (e) => {
  player.keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'F3') { e.preventDefault(); hud.toggleFps(); }
  if (state !== 'playing') return;
  if (e.code === 'KeyR') tryReload();
});
document.addEventListener('keyup', (e) => { player.keys[e.code] = false; });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  postfx.resize(innerWidth, innerHeight);
  viewmodel.resize(innerWidth / innerHeight);
});
addEventListener('blur', () => { for (const k in player.keys) player.keys[k] = false; mouseDown = false; });

/* ---------------- shooting ---------------- */
function tryReload() {
  if (!weapon || viewmodel.reloading || !weapon.canReload || viewmodel.swapping) return;
  viewmodel.startReload(weapon.stats.reloadTime);
  audio.reloadClick(0);
  setTimeout(() => { if (viewmodel.reloading) audio.reloadClick(1); }, weapon.stats.reloadTime * 650);
  setTimeout(() => { if (state !== 'menu') weapon.reload(); }, weapon.stats.reloadTime * 1000);
}

function tryShoot() {
  if (state !== 'playing' || !weapon || viewmodel.reloading || viewmodel.swapping || player.sprinting) return;
  if (!weapon.canFire()) {
    if (weapon.empty && weapon.cd <= 0) { audio.dryFire(); weapon.cd = 0.25; if (weapon.canReload) tryReload(); }
    return;
  }
  const ads = viewmodel.ads > 0.6;
  const shot = weapon.fire(ads);
  audio.rifleShot();
  viewmodel.fire();
  player.recoilPitch += shot.recoilPitch;
  player.recoilYaw += shot.recoilYaw;
  player.kick(0.12);
  postfx.flash = Math.max(postfx.flash, 0.04);

  // ray from camera centre with spread
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const sp = shot.spread;
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * sp;
  dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
  raycaster.set(camera.position, dir); raycaster.near = 0.05; raycaster.far = 150;

  const targets = [];
  for (const e of enemies) if (e.alive) targets.push(...e.hitboxes);
  const hits = raycaster.intersectObjects(targets, false);
  let end = _v.copy(camera.position).addScaledVector(dir, 150);
  let wallHit = null;
  // nearest wall along the ray
  let best = 150;
  const hitPt = new THREE.Vector3();
  for (const c of world.colliders) {
    const h = raycaster.ray.intersectBox(c, hitPt);
    if (h) { const d = h.distanceTo(camera.position); if (d < best) { best = d; wallHit = { point: h.clone(), box: c }; } }
  }
  const floorT = dir.y < 0 ? (0.02 - camera.position.y) / dir.y : Infinity;
  const ceilT = dir.y > 0 ? (3.18 - camera.position.y) / dir.y : Infinity;
  const planeT = Math.min(floorT, ceilT);
  if (planeT < best) { best = planeT; wallHit = { point: camera.position.clone().addScaledVector(dir, planeT), normal: new THREE.Vector3(0, floorT < ceilT ? 1 : -1, 0) }; }

  const muzzle = viewmodel.muzzleWorld(_v2);
  fx.muzzleFlash(muzzle, dir);
  fx.casing(viewmodel.ejectWorld(_v3), right);

  if (hits.length && hits[0].distance < best) {
    const h = hits[0];
    const enemy = h.object.userData.enemy;
    const res = enemy.hit(h.object, weapon.stats.dmg);
    const killed = enemy.applyDamage(res.damage);
    fx.blood(h.point);
    hud.hitmark(killed);
    audio.hitMarker(res.part === 'head');
    if (killed) { kills++; }
    end = h.point;
  } else if (wallHit) {
    end = wallHit.point;
    let n = wallHit.normal;
    if (!n) {
      // pick the box face the point lies on
      const b = wallHit.box, p = wallHit.point;
      const dx = Math.min(Math.abs(p.x - b.min.x), Math.abs(p.x - b.max.x));
      const dz = Math.min(Math.abs(p.z - b.min.z), Math.abs(p.z - b.max.z));
      n = dx < dz ? new THREE.Vector3(Math.abs(p.x - b.min.x) < Math.abs(p.x - b.max.x) ? -1 : 1, 0, 0)
                  : new THREE.Vector3(0, 0, Math.abs(p.z - b.min.z) < Math.abs(p.z - b.max.z) ? -1 : 1);
    }
    fx.bulletHole(end, n);
  }
  fx.tracer(muzzle, end);
  if (weapon.empty && weapon.canReload) setTimeout(tryReload, 150);
}

/* ---------------- enemies ---------------- */
function enemyShoot(e, willHit) {
  const spread = willHit ? 0.35 : 3.5;
  const target = new THREE.Vector3(
    camera.position.x + (Math.random() - 0.5) * spread,
    camera.position.y - 0.15 + (Math.random() - 0.5) * spread,
    camera.position.z + (Math.random() - 0.5) * spread);
  const m = e.muzzleWorld(new THREE.Vector3());
  fx.tracer(m, target, 0xffaa55);
  fx.muzzleFlash(m, target.clone().sub(m).normalize());
  audio.enemyShot(e.brain.distToPlayer);
  if (willHit) damagePlayer(3 + Math.random() * 3);
}

function damagePlayer(amount) {
  if (state !== 'playing') return;
  player.hp -= amount;
  player.lastDamage = performance.now() / 1000;
  player.kick(0.25);
  postfx.red = Math.min(1, postfx.red + 0.5);
  hud.damage(); audio.hurt();
  if (player.hp <= 0) { player.hp = 0; updateHud(); endLevel(false); }
}

function updateRegen(dt) {
  const now = performance.now() / 1000;
  if (now - player.lastDamage > 4 && player.hp < 100) player.hp = Math.min(100, player.hp + dt * 8);
}

/* ---------------- HUD ---------------- */
function updateHud() {
  hud.update({ hp: player.hp, kills, timeLeft, level, levelName: LEVELS[level - 1].name, weapon,
    ads: viewmodel.ads > 0.5, spread: player.walking || weapon?.burst > 1 });
}

/* ---------------- main loop ---------------- */
let elapsed = 0;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;
  hud.fps(dt);

  if (state === 'playing') {
    player.update(dt, true);
    weapon.update(dt);
    if (mouseDown && weapon.stats.auto) tryShoot();
    const ctx = { colliders: world.colliders, playerPos: camera.position, cfg, dt, enemies, onShoot: enemyShoot };
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.alive) {
        stepEnemy(e, ctx);
        e.aimPitch = Math.atan2(camera.position.y - 1.4, Math.max(0.5, e.brain.distToPlayer)) * 0.5;
        e.animate(dt, e.brain.moving, cfg.speed / 3.5);
      } else {
        e.animate(dt, false);
        if (e.isGone()) { e.dispose(scene); enemies.splice(i, 1); }
      }
    }
    updateRegen(dt);
    timeLeft -= dt;
    if (timeLeft <= 0) { timeLeft = 0; updateHud(); endLevel(true); }
    updateHud();
  } else if (state === 'ready') {
    player.update(dt, false);
  }

  if (world) {
    world.update(elapsed);
    lightPool.update(world.lights, camera.position);
    fx.update(dt);
  }
  // ADS zoom
  const targetFov = weapon ? THREE.MathUtils.lerp(BASE_FOV, weapon.stats.adsFov, viewmodel.ads) : BASE_FOV;
  if (Math.abs(camera.fov - targetFov) > 0.01) { camera.fov = targetFov; camera.updateProjectionMatrix(); }
  viewmodel.update(dt, player, lookDx, lookDy);
  lookDx = 0; lookDy = 0;

  if (state !== 'menu') postfx.render(dt, elapsed);
}

/* ---------------- boot ---------------- */
document.getElementById('loading').classList.add('hidden');
renderMenu();
buildScene(1);
weapon = new Weapon(buildM416(mats));
weapon.model.hands = { right: [0.06, -0.16, 0.06], left: [-0.01, -0.075, -0.36] };
viewmodel.equip(weapon);
animate();

// debug hooks (used by the automated screenshot check)
window.__game = {
  startLevel,
  forcePlay() { if (state === 'ready') { hud.hideReady(); state = 'playing'; clock.getDelta(); } },
  get state() { return state; },
  player, camera, viewmodel, get enemies() { return enemies; }, get scene() { return scene; }, get world() { return world; }
};
