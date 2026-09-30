/* NOVA FX — scene.js
   Boilerplate Three.js pra sites estáticos: renderer + bloom + resize + hooks de teste.
   Requer importmap com "three" e "three/addons/" (@0.160.0, jsdelivr). */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

/**
 * createScene({ canvas, background, fog, fogExp, bloom, fov, maxDPR })
 * → { renderer, scene, camera, composer, start(stepFn), stop() }
 *
 * - `bloom`: { strength, radius, threshold } ou false
 * - `fog`: { color, near, far } | `fogExp`: { color, density }
 * - start(step) registra o loop E expõe window.__step (verificação headless)
 */
export function createScene({
  canvas,
  background = 0x04040a,
  fog = null,
  fogExp = null,
  bloom = { strength: 0.9, radius: 0.6, threshold: 0.2 },
  fov = 50,
  maxDPR = 2,
} = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, maxDPR));

  const scene = new THREE.Scene();
  if (background !== null) scene.background = new THREE.Color(background);
  if (fog) scene.fog = new THREE.Fog(fog.color ?? background, fog.near ?? 5, fog.far ?? 12);
  if (fogExp) scene.fog = new THREE.FogExp2(fogExp.color ?? background, fogExp.density ?? 0.05);

  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 100);
  camera.position.z = 5;

  let composer = null;
  if (bloom) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), bloom.strength, bloom.radius, bloom.threshold));
    composer.addPass(new OutputPass());
  }

  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  addEventListener("resize", resize);

  const api = {
    renderer, scene, camera, composer,
    render: () => (composer ? composer.render() : renderer.render(scene, camera)),
    start(step) {
      const fn = (t) => { step(t); api.render(); };
      window.__step = fn; // hook headless: chame __step(t) com rAF pausado
      renderer.setAnimationLoop(fn);
      return fn;
    },
    stop() { renderer.setAnimationLoop(null); },
  };
  return api;
}

/** Sprite circular suave pra PointsMaterial (evita pontos quadrados). */
export function softSprite(size = 64, hardness = 0.4) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const c = cv.getContext("2d");
  const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(hardness, "rgba(255,255,255,.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(cv);
}

/** Gaussiana rápida (média de 4 uniformes). */
export const gauss = () => (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 2;

/** smoothstep 0..1 */
export const ease = (t) => t * t * (3 - 2 * t);

/** Progresso de scroll da página [0..1] com listener embutido. */
export function scrollProgress() {
  let p = 0;
  const read = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    p = max > 0 ? Math.min(1, scrollY / max) : 0;
  };
  addEventListener("scroll", read, { passive: true });
  read();
  const get = () => p;
  window.__progress = get; // hook headless
  return get;
}
