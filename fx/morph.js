/* NOVA FX — morph.js
   Motor de morph de partículas: K formas pré-computadas, scrub por pares.
   Validado nos estudos "galáxia" (fundo escuro/aditivo) e "auralis" (claro/normal). */

import * as THREE from "three";
import { gauss, ease, softSprite } from "./scene.js";

/* ---------------- geradores de forma (retornam Float32Array N*3) ---------------- */

/** Tudo espremido num ponto de luz. */
export function pointShape(N, { jitter = 0.03 } = {}) {
  const a = new Float32Array(N * 3);
  for (let i = 0; i < N * 3; i++) a[i] = gauss() * jitter;
  return a;
}

/** Nuvem gaussiana. */
export function cloudShape(N, { rx = 2.6, ry = 2.2, rz = 2.6 } = {}) {
  const a = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    a[i * 3] = gauss() * rx; a[i * 3 + 1] = gauss() * ry; a[i * 3 + 2] = gauss() * rz;
  }
  return a;
}

/** Galáxia espiral. Retorna { positions, radii } — radii serve pra colorir por raio. */
export function galaxyShape(N, { arms = 3, radius = 3.4, twist = 1.75, bulge = 0.18, flat = 0.14 } = {}) {
  const a = new Float32Array(N * 3), radii = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let x, y, z, r;
    if (i < N * bulge) {
      r = Math.abs(gauss()) * 0.5;
      x = gauss() * 0.45; y = gauss() * 0.28; z = gauss() * 0.45;
    } else {
      r = Math.pow(Math.random(), 0.65) * radius;
      const angle = ((i % arms) * Math.PI * 2) / arms + r * twist + gauss() * (0.35 - r * 0.06);
      x = Math.cos(angle) * r + gauss() * 0.1;
      z = Math.sin(angle) * r + gauss() * 0.1;
      y = gauss() * flat * Math.max(0.25, 1 - r / (radius + 0.2));
    }
    a[i * 3] = x; a[i * 3 + 1] = y; a[i * 3 + 2] = z;
    radii[i] = r;
  }
  return { positions: a, radii };
}

/** Texto amostrado em 3D (técnica do logo de partículas). AGUARDE document.fonts.ready antes. */
export function textShape(N, text, { font = "900 230px Archivo, Arial, sans-serif", size = 4.4, depth = 0.22, res = 240 } = {}) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = res;
  const c = cv.getContext("2d");
  c.fillStyle = "#000";
  c.font = font;
  c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText(text, res / 2, res * 0.54);
  const data = c.getImageData(0, 0, res, res).data;
  const px = [];
  for (let y = 0; y < res; y += 2)
    for (let x = 0; x < res; x += 2)
      if (data[(y * res + x) * 4 + 3] > 128) px.push([x, y]);
  const a = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const [x, y] = px[Math.floor(Math.random() * px.length)];
    a[i * 3] = (x / res - 0.5) * size + gauss() * 0.02;
    a[i * 3 + 1] = (0.5 - y / res) * size + gauss() * 0.02;
    a[i * 3 + 2] = gauss() * depth;
  }
  return a;
}

/** Fitas paramétricas onduladas. */
export function ribbonsShape(N, { count = 6, span = 7, amp = 1.1, gap = 0.52 } = {}) {
  const a = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const rb = i % count;
    const t = (i / N) * count % 1;
    const phase = rb * 1.13;
    a[i * 3] = (t - 0.5) * span + gauss() * 0.05;
    a[i * 3 + 1] = Math.sin(t * Math.PI * 3 + phase) * amp + (rb - (count - 1) / 2) * gap + gauss() * 0.05;
    a[i * 3 + 2] = Math.cos(t * Math.PI * 2 + phase) * 0.8 + gauss() * 0.05;
  }
  return a;
}

/** Cortina em grade (anime com wobble em tempo real por cima do morph). */
export function curtainShape(N, { cols = 200, w = 6.4, h = 3.6 } = {}) {
  const rows = Math.ceil(N / cols);
  const a = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    a[i * 3] = ((i % cols) / cols - 0.5) * w + gauss() * 0.02;
    a[i * 3 + 1] = (Math.floor(i / cols) / rows - 0.5) * h + gauss() * 0.02;
    a[i * 3 + 2] = gauss() * 0.03;
  }
  return a;
}

/** Árvore procedural. Retorna { positions, leafStart } (índice onde começa a folhagem). */
export function treeShape(N, { woody = 0.55, depthMax = 7, base = [0, -2.3, 0], len = 1.15 } = {}) {
  const segs = [], tips = [];
  (function branch(x, y, z, dx, dy, dz, l, depth) {
    const ex = x + dx * l, ey = y + dy * l, ez = z + dz * l;
    segs.push({ x, y, z, ex, ey, ez, depth });
    if (depth >= depthMax || l < 0.09) { tips.push([ex, ey, ez]); return; }
    const kids = depth < 2 ? 2 : Math.random() < 0.35 ? 3 : 2;
    for (let i = 0; i < kids; i++) {
      let nx = dx + (Math.random() - 0.5), ny = dy + Math.random() * 0.55 + 0.05, nz = dz + (Math.random() - 0.5);
      const m = Math.hypot(nx, ny, nz);
      branch(ex, ey, ez, nx / m, ny / m, nz / m, l * (0.62 + Math.random() * 0.16), depth + 1);
    }
  })(...base, 0, 1, 0, len, 0);

  const a = new Float32Array(N * 3);
  const leafStart = Math.floor(N * woody);
  for (let i = 0; i < leafStart; i++) {
    const s = segs[Math.floor(Math.random() * segs.length)];
    const t = Math.random(), j = 0.07 / (s.depth * 0.7 + 1);
    a[i * 3] = s.x + (s.ex - s.x) * t + gauss() * j;
    a[i * 3 + 1] = s.y + (s.ey - s.y) * t + gauss() * j;
    a[i * 3 + 2] = s.z + (s.ez - s.z) * t + gauss() * j;
  }
  for (let i = leafStart; i < N; i++) {
    const [tx, ty, tz] = tips[Math.floor(Math.random() * tips.length)];
    a[i * 3] = tx + gauss() * 0.3; a[i * 3 + 1] = ty + gauss() * 0.26; a[i * 3 + 2] = tz + gauss() * 0.3;
  }
  return { positions: a, leafStart };
}

/* ---------------- cores ---------------- */

/** Paleta aleatória por partícula a partir de cores hex. */
export function palette(N, hexes, { lJitter = 0.1 } = {}) {
  const a = new Float32Array(N * 3), tmp = new THREE.Color();
  for (let i = 0; i < N; i++) {
    tmp.set(hexes[Math.floor(Math.random() * hexes.length)]).offsetHSL(0, 0, (Math.random() - 0.5) * lJitter);
    a[i * 3] = tmp.r; a[i * 3 + 1] = tmp.g; a[i * 3 + 2] = tmp.b;
  }
  return a;
}

/** Gradiente por valor [0..1] por partícula (ex.: raio da galáxia → laranja→azul). */
export function gradientBy(N, values, maxV, hexA, hexB, { lJitter = 0.12 } = {}) {
  const a = new Float32Array(N * 3);
  const cA = new THREE.Color(hexA), cB = new THREE.Color(hexB), tmp = new THREE.Color();
  for (let i = 0; i < N; i++) {
    tmp.copy(cA).lerp(cB, Math.min(1, values[i] / maxV)).offsetHSL(0, 0, (Math.random() - 0.5) * lJitter);
    a[i * 3] = tmp.r; a[i * 3 + 1] = tmp.g; a[i * 3 + 2] = tmp.b;
  }
  return a;
}

/* ---------------- o motor ---------------- */

/**
 * new ParticleMorph({ shapes, colors, size, additive, opacity })
 * - shapes: [Float32Array N*3, ...] (2+)
 * - colors: [Float32Array N*3, ...] (mesmo length de shapes) ou uma só pra todas
 * - additive: true (fundo escuro/neon) | false (fundo claro) — regra da skill!
 *
 * .points → THREE.Points (adicione à cena)
 * .update(p) → morph no progresso global [0..1] pelos pares de formas
 * .wobble(fn) → registra deformação em tempo real: fn(pos, i, t) pós-morph
 */
export class ParticleMorph {
  constructor({ shapes, colors, size = 0.05, additive = true, opacity = 0.92, sprite = null }) {
    this.shapes = shapes;
    this.colors = Array.isArray(colors) ? colors : [colors];
    this.N = shapes[0].length / 3;
    this._wobbles = [];

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(shapes[0]), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(this.colors[0]), 3));

    const mat = new THREE.PointsMaterial({
      size,
      map: sprite || softSprite(),
      vertexColors: true,
      transparent: true,
      opacity,
      depthWrite: false,
      sizeAttenuation: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.geo = geo;
    this.mat = mat;
  }

  wobble(fn) { this._wobbles.push(fn); return this; }

  update(p, t = 0) {
    const K = this.shapes.length;
    const s = Math.min(K - 1.001, Math.max(0, p) * (K - 1));
    const idx = Math.floor(s), k = ease(s - idx);
    const A = this.shapes[idx], B = this.shapes[idx + 1];
    const pos = this.geo.attributes.position.array;
    for (let i = 0; i < pos.length; i++) pos[i] = A[i] + (B[i] - A[i]) * k;

    if (this.colors.length > 1) {
      const CA = this.colors[Math.min(idx, this.colors.length - 1)];
      const CB = this.colors[Math.min(idx + 1, this.colors.length - 1)];
      const col = this.geo.attributes.color.array;
      for (let i = 0; i < col.length; i++) col[i] = CA[i] + (CB[i] - CA[i]) * k;
      this.geo.attributes.color.needsUpdate = true;
    }

    for (const w of this._wobbles) w(pos, { idx, k, t, N: this.N });
    this.geo.attributes.position.needsUpdate = true;
    return { idx, k };
  }

  dispose() {
    this.geo.dispose();
    this.mat.map?.dispose();
    this.mat.dispose();
  }
}
