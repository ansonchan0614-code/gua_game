# Backrooms Survival

A 10-level first-person survival shooter set in the yellow Backrooms. Built with Three.js (r160, vendored) — every model and texture is generated procedurally in code, so the repo ships no asset files.

**Play:** https://ansonchan0614-code.github.io/gua_game/

## How to play
- Survive until the timer hits zero. Clear a level to unlock the next.
- **WASD** move · **Shift** sprint · **Space** jump · mouse look
- **LMB** shoot · **RMB** aim down sights · **R** reload
- **1 / 2** or mouse wheel — switch between the **M416** (full-auto, red dot) and the **Kar98k** (bolt-action, 4× scope)
- hold **G** to show the throw arc, release to throw a frag grenade (2 per level)
- **F3** fps counter

Headshots do 2.5× damage; helmets soak the first hit (two on later levels). HP regenerates after 4 seconds without damage.

Pick **Low / Medium / High** graphics in the menu (Low turns off shadows and ambient occlusion). Desktop browser with mouse and keyboard required.

## Structure
```
index.html          shell, HUD, importmap
css/hud.css
src/main.js         game loop, state machine, shooting, grenades
src/world/          Backrooms generator (merged walls, light panels, litter)
src/textures.js     procedural carpet / wallpaper / ceiling / metal textures
src/weapons/        M416, Kar98k, grenade, view model, weapon state
src/enemies/        soldier model + animation, hunting AI
src/postfx.js       SSAO, bloom, grain / vignette / aberration grade
vendor/three/       Three.js r160 module build + the few addons used
```
