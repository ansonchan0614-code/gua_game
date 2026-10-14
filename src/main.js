// Game bootstrap: renderer, state machine (menu → ready → playing → won/lost), level flow,
// input, weapons (M416 / Kar98k / grenades), enemy orchestration, HUD.
import * as THREE from 'three';
import { settings } from './settings.js';
import { getMaterials } from './materials.js';
import { buildBackrooms, randomSpawn, YELLOW } from './world/backrooms.js';
import { LightPool } from './lights.js';
import { PostFX } from './postfx.js';
import { Player } from './player.js';
import { Soldier } from './enemies/soldier.js';
import { enemyCfg, makeBrain, stepEnemy, checkLOS } from './enemies/ai.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { HUD } from './hud.js';
import { ViewModel } from './weapons/viewmodel.js';
import { Weapon } from './weapons/weapon.js';
import { buildM416 } from './weapons/m416.js';
import { buildKar98 } from './weapons/kar98.js';
import { Grenade, ArcPreview, BLAST_RADIUS, BLAST_DMG } from './weapons/grenade.js';
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
const GRENADES_PER_LEVEL = 2;

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
let world = null, lightPool = null, fx = null, arc = null;
let enemies = [], grenades = [];
let timeLeft = 0, kills = 0;
let isLocked = false;
let mouseDown = false, lookDx = 0, lookDy = 0;
let weapons = [], slot = 0, weapon = null;
let grenadeCount = GRENADES_PER_LEVEL, gHeld = false, gHoldT = 0;
let reloadTimer = null;
const raycaster = new THREE.Raycaster();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const clock = new THREE.Clock();

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
  if (this.dataset.armed === '1') { settings.progress = 1; this.dataset.armed = ''; this.textContent = 'Reset Progress'; renderMenu(); }
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
  arc = new ArcPreview(scene);
  grenades.forEach(g => scene.remove(g.mesh)); grenades = [];
  postfx.setScene(scene, camera);
  player.colliders = world.colliders;
}

function spawnEnemies(n) {
  enemies.forEach(e => e.dispose(scene));
  enemies = [];
  const rng = makeRNG(n * 99991);
  for (let i = 0; i < LEVELS[n - 1].enemies; i++) {
    const s = randomSpawn(world.colliders, camera.position, 20, rng);
    const e = new Soldier(n, preset.shadows);
    e.group.position.set(s.x, 0, s.z);
    e.brain = makeBrain(s.x, s.z);
    e.hp = cfg.hp; e.maxHp = cfg.hp;
    scene.add(e.group);
    enemies.push(e);
  }
}

function setupWeapons() {
  const m = buildM416(mats);
  m.hands = { right: [0.06, -0.16, 0.06], left: [-0.01, -0.075, -0.36] };
  weapons = [new Weapon(m), new Weapon(buildKar98(mats))];
  slot = 0; weapon = weapons[0];
  viewmodel.equip(weapon);
  grenadeCount = GRENADES_PER_LEVEL;
}

/* ---------------- level flow ---------------- */
function startLevel(n) {
  level = n; cfg = enemyCfg(n);
  timeLeft = LEVELS[n - 1].time; kills = 0;
  clearTimeout(reloadTimer); viewmodel.cancelReload();
  player.reset();
  buildScene(n);
  spawnEnemies(n);
  setupWeapons();
  camera.fov = BASE_FOV; camera.updateProjectionMatrix();

  menuEl.style.display = 'none';
  endEl.classList.remove('on');
  hud.show(true);
  canvas.classList.add('in-game');
  hud.ready('LEVEL ' + n + ' — ' + LEVELS[n - 1].name,
    `Survive ${LEVELS[n - 1].time}s &nbsp;·&nbsp; Click to begin<br><span style="opacity:.7"><kbd>WASD</kbd> move · <kbd>Shift</kbd> sprint · <kbd>RMB</kbd> aim · <kbd>R</kbd> reload · <kbd>1</kbd><kbd>2</kbd> weapons · hold <kbd>G</kbd> grenade</span>`);
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
  arc.hide(); viewmodel.adsTarget = 0; mouseDown = false;

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
  hud.enemyBars([]);
  renderMenu();
}

function backToMenu() {
  state = 'menu';
  if (document.pointerLockElement) document.exitPointerLock();
  endEl.classList.remove('on');
  hud.show(false); hud.hideReady(); hud.enemyBars([]);
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
canvas.addEventListener('wheel', (e) => { if (state === 'playing' && isLocked) switchWeapon(slot ^ 1); }, { passive: true });
document.addEventListener('pointerlockchange', () => {
  isLocked = document.pointerLockElement === canvas;
  if (isLocked) {
    audio.start();
    if (state === 'ready') { hud.hideReady(); state = 'playing'; clock.getDelta(); }
  } else if (state === 'playing') {
    hud.ready('PAUSED', 'Click to resume');
    state = 'ready'; mouseDown = false; viewmodel.adsTarget = 0; gHeld = false; arc.hide();
  }
});
document.addEventListener('mousemove', (e) => {
  if (!isLocked) return;
  const sens = viewmodel.scoped ? 0.22 : viewmodel.ads > 0.5 ? 0.6 : 1;
  player.sensitivity = 0.0022 * sens;
  player.look(e.movementX, e.movementY);
  lookDx += e.movementX; lookDy += e.movementY;
});
document.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  player.keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'F3') { e.preventDefault(); hud.toggleFps(); }
  if (state !== 'playing') return;
  if (e.code === 'KeyR') tryReload();
  if (e.code === 'Digit1') switchWeapon(0);
  if (e.code === 'Digit2') switchWeapon(1);
  if (e.code === 'KeyG' && grenadeCount > 0 && !viewmodel.throwing) { gHeld = true; gHoldT = 0; }
});
document.addEventListener('keyup', (e) => {
  player.keys[e.code] = false;
  if (e.code === 'KeyG' && gHeld) { gHeld = false; arc.hide(); if (state === 'playing') throwGrenade(); }
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  postfx.resize(innerWidth, innerHeight);
  viewmodel.resize(innerWidth / innerHeight);
});
addEventListener('blur', () => { for (const k in player.keys) player.keys[k] = false; mouseDown = false; gHeld = false; if (arc) arc.hide(); });

/* ---------------- weapons ---------------- */
function switchWeapon(i) {
  if (i === slot || !weapons[i] || viewmodel.swapping) return;
  clearTimeout(reloadTimer); viewmodel.cancelReload();
  slot = i; weapon = weapons[i];
  viewmodel.equip(weapon);
  audio.reloadClick(1);
  updateHud();
}

function tryReload() {
  if (!weapon || viewmodel.reloading || !weapon.canReload || viewmodel.swapping || weapon.boltT >= 0) return;
  const s = weapon.stats;
  viewmodel.startReload(s.reloadTime);
  audio.reloadClick(0);
  if (s.perRound) {
    reloadTimer = setTimeout(() => {
      if (state === 'menu' || weapon.stats !== s) return;
      weapon.ammo++; weapon.reserve--; audio.reloadClick(1);
      if (weapon.canReload && !mouseDown) tryReload();
    }, s.reloadTime * 1000);
  } else {
    setTimeout(() => { if (viewmodel.reloading) audio.reloadClick(1); }, s.reloadTime * 650);
    reloadTimer = setTimeout(() => { if (state !== 'menu' && weapon.stats === s) weapon.reload(); }, s.reloadTime * 1000);
  }
}

/** Nearest wall / floor / ceiling hit along a ray. */
function worldHit(origin, dir, maxDist) {
  let best = maxDist, hit = null;
  const pt = new THREE.Vector3();
  raycaster.set(origin, dir); raycaster.near = 0.05; raycaster.far = maxDist;
  for (const c of world.colliders) {
    const h = raycaster.ray.intersectBox(c, pt);
    if (h) { const d = h.distanceTo(origin); if (d < best) { best = d; hit = { point: h.clone(), box: c }; } }
  }
  const floorT = dir.y < 0 ? (0.02 - origin.y) / dir.y : Infinity;
  const ceilT = dir.y > 0 ? (3.18 - origin.y) / dir.y : Infinity;
  const planeT = Math.min(floorT, ceilT);
  if (planeT < best) { best = planeT; hit = { point: origin.clone().addScaledVector(dir, planeT), normal: new THREE.Vector3(0, floorT < ceilT ? 1 : -1, 0) }; }
  if (hit && !hit.normal) {
    const b = hit.box, p = hit.point;
    const dx = Math.min(Math.abs(p.x - b.min.x), Math.abs(p.x - b.max.x));
    const dz = Math.min(Math.abs(p.z - b.min.z), Math.abs(p.z - b.max.z));
    hit.normal = dx < dz ? new THREE.Vector3(Math.abs(p.x - b.min.x) < Math.abs(p.x - b.max.x) ? -1 : 1, 0, 0)
                         : new THREE.Vector3(0, 0, Math.abs(p.z - b.min.z) < Math.abs(p.z - b.max.z) ? -1 : 1);
  }
  return { hit, dist: best };
}

function tryShoot() {
  if (state !== 'playing' || !weapon || viewmodel.reloading || viewmodel.swapping || viewmodel.throwing || player.sprinting || gHeld) return;
  if (!weapon.canFire()) {
    if (weapon.empty && weapon.cd <= 0 && weapon.boltT < 0) { audio.dryFire(); weapon.cd = 0.25; if (weapon.canReload) tryReload(); }
    return;
  }
  const ads = viewmodel.ads > 0.6;
  const shot = weapon.fire(ads);
  if (weapon.stats.bolt) { audio.sniperShot(); setTimeout(() => audio.bolt(), 250); } else audio.rifleShot();
  viewmodel.fire();
  player.recoilPitch += shot.recoilPitch;
  player.recoilYaw += shot.recoilYaw;
  player.kick(weapon.stats.bolt ? 0.35 : 0.12);
  postfx.flash = Math.max(postfx.flash, 0.04);
  alertEnemies(camera.position, 28);

  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * shot.spread;
  dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();

  const targets = [];
  for (const e of enemies) if (e.alive) targets.push(...e.hitboxes);
  raycaster.set(camera.position, dir); raycaster.near = 0.05; raycaster.far = 150;
  const hits = raycaster.intersectObjects(targets, false);
  const { hit: wh, dist: wallDist } = worldHit(camera.position, dir, 150);
  let end = _v.copy(camera.position).addScaledVector(dir, 150);

  const muzzle = viewmodel.scoped ? camera.position.clone().addScaledVector(dir, 0.6) : viewmodel.muzzleWorld(_v2);
  if (!viewmodel.scoped) { fx.muzzleFlash(muzzle, dir); fx.casing(viewmodel.ejectWorld(_v3), right); }

  if (hits.length && hits[0].distance < wallDist) {
    const h = hits[0];
    const enemy = h.object.userData.enemy;
    const res = enemy.hit(h.object, weapon.stats.dmg);
    const killed = enemy.applyDamage(res.damage);
    fx.blood(h.point);
    hud.hitmark(killed);
    audio.hitMarker(res.part === 'head');
    popupAt(h.point, res.part === 'helmet' ? 'HELMET' : String(res.damage), res.part === 'head');
    if (killed) { kills++; hud.feed(res.part === 'head' ? 'HEADSHOT KILL' : 'KILL · ' + weapon.name, res.part === 'head'); }
    end = h.point;
  } else if (wh) {
    end = wh.point;
    fx.bulletHole(end, wh.normal);
  }
  fx.tracer(muzzle, end);
  if (weapon.empty && weapon.canReload && !weapon.stats.bolt) setTimeout(tryReload, 150);
}

function throwGrenade() {
  if (grenadeCount <= 0 || viewmodel.throwing) return;
  grenadeCount--;
  viewmodel.throwAnim();
  clearTimeout(reloadTimer); viewmodel.cancelReload();
  const { pos, vel } = grenadeLaunch();
  grenades.push(new Grenade(scene, pos, vel));
  audio.reloadClick(1);
}
function grenadeLaunch() {
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const pos = camera.position.clone().addScaledVector(dir, 0.5); pos.y -= 0.1;
  const power = 9 + Math.min(1, gHoldT / 1.2) * 7;
  const vel = dir.clone().multiplyScalar(power); vel.y += 2.5;
  return { pos, vel };
}
function explode(pos) {
  fx.explosion(pos);
  audio.explosion(pos.distanceTo(camera.position));
  postfx.flash = Math.max(postfx.flash, 0.6);
  const dp = pos.distanceTo(camera.position);
  if (dp < BLAST_RADIUS) {
    const f = 1 - dp / BLAST_RADIUS;
    damagePlayer(BLAST_DMG * 0.6 * f * f);
  }
  player.kick(Math.min(1, 1.2 * (1 - Math.min(1, dp / 14))));
  for (const e of enemies) {
    if (!e.alive) continue;
    const d = e.group.position.distanceTo(pos);
    if (d > BLAST_RADIUS) continue;
    if (!checkLOS(world.colliders, pos, e.group.position)) continue;
    const f = 1 - d / BLAST_RADIUS;
    const dmg = Math.round(BLAST_DMG * (0.3 + 0.7 * f));
    const killed = e.applyDamage(dmg);
    e.flinch = 1;
    popupAt(e.group.position.clone().setY(1.6), String(dmg), false);
    if (killed) { kills++; hud.feed('GRENADE KILL'); }
  }
  // scorch decal on the floor
  fx.bulletHole(new THREE.Vector3(pos.x, 0.02, pos.z), new THREE.Vector3(0, 1, 0));
  alertEnemies(pos, 40);
}

/* ---------------- enemies ---------------- */
function alertEnemies(pos, radius) {
  for (const e of enemies) {
    if (!e.alive) continue;
    if (e.group.position.distanceTo(pos) < radius) { e.brain.huntX = camera.position.x; e.brain.huntZ = camera.position.z; e.brain.noiseTimer = 1.5; }
  }
}
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
  else {
    // miss: bullet hole somewhere behind the player
    const d = target.clone().sub(m).normalize();
    const { hit } = worldHit(m, d, 60);
    if (hit) fx.bulletHole(hit.point, hit.normal);
  }
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

/* ---------------- HUD helpers ---------------- */
const _proj = new THREE.Vector3();
function project(p) {
  _proj.copy(p).project(camera);
  if (_proj.z > 1) return null;
  return { x: (_proj.x * 0.5 + 0.5) * innerWidth, y: (-_proj.y * 0.5 + 0.5) * innerHeight };
}
function popupAt(p, text, head) {
  const s = project(p); if (s) hud.popup(s.x + (Math.random() - 0.5) * 30, s.y - 10, text, head);
}
function updateHud() {
  hud.update({ hp: player.hp, kills, timeLeft, level, levelName: LEVELS[level - 1].name, weapon,
    ads: viewmodel.ads > 0.5, spread: player.walking || weapon?.burst > 1, scoped: viewmodel.scoped,
    slots: weapons, active: slot + 1, grenades: grenadeCount });
  // enemy hp bars while aiming
  if (viewmodel.ads > 0.5) {
    const bars = [];
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    for (const e of enemies) {
      if (!e.alive || e.hp >= e.maxHp) continue;
      const p = e.group.position.clone(); p.y = 2.05;
      const to = p.clone().sub(camera.position); const d = to.length(); to.normalize();
      if (to.dot(fwd) < 0.97 || d > 40) continue;
      if (!checkLOS(world.colliders, camera.position, p)) continue;
      const s = project(p); if (s) bars.push({ x: s.x, y: s.y, frac: e.hp / e.maxHp });
    }
    hud.enemyBars(bars);
  } else hud.enemyBars([]);
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
    if (gHeld) { gHoldT += dt; const { pos, vel } = grenadeLaunch(); arc.show(pos, vel, world.colliders); }
    for (let i = grenades.length - 1; i >= 0; i--) {
      if (grenades[i].update(dt, world.colliders)) { explode(grenades[i].pos.clone()); grenades.splice(i, 1); }
    }
    const ctx = { colliders: world.colliders, playerPos: camera.position, cfg, dt, enemies, onShoot: enemyShoot, elapsed };
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
setupWeapons();
animate();

// debug hooks (used by the automated screenshot check)
window.__game = {
  startLevel, switchWeapon, throwGrenade: () => { gHoldT = 0.8; throwGrenade(); },
  forcePlay() { if (state === 'ready') { hud.hideReady(); state = 'playing'; clock.getDelta(); } },
  get state() { return state; },
  player, camera, viewmodel, get enemies() { return enemies; }, get scene() { return scene; }, get world() { return world; }
};
