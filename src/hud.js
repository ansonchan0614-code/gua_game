// DOM HUD: HP, timer, kills, ammo, crosshair spread, damage/hit flashes, fps.
const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'), hp: $('hp'), hpfill: $('hpfill'), kills: $('kills'),
      timer: $('timer'), level: $('levelLabel'), topbar: $('topbar'),
      hit: $('hitmark'), damage: $('damage'), crosshair: $('crosshair'),
      ready: $('readyOverlay'), readyMsg: $('readyMsg'), readySub: $('readySub'),
      fps: $('fps'), ammo: $('ammo'), ammoMag: $('ammoMag'), ammoRes: $('ammoRes'), weapon: $('weaponName'),
      reloadHint: $('reloadHint'), scope: $('scope'), popups: $('popups'), killfeed: $('killfeed'),
      slot1: $('slot1'), slot2: $('slot2'), slotG: $('slotG'), slots: document.querySelectorAll('.slot')
    };
    this._fpsAcc = 0; this._fpsN = 0;
  }
  show(on) {
    this.el.hud.classList.toggle('on', on);
    this.el.topbar.classList.toggle('on', on);
    this.el.crosshair.classList.toggle('on', on);
  }
  fmt(sec) { const s = Math.max(0, Math.ceil(sec)), m = Math.floor(s / 60), r = s % 60; return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r; }
  update({ hp, kills, timeLeft, level, levelName, weapon, ads, spread, scoped, slots, active, grenades }) {
    this.el.hp.textContent = Math.max(0, Math.round(hp));
    this.el.hpfill.style.width = Math.max(0, hp) + '%';
    this.el.hpfill.style.background = hp > 60 ? '#d8e04a' : hp > 30 ? '#ffcc44' : '#ff5555';
    this.el.kills.textContent = kills;
    this.el.timer.textContent = this.fmt(timeLeft);
    this.el.level.textContent = 'LEVEL ' + level + ' — ' + levelName;
    this.el.timer.classList.toggle('warning', timeLeft <= 10 && timeLeft > 5);
    this.el.timer.classList.toggle('critical', timeLeft <= 5);
    if (weapon) {
      this.el.ammoMag.textContent = weapon.ammo;
      this.el.ammoRes.textContent = weapon.reserve;
      this.el.weapon.textContent = weapon.name;
      this.el.ammo.classList.toggle('empty', weapon.ammo === 0);
      this.el.reloadHint.classList.toggle('on', weapon.ammo === 0 && weapon.reserve > 0);
    }
    this.el.crosshair.classList.toggle('spread', !!spread);
    this.el.crosshair.style.opacity = ads ? 0 : 1;
    this.el.scope.classList.toggle('on', !!scoped);
    if (slots) {
      this.el.slot1.textContent = slots[0].name + (slots[0].ammo === 0 && slots[0].reserve === 0 ? ' ·' : '');
      this.el.slot2.textContent = slots[1].name;
      this.el.slotG.textContent = '✸ ×' + grenades;
      this.el.slots.forEach(el => el.classList.toggle('active', el.dataset.slot === String(active)));
    }
  }
  /** floating damage number at a projected screen point */
  popup(x, y, text, head) {
    const d = document.createElement('div');
    d.className = 'pop' + (head ? ' head' : ''); d.textContent = text;
    d.style.left = x + 'px'; d.style.top = y + 'px';
    this.el.popups.appendChild(d);
    setTimeout(() => d.remove(), 720);
  }
  feed(text, head) {
    const d = document.createElement('div'); d.className = 'kf' + (head ? ' head' : ''); d.textContent = text;
    this.el.killfeed.appendChild(d);
    while (this.el.killfeed.children.length > 4) this.el.killfeed.firstChild.remove();
    setTimeout(() => d.remove(), 3000);
  }
  /** enemy hp bars: list of {x,y,frac} (screen px) */
  enemyBars(list) {
    const have = this.el.popups.querySelectorAll('.ehp');
    for (let i = 0; i < Math.max(have.length, list.length); i++) {
      let el = have[i];
      if (i >= list.length) { if (el) el.remove(); continue; }
      if (!el) { el = document.createElement('div'); el.className = 'ehp'; el.innerHTML = '<i></i>'; this.el.popups.appendChild(el); }
      el.style.left = list[i].x + 'px'; el.style.top = list[i].y + 'px';
      el.firstChild.style.width = (list[i].frac * 100) + '%';
    }
  }
  hitmark(kill) {
    const h = this.el.hit;
    h.style.color = kill ? '#ff3030' : '#fff';
    h.style.opacity = '1';
    clearTimeout(this._hitT);
    this._hitT = setTimeout(() => { h.style.opacity = '0'; }, kill ? 220 : 100);
  }
  damage() {
    this.el.damage.style.opacity = '1';
    clearTimeout(this._dmgT);
    this._dmgT = setTimeout(() => { this.el.damage.style.opacity = '0'; }, 120);
  }
  ready(msg, sub) { this.el.readyMsg.textContent = msg; this.el.readySub.innerHTML = sub; this.el.ready.classList.add('on'); }
  hideReady() { this.el.ready.classList.remove('on'); }
  fps(dt) {
    this._fpsAcc += dt; this._fpsN++;
    if (this._fpsAcc >= 0.5) { this.el.fps.textContent = Math.round(this._fpsN / this._fpsAcc) + ' fps'; this._fpsAcc = 0; this._fpsN = 0; }
  }
  toggleFps() { this.el.fps.classList.toggle('on'); }
}
