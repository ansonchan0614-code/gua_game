// Post-processing chain: render → SSAO (high) → bloom → grade (vignette, grain, chromatic
// aberration, hit flash) → output (tone mapping + sRGB).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.03 },
    uVignette: { value: 0.55 },
    uAberration: { value: 0.00022 },
    uFlash: { value: 0 },
    uRed: { value: 0 }
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime, uGrain, uVignette, uAberration, uFlash, uRed;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime) * 43758.5453); }
    void main(){
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec2 off = d * uAberration * (1.0 + r2 * 6.0) * 40.0;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      float vig = 1.0 - smoothstep(0.25, 0.95, r2 * 2.2) * uVignette;
      col *= vig;
      col += (hash(vUv * 1000.0) - 0.5) * uGrain;
      col = mix(col, vec3(1.0, 0.97, 0.85), uFlash);
      col = mix(col, vec3(0.6, 0.0, 0.0), uRed * smoothstep(0.2, 0.9, r2 * 2.0));
      gl_FragColor = vec4(col, 1.0);
    }`
};

export class PostFX {
  constructor(renderer, scene, camera, preset) {
    this.renderer = renderer;
    this.preset = preset;
    const size = renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    if (preset.ssao) {
      this.ssao = new SSAOPass(scene, camera, size.x, size.y);
      this.ssao.kernelRadius = 0.6;
      this.ssao.minDistance = 0.002;
      this.ssao.maxDistance = 0.12;
      this.composer.addPass(this.ssao);
    }
    // view model drawn on top in its own scene so wall lights never blow it out and it never clips walls
    this.vmPass = null;
    if (preset.bloom) {
      this.bloom = new UnrealBloomPass(size, 0.42, 0.55, 0.88);
      this.composer.addPass(this.bloom);
    }
    this.grade = new ShaderPass(GradeShader);
    this.grade.uniforms.uGrain.value = preset.grain ? 0.03 : 0;
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.flash = 0; this.red = 0;
  }
  setScene(scene, camera) {
    this.composer.passes[0].scene = scene;
    this.composer.passes[0].camera = camera;
    if (this.ssao) { this.ssao.scene = scene; this.ssao.camera = camera; }
  }
  setViewModel(vmScene, vmCamera) {
    this.vmPass = new RenderPass(vmScene, vmCamera);
    this.vmPass.clear = false; this.vmPass.clearDepth = true;
    const idx = this.ssao ? 2 : 1;
    this.composer.passes.splice(idx, 0, this.vmPass);
  }
  resize(w, h) { this.composer.setSize(w, h); if (this.ssao) this.ssao.setSize(w, h); }
  render(dt, t) {
    this.flash = Math.max(0, this.flash - dt * 4);
    this.red = Math.max(0, this.red - dt * 2.5);
    const u = this.grade.uniforms;
    u.uTime.value = t; u.uFlash.value = this.flash; u.uRed.value = this.red;
    this.composer.render(dt);
  }
}
