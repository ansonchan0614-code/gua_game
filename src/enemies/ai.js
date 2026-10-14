// Hunting AI (ported from v1): each enemy keeps a noisy belief of where the player is,
// refreshed exactly when it has line of sight; slides along walls when stuck; shoots on LOS.
import * as THREE from 'three';

export const ENEMY_SPEED_CAP = 5.0;

export function enemyCfg(level) {
  return {
    speed:        Math.min(ENEMY_SPEED_CAP, 2.6 + level * 0.22),
    fireCooldown: Math.max(0.75, 2.2 - level * 0.15),
    hitChance:    Math.min(0.55, 0.15 + level * 0.040),
    range:        Math.min(48, 24 + level * 2.4),
    noiseAmount:  Math.max(2.0, 8 - level * 0.55),
    hp:           100 + level * 10
  };
}

const _eye = new THREE.Vector3(), _tgt = new THREE.Vector3(), _dir = new THREE.Vector3(), _hit = new THREE.Vector3();
const _ray = new THREE.Raycaster();

export function checkLOS(colliders, from, to) {
  _eye.set(from.x, 1.4, from.z); _tgt.set(to.x, 1.4, to.z);
  _dir.copy(_tgt).sub(_eye);
  const dist = _dir.length();
  if (dist < 0.1) return true;
  _dir.normalize();
  _ray.set(_eye, _dir); _ray.near = 0.1; _ray.far = dist - 0.3;
  for (let i = 0; i < colliders.length; i++) {
    const h = _ray.ray.intersectBox(colliders[i], _hit);
    if (h && h.distanceTo(_eye) < dist - 0.5) return false;
  }
  return true;
}

export function tryMoveEnemy(colliders, pos, axis, amount, radius = 0.4) {
  if (amount === 0) return false;
  const v = pos[axis] + amount;
  const minX = axis === 'x' ? v - radius : pos.x - radius, maxX = axis === 'x' ? v + radius : pos.x + radius;
  const minZ = axis === 'z' ? v - radius : pos.z - radius, maxZ = axis === 'z' ? v + radius : pos.z + radius;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.max.x < minX || c.min.x > maxX || c.max.z < minZ || c.min.z > maxZ || c.min.y > 1.9 || c.max.y < 0.1) continue;
    return false;
  }
  pos[axis] = v;
  return true;
}

/** Mutable per-enemy AI state. */
export function makeBrain(x, z) {
  return {
    huntX: 0, huntZ: 0, noiseTimer: 0,
    stuckTimer: 0, lastX: x, lastZ: z,
    escapeTimer: 0, escapeDirX: 0, escapeDirZ: 0,
    shootCd: 1.5 + Math.random() * 1.5,
    hasLOS: false, distToPlayer: 999, moving: false
  };
}

/**
 * Step one enemy. `ctx` = { colliders, playerPos, cfg, dt, enemies, onShoot(enemy, willHit) }.
 * Returns nothing; mutates enemy.group.position and enemy.brain.
 */
export function stepEnemy(e, ctx) {
  const { colliders, playerPos, cfg, dt } = ctx;
  const b = e.brain, pos = e.group.position;
  const dxP = playerPos.x - pos.x, dzP = playerPos.z - pos.z;
  const dist = Math.hypot(dxP, dzP);
  b.distToPlayer = dist;

  let hasLOS = false;
  if (dist < cfg.range * 1.3) hasLOS = checkLOS(colliders, pos, playerPos);
  b.hasLOS = hasLOS;

  b.noiseTimer -= dt;
  if (b.noiseTimer <= 0) {
    b.noiseTimer = 0.7 + Math.random() * 0.8;
    if (hasLOS) { b.huntX = playerPos.x; b.huntZ = playerPos.z; }
    else {
      const n = cfg.noiseAmount;
      b.huntX = playerPos.x + (Math.random() - 0.5) * n * 2;
      b.huntZ = playerPos.z + (Math.random() - 0.5) * n * 2;
    }
  } else if (hasLOS) { b.huntX = playerPos.x; b.huntZ = playerPos.z; }

  let tdx = b.huntX - pos.x, tdz = b.huntZ - pos.z, td = Math.hypot(tdx, tdz);

  const moved = Math.hypot(pos.x - b.lastX, pos.z - b.lastZ);
  if (moved < 0.015 && td > 1.0) b.stuckTimer += dt; else b.stuckTimer = 0;
  b.lastX = pos.x; b.lastZ = pos.z;

  if (b.stuckTimer > 0.5 && b.escapeTimer <= 0) {
    const nx = td > 0.01 ? tdx / td : 0, nz = td > 0.01 ? tdz / td : 0;
    const sign = Math.random() < 0.5 ? -1 : 1;
    b.escapeDirX = -nz * sign; b.escapeDirZ = nx * sign;
    b.escapeTimer = 0.6 + Math.random() * 0.5; b.stuckTimer = 0;
  }

  let stepX = 0, stepZ = 0;
  const stopDist = hasLOS ? 4.5 : 0.5;
  const lowHp = e.maxHp && e.hp < e.maxHp * 0.3;
  if (b.escapeTimer > 0) { b.escapeTimer -= dt; stepX = b.escapeDirX; stepZ = b.escapeDirZ; }
  else if (hasLOS && lowHp && dist < 9) {
    // wounded: back off while still facing the player
    stepX = -dxP / dist; stepZ = -dzP / dist;
  } else if (hasLOS && dist < cfg.range && td <= stopDist + 2) {
    // in a firefight: strafe side to side so they're harder to hit
    b.strafeT = (b.strafeT || 0) + dt;
    if (b.strafeT > 1.2 + Math.random() * 0.8) { b.strafeT = 0; b.strafeDir = b.strafeDir === 1 ? -1 : 1; }
    const sd = b.strafeDir || (b.strafeDir = Math.random() < 0.5 ? 1 : -1);
    stepX = -dzP / dist * sd * 0.8; stepZ = dxP / dist * sd * 0.8;
    if (dist > stopDist + 1) { stepX += dxP / dist * 0.5; stepZ += dzP / dist * 0.5; }
  }
  else if (td > stopDist && td > 0.01) { stepX = tdx / td; stepZ = tdz / td; }

  // simple separation so enemies don't stack
  if (ctx.enemies) {
    for (const o of ctx.enemies) {
      if (o === e || !o.alive) continue;
      const ox = pos.x - o.group.position.x, oz = pos.z - o.group.position.z, od = Math.hypot(ox, oz);
      if (od < 1.2 && od > 0.001) { stepX += ox / od * 0.8; stepZ += oz / od * 0.8; }
    }
  }

  const stepLen = Math.hypot(stepX, stepZ);
  b.moving = stepLen > 0.01;
  if (b.moving) {
    const step = cfg.speed * dt;
    tryMoveEnemy(colliders, pos, 'x', stepX / stepLen * step);
    tryMoveEnemy(colliders, pos, 'z', stepZ / stepLen * step);
  }

  // face the player
  e.group.rotation.y = Math.atan2(dxP, dzP);

  b.shootCd -= dt;
  if (hasLOS && b.shootCd <= 0 && dist < cfg.range) {
    b.shootCd = cfg.fireCooldown * (0.85 + Math.random() * 0.3);
    const willHit = Math.random() < cfg.hitChance;
    ctx.onShoot(e, willHit);
  }
}
