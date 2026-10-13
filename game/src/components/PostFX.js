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
    shatter: { value: 0 },
    invert: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time, warp, aberration, vignette, flash, shatter, invert;
    uniform vec3 flashColor;
    varying vec2 vUv;

    vec2 hash2(vec2 p) {
      p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
      return fract(sin(p) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;

      // Reality shatters: the screen breaks into shards that shift apart, with bright cracks between them.
      float crack = 0.0;
      if (shatter > 0.001) {
        vec2 grid = uv * vec2(7.0, 4.5);
        vec2 cell = floor(grid);
        vec2 local = fract(grid);
        float best = 8.0;
        float second = 8.0;
        vec2 bestCell = cell;
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 offset = vec2(float(x), float(y));
            float d = length(offset + hash2(cell + offset) - local);
            if (d < best) {
              second = best;
              best = d;
              bestCell = cell + offset;
            } else if (d < second) {
              second = d;
            }
          }
        }
        uv += (hash2(bestCell * 1.7) - 0.5) * 0.07 * shatter;
        crack = smoothstep(0.07, 0.0, second - best) * shatter;
      }
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
      color = mix(color, vec3(1.0) - clamp(color, 0.0, 1.0), invert);
      color += crack * vec3(1.0, 0.95, 0.85);
      color = mix(color, flashColor, flash);
      gl_FragColor = vec4(color, 1.0);
    }`,
};

/**
 * Keeps the image sane before bloom: no NaN pixels (bloom smears them into flickering black boxes) and no
 * extreme highlights (a pile of additive particles can reach values that bloom spreads over the whole screen).
 */
const SanitizeShader = {
  uniforms: { tDiffuse: { value: null }, limit: { value: 6 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float limit;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      if (any(isnan(color)) || any(isinf(color))) color = vec4(0.0, 0.0, 0.0, 1.0);
      gl_FragColor = vec4(min(color.rgb, vec3(limit)), color.a);
    }`,
};

const BASE_BLOOM = 0.35;

/** Post-processing pipeline. Effects ease toward their targets, so changes never pop. */
export class PostFX {
  constructor(renderer, scene, camera) {
    const size = renderer.getSize(new THREE.Vector2());
    // Multisampled targets keep edges smooth (the canvas' own antialiasing doesn't apply to post-processing).
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.composer.addPass(new ShaderPass(SanitizeShader));
    this.bloom = new UnrealBloomPass(size, BASE_BLOOM, 0.55, 0.93);
    this.composer.addPass(this.bloom);
    this.reality = new ShaderPass(RealityShader);
    this.composer.addPass(this.reality);
    this.composer.addPass(new OutputPass());

    this.time = 0;
    this.flashAmount = 0;
    this.shatterAmount = 0;
    this.invertAmount = 0;
    // Steady targets (set by the ascension tier) plus short spikes (abilities, explosions).
    this.target = { bloom: BASE_BLOOM, warp: 0, aberration: 0 };
    this.spike = { bloom: 0, warp: 0, aberration: 0 };
  }

  setSize(width, height) {
    this.composer.setSize(width, height);
  }

  setPixelRatio(ratio) {
    this.composer.setPixelRatio(ratio);
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

  /** Breaks the screen into shards for a moment, with an inverted-colour flash: reality itself cracks. */
  shatter(amount = 1, invert = 0.8) {
    this.shatterAmount = Math.max(this.shatterAmount, amount);
    this.invertAmount = Math.max(this.invertAmount, invert);
  }

  flash(color = 0xffffff, amount = 0.8) {
    this.reality.uniforms.flashColor.value.set(color);
    this.flashAmount = Math.max(this.flashAmount, amount);
  }

  /** Eases the effects; runs every frame, also when a frame isn't drawn (game.step). */
  update(delta) {
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
    this.shatterAmount *= Math.exp(-2.2 * delta);
    this.invertAmount *= Math.exp(-9 * delta);
    uniforms.shatter.value = this.shatterAmount;
    uniforms.invert.value = this.invertAmount;
  }

  render(delta) {
    this.composer.render(delta);
  }
}
