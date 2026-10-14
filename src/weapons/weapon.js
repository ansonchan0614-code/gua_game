// Weapon runtime state: ammo, fire cadence, reload, spread/recoil. Model-agnostic.
export class Weapon {
  constructor(model) {
    this.model = model;             // { group, mag, muzzle, ejectPort, sightHeight, stats }
    this.stats = model.stats;
    this.ammo = this.stats.mag;
    this.reserve = this.stats.reserve;
    this.cd = 0;
    this.burst = 0;                 // consecutive shots, drives recoil climb
    this.burstDecay = 0;
    this.boltT = -1;                // bolt-action cycle (Kar98)
  }
  get group() { return this.model.group; }
  get mag() { return this.model.mag; }
  get muzzle() { return this.model.muzzle; }
  get ejectPort() { return this.model.ejectPort; }
  get sightHeight() { return this.model.sightHeight; }
  get hands() { return this.model.hands; }
  get name() { return this.stats.name; }

  canFire() { return this.cd <= 0 && this.ammo > 0 && this.boltT < 0; }
  get empty() { return this.ammo <= 0; }
  get canReload() { return this.ammo < this.stats.mag && this.reserve > 0; }

  /** Consume a round; returns spread (radians) and recoil for this shot. */
  fire(ads) {
    this.ammo--;
    this.cd = 60 / this.stats.rpm;
    this.burst = Math.min(10, this.burst + 1);
    this.burstDecay = 0.25;
    if (this.stats.bolt) this.boltT = 0;
    const s = this.stats;
    const spread = (ads ? s.adsSpread : s.hipSpread) * (1 + this.burst * 0.12);
    const climb = 1 + this.burst * 0.18;
    return {
      spread,
      recoilPitch: s.recoilUp * climb * (ads ? 0.7 : 1),
      recoilYaw: (Math.random() - 0.5) * s.recoilSide * climb * 2
    };
  }

  reload() {
    const need = this.stats.mag - this.ammo;
    const take = Math.min(need, this.reserve);
    this.ammo += take; this.reserve -= take;
  }

  update(dt) {
    this.cd -= dt;
    if (this.burstDecay > 0) this.burstDecay -= dt; else this.burst = Math.max(0, this.burst - dt * 6);
    if (this.boltT >= 0) { this.boltT += dt; if (this.boltT > this.stats.bolt) this.boltT = -1; }
  }
}
