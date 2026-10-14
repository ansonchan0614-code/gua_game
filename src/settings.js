// Graphics presets and persisted settings.
export const PRESETS = {
  low:    { shadows: false, ssao: false, bloom: true,  grain: false, pixelRatio: 1,   shadowLights: 0, props: 0.5, aniso: 2 },
  medium: { shadows: true,  ssao: false, bloom: true,  grain: true,  pixelRatio: 1.5, shadowLights: 1, props: 1,   aniso: 4 },
  high:   { shadows: true,  ssao: true,  bloom: true,  grain: true,  pixelRatio: 2,   shadowLights: 2, props: 1,   aniso: 8 }
};

function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

export const settings = {
  gfx: lsGet('br2_gfx') || 'medium',
  get preset() { return PRESETS[this.gfx] || PRESETS.medium; },
  setGfx(v) { this.gfx = PRESETS[v] ? v : 'medium'; lsSet('br2_gfx', this.gfx); },

  get progress() {
    const p = parseInt(lsGet('br2_progress') || '1', 10);
    return (p >= 1 && p <= 10) ? p : 1;
  },
  set progress(v) { lsSet('br2_progress', String(v)); }
};
