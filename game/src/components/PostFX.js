import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Rippling "reality warp" around Tode, chromatic aberration, vignette and screen flashes.
const RealityShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    warp: { value: 0 },
    aberration: { value: 0 },
    vignette: { value: 0.35 },
    flash: { value: 0 },
    flashColor: { value: new THREE.Color(1, 1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time, warp, aberration, vignette, flash;
    uniform vec3 flashColor;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      vec2 fromCenter = uv - 0.5;
      float dist = length(fromCenter);
      vec2 outward = fromCenter / max(dist, 0.0001);

      // Waves ripple outward from Tode in the middle of the screen; the world wobbles.
      uv += outward * sin(dist * 38.0 - time * 5.0) * 0.0035 * warp * smoothstep(0.05, 0.35, dist);
      uv += vec2(sin(uv.y * 9.0 + time * 1.7), cos(uv.x * 8.0 + time * 1.3)) * 0.0025 * warp;

      vec2 split = fromCenter * aberration * 0.025;
      vec3 color = vec3(
        texture2D(tDiffuse, uv + split).r,
        texture2D(tDiffuse, uv).g,
        texture2D(tDiffuse, uv - split).b
      );
      color *= 1.0 - vignette * smoothstep(0.35, 0.85, dist * 1.25);
      color = mix(color, flashColor, flash);
      gl_FragColor = vec4(color, 1.0);
    }`,
};

const BASE_BLOOM = 0.35;

/** Post-processing pipeline. Effects ease toward their targets, so changes never pop. */
export class PostFX {
  constructor(renderer, scene, camera) {
    const size = renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(size, BASE_BLOOM, 0.55, 0.88);
    this.composer.addPass(this.bloom);
    this.reality = new ShaderPass(RealityShader);
    this.composer.addPass(this.reality);
    this.composer.addPass(new OutputPass());

    this.time = 0;
    this.flashAmount = 0;
    // Steady targets (set by the ascension tier) plus short spikes (abilities, explosions).
    this.target = { bloom: BASE_BLOOM, warp: 0, aberration: 0 };
    this.spike = { bloom: 0, warp: 0, aberration: 0 };
  }

  setSize(width, height) {
    this.composer.setSize(width, height);
  }

  setTargets({ bloom = BASE_BLOOM, warp = 0, aberration = 0 }) {
    Object.assign(this.target, { bloom, warp, aberration });
  }

  /** A brief burst of extra bloom / warp / aberration that fades out. */
  pulse({ bloom = 0, warp = 0, aberration = 0 }) {
    this.spike.bloom = Math.max(this.spike.bloom, bloom);
    this.spike.warp = Math.max(this.spike.warp, warp);
    this.spike.aberration = Math.max(this.spike.aberration, aberration);
  }

  flash(color = 0xffffff, amount = 0.8) {
    this.reality.uniforms.flashColor.value.set(color);
    this.flashAmount = Math.max(this.flashAmount, amount);
  }

  render(delta) {
    this.time += delta;
    const ease = 1 - Math.exp(-3 * delta);
    const fade = Math.exp(-2.5 * delta);
    for (const key of ['bloom', 'warp', 'aberration']) this.spike[key] *= fade;
    this.flashAmount *= Math.exp(-6 * delta);

    this.bloom.strength += (this.target.bloom + this.spike.bloom - this.bloom.strength) * ease;
    const uniforms = this.reality.uniforms;
    uniforms.time.value = this.time;
    uniforms.warp.value += (this.target.warp + this.spike.warp - uniforms.warp.value) * ease;
    uniforms.aberration.value += (this.target.aberration + this.spike.aberration - uniforms.aberration.value) * ease;
    uniforms.flash.value = this.flashAmount;
    this.composer.render(delta);
  }
}
