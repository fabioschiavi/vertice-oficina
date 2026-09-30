/* NOVA FX — templates/cinema-scroll/engine/cinema.js
   Motor do modelo "scroll cinematográfico" (8 atos). Genérico: marca, cores, objeto 3D,
   textos e imagens vêm do site (site.js + HTML + theme.css).

   Tudo é função do scroll (progresso de cada seção) + tempo: qualquer ponto da página é
   reconstruível ao pular direto pra ele.

   Contrato de DOM (ids obrigatórios): #gl #nav #hero #intro #panel #headline(.t1 .t2)
   #devices #dvSheet #dvTrack #dvCopy .phone×5 #phoneHero (.curtain-fade dentro)
   #bloom #bloomCap #bloomSide #statement #stA #stB #stNote #gallery #gHud #gIdx #gTot
   #gTitle #gHead #final #finalCopy  ·  opcional: .hero-photo, [data-count]

   Importmap exigido: "three", "three/addons/" (@0.160.0) e "nova/" → pasta com fx/scene.js
   e fx/morph.js da NOVA FX.

   Hooks headless: window.__step(t) · window.__state() · window.__ready (Promise)
*/

import * as THREE from "three";
import { createScene, softSprite, gauss, ease } from "nova/scene.js";
import { ParticleMorph, pointShape, cloudShape, palette } from "nova/morph.js";

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (p, a, b) => clamp((p - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const sm = (t) => ease(clamp(t));
const isMobile = () => innerWidth < 760;

/** PRNG semeado (layout da galeria estável entre recargas). */
export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Estúdio padrão do cromo (Astrum). Cada faixa: [w, h, cor, intensidade, x, y, z]. */
const DEFAULT_ENV = [
  [0.8, 10, 0xffffff, 8, -5, 0, 1.5],
  [8, 0.9, 0xffffff, 5, 0, 5, 1],
  [3.5, 7, 0x8b5cf6, 3, 5.2, -0.5, -0.5],
  [10, 2.2, 0xa78bfa, 1.6, 0, -4.5, 2],
  [1.2, 1.2, 0xffffff, 3, 2.5, 2, 5],
  [7, 7, 0x4c1d95, 1.1, 0, 0, -6],
];

/**
 * runCinema(config)
 *
 * config = {
 *   colors: { base, glow, fill, dust, particles: ["#hex", ...] },
 *   env: [[w, h, cor, intensidade, x, y, z], ...]   // faixas de luz do reflexo (opcional)
 *   hero: (ctx) => ({ object, radius, animate(object, s) })  // ver heroes.js
 *   cards: [{ title, src } | { title, canvas: () => HTMLCanvasElement }],
 *   bloom: { strength, radius, threshold }, exposure,
 *   heroScale: { panel, curtain, bloom, final, finalMobile },
 *   glowStrength: 1,   // intensidade do halo que segue o objeto
 * }
 */
export function runCinema(config) {
  const C = {
    colors: { base: 0x05040a, glow: 0x6d28d9, fill: 0x5b21b6, dust: 0xc4b5fd, particles: ["#a78bfa", "#c4b5fd", "#ffffff"] },
    env: DEFAULT_ENV,
    bloom: { strength: 0.5, radius: 0.5, threshold: 0.7 },
    exposure: 1.05,
    glowStrength: 1,
    ...config,
    heroScale: { panel: 0.62, panelMobile: 0.5, curtain: 0.55, bloom: 0.72, final: 1.15, finalMobile: 0.62, ...config.heroScale },
  };
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- scroll suave ---------------- */
  let lenis = null;
  if (window.Lenis && !reduceMotion) lenis = new window.Lenis({ lerp: 0.085, anchors: true, autoRaf: false });

  /* ---------------- WebGL ---------------- */
  const canvas = document.getElementById("gl");
  const fx = createScene({
    canvas, background: null,
    fogExp: { color: C.colors.base, density: 0.012 },
    bloom: C.bloom, fov: 42, maxDPR: 1.75,
  });
  const { scene, camera, renderer } = fx;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = C.exposure;
  camera.far = 200;
  camera.updateProjectionMatrix();
  const bloomPass = fx.composer.passes[1];
  // se a página carregar com a aba oculta o canvas nasce 0×0: refaz o tamanho quando ganhar área
  new ResizeObserver(() => dispatchEvent(new Event("resize"))).observe(canvas);

  /* fundo procedural: base + halo que segue o objeto + preenchimento na cor de acento */
  const bgMat = new THREE.ShaderMaterial({
    uniforms: {
      uBase: { value: new THREE.Color(C.colors.base) },
      uGlow: { value: new THREE.Color(C.colors.glow) },
      uFillCol: { value: new THREE.Color(C.colors.fill) },
      uGlowAmt: { value: 1 }, uFill: { value: 0 },
      uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uRadius: { value: 0.3 },
      uAspect: { value: 1 }, uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uBase, uGlow, uFillCol;
      uniform float uGlowAmt, uFill, uRadius, uAspect, uTime;
      uniform vec2 uCenter;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec2 p = vUv - uCenter; p.x *= uAspect;
        float d2 = dot(p, p), r2 = uRadius * uRadius;
        vec3 col = uBase + uGlow * (exp(-d2 / r2) * 0.55 + exp(-d2 / (r2 * 5.0)) * 0.12) * uGlowAmt;
        vec2 q = vUv - 0.5; q.x *= uAspect;
        float dq = length(q);
        vec3 fill = mix(uFillCol * 1.5, uFillCol * 0.28, smoothstep(0.0, 1.05, dq));
        fill += uGlow * 0.55 * exp(-dq * dq * 5.0);
        col = mix(col, fill, uFill);
        col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
        gl_FragColor = vec4(col, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat);
  bg.frustumCulled = false;
  bg.renderOrder = -10;
  scene.add(bg);

  /* ambiente do metal: estúdio escuro com faixas de luz (sem HDRI externo) */
  {
    const s = new THREE.Scene();
    s.background = new THREE.Color(0x020104);
    for (const [w, h, hex, k, x, y, z] of C.env) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), side: THREE.DoubleSide })
      );
      m.position.set(x, y, z);
      m.lookAt(0, 0, 0);
      s.add(m);
    }
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(s, 0.015).texture;
    s.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    pmrem.dispose();
  }

  /* objeto herói (estrela, rotor, ...) */
  const hero = C.hero({ THREE, renderer, mobile: isMobile() });
  const heroG = new THREE.Group();
  heroG.add(hero.object);
  scene.add(heroG);
  const HERO_R = hero.radius;

  /* partículas: núcleo → casca (florescer) → nuvem (statement) → túnel (galeria) */
  const N = isMobile() ? 6000 : 14000;
  const shell = new Float32Array(N * 3), tunnel = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, q = Math.sqrt(1 - u * u);
    let r = 2.6 * (1 + gauss() * 0.03);
    if (Math.random() < 0.1) r *= 1.15 + Math.random() * 0.7; // pétalas soltas
    shell[i * 3] = q * Math.cos(th) * r; shell[i * 3 + 1] = u * r; shell[i * 3 + 2] = q * Math.sin(th) * r;
    const ang = Math.random() * Math.PI * 2, rad = 1.1 + Math.abs(gauss()) * 7;
    tunnel[i * 3] = Math.cos(ang) * rad * 1.3; tunnel[i * 3 + 1] = Math.sin(ang) * rad * 0.8; tunnel[i * 3 + 2] = 8 - Math.random() * 64;
  }
  const morph = new ParticleMorph({
    shapes: [pointShape(N, { jitter: 0.08 }), shell, cloudShape(N, { rx: 7.5, ry: 4.2, rz: 5 }), tunnel],
    colors: palette(N, C.colors.particles, { lJitter: 0.15 }),
    size: isMobile() ? 0.034 : 0.028, additive: true, opacity: 0,
  });
  morph.wobble((pos, { t, N: n }) => {
    const tt = t * 0.00035;
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      pos[o] += Math.sin(tt + i * 0.37) * 0.028;
      pos[o + 1] += Math.cos(tt * 1.3 + i * 0.91) * 0.028;
    }
  });
  scene.add(morph.points);

  /* poeira sempre presente (paralaxe e profundidade nas cenas escuras) */
  const dust = (() => {
    const DN = isMobile() ? 1200 : 2600, p = new Float32Array(DN * 3);
    for (let i = 0; i < DN; i++) { p[i * 3] = gauss() * 10; p[i * 3 + 1] = gauss() * 6; p[i * 3 + 2] = 10 - Math.random() * 72; }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({
      size: 0.03, map: softSprite(), color: C.colors.dust, transparent: true, opacity: 0.35,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
  })();
  scene.add(dust);

  /* galeria: planos com corredor livre pra câmera (fotos ou canvas procedural) */
  const CARDS = C.cards;
  document.getElementById("gTot").textContent = String(CARDS.length).padStart(2, "0");
  const gallery = new THREE.Group();
  scene.add(gallery);
  const cardMeshes = [];
  const unitPlane = new THREE.PlaneGeometry(1, 1);
  const roundMask = (() => { // cantos arredondados pra qualquer imagem
    const cv = document.createElement("canvas"); cv.width = cv.height = 256;
    const c = cv.getContext("2d"); c.fillStyle = "#000"; c.fillRect(0, 0, 256, 256);
    c.fillStyle = "#fff"; c.beginPath(); c.roundRect(0, 0, 256, 256, 14); c.fill();
    return new THREE.CanvasTexture(cv);
  })();
  function layoutCards() {
    const rnd = mulberry32(7), mob = isMobile();
    cardMeshes.forEach((m, i) => {
      const side = i % 2 ? 1 : -1;
      const w = mob ? 1.1 + rnd() * 0.4 : 1.9 + rnd() * 0.9;
      const x = side * (w / 2 + (mob ? 0.22 + rnd() * 0.25 : 0.75 + rnd() * 0.6)); // borda interna longe do eixo da câmera
      m.scale.set(w, w * m.userData.aspect, 1);
      m.position.set(x, (rnd() - 0.5) * (mob ? 1.8 : 2.2), -5 - i * 2.6);
      m.rotation.set(0, -side * (0.12 + rnd() * 0.2), (rnd() - 0.5) * 0.12);
    });
  }
  async function buildGallery() {
    await document.fonts.ready;
    const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const loader = new THREE.TextureLoader();
    const texes = await Promise.all(CARDS.map((c) => (c.src ? loader.loadAsync(c.src) : new THREE.CanvasTexture(c.canvas()))));
    texes.forEach((tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = maxAniso;
      const img = tex.image;
      const m = new THREE.Mesh(unitPlane, new THREE.MeshBasicMaterial({ map: tex, alphaMap: roundMask, transparent: true, side: THREE.DoubleSide }));
      m.userData.aspect = img.height / img.width;
      cardMeshes.push(m);
      gallery.add(m);
    });
    layoutCards();
  }
  const galleryReady = buildGallery();
  addEventListener("resize", () => cardMeshes.length && layoutCards());

  /* câmera: posições-chave */
  const ORBIT_R = 8.5;
  const statementCam = (p) => new THREE.Vector3(Math.sin(p * 0.5) * ORBIT_R, 0.3 * p, Math.cos(p * 0.5) * ORBIT_R);
  const FINAL_Z = -51;
  const galleryCurve = () => {
    const k = isMobile() ? 0.45 : 1;
    return new THREE.CatmullRomCurve3([
      statementCam(1),
      new THREE.Vector3(2.6 * k, 0.2, 1.2),
      new THREE.Vector3(0.3 * k, 0, -6),
      new THREE.Vector3(-0.3 * k, 0.1, -16),
      new THREE.Vector3(0.3 * k, -0.1, -26),
      new THREE.Vector3(-0.2 * k, 0, -36),
      new THREE.Vector3(0, 0, FINAL_Z + 6.5),
    ], false, "centripetal");
  };
  let curve = galleryCurve();
  addEventListener("resize", () => (curve = galleryCurve()));

  /* ---------------- DOM ---------------- */
  const $ = (s) => document.querySelector(s);
  const sec = {
    hero: $("#hero"), intro: $("#intro"), devices: $("#devices"), bloom: $("#bloom"),
    statement: $("#statement"), gallery: $("#gallery"), final: $("#final"),
  };
  const el = {
    nav: $("#nav"), panel: $("#panel"), heroCopy: [...document.querySelectorAll(".hero-eyebrow, .hero-foot, .hero-photo")],
    sheet: $("#dvSheet"), track: $("#dvTrack"), dvCopy: $("#dvCopy"),
    phones: [...document.querySelectorAll(".phone")], phoneHero: $("#phoneHero"),
    bloomCap: $("#bloomCap"), bloomSide: $("#bloomSide"),
    stA: $("#stA"), stB: $("#stB"), stNote: $("#stNote"),
    gHud: $("#gHud"), gIdx: $("#gIdx"), gTitle: $("#gTitle"), gHead: $("#gHead"),
    finalCopy: $("#finalCopy"),
  };
  const curtainInner = [...el.phoneHero.querySelectorAll(".curtain-fade")];
  const centerIndex = el.phones.indexOf(el.phoneHero);

  /** Palavras que sobem por máscara quando o elemento entra na tela. */
  function riseWords(node, delay0 = 0) {
    const words = node.textContent.trim().split(/\s+/);
    node.setAttribute("aria-label", node.textContent.trim());
    node.textContent = "";
    words.forEach((w, i) => {
      const o = document.createElement("span"); o.className = "rw"; o.setAttribute("aria-hidden", "true");
      const inner = document.createElement("span"); inner.className = "rw-i"; inner.textContent = w;
      inner.style.transitionDelay = `${delay0 + i * 70}ms`;
      o.appendChild(inner); node.appendChild(o);
      if (i < words.length - 1) node.appendChild(document.createTextNode(" "));
    });
  }
  riseWords($("#headline .t1"));
  riseWords($("#headline .t2"), 180);
  new IntersectionObserver((es, io) => {
    es.forEach((e) => { if (e.isIntersecting) { $("#headline").classList.add("on"); io.disconnect(); } });
  }, { threshold: 0.4 }).observe($("#headline"));

  /** Letras (por caractere) pro statement; espaço vira nbsp (span inline-block colapsa espaço comum). */
  function chars(node) {
    const t = node.textContent.trim();
    node.setAttribute("aria-label", t);
    node.textContent = "";
    return [...t].map((c) => {
      const s = document.createElement("span");
      s.className = "ch"; s.setAttribute("aria-hidden", "true");
      s.textContent = c === " " ? " " : c;
      node.appendChild(s);
      return s;
    });
  }
  const stAch = chars(el.stA), stBch = chars(el.stB);

  /* contadores pt-BR: data-count="2.4" data-suffix="%" */
  document.querySelectorAll("[data-count]").forEach((node) => {
    const target = parseFloat(node.dataset.count), dec = node.dataset.count.includes(".") ? 1 : 0;
    const pad = node.dataset.pad ? +node.dataset.pad : 0, suffix = node.dataset.suffix || "";
    const fmt = (v) => v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec }).padStart(pad, "0") + suffix;
    node.textContent = fmt(0);
    new IntersectionObserver((es, io) => {
      if (!es[0].isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      (function tick(now) {
        const k = Math.min(1, (now - t0) / 1600);
        node.textContent = fmt(target * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(tick);
      })(t0);
    }, { threshold: 0.6 }).observe(node);
  });

  let mx = 0, my = 0, smx = 0, smy = 0;
  addEventListener("pointermove", (e) => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; });

  /* ---------------- timeline ---------------- */

  /** Progresso [0..1] de uma seção com palco sticky (0 = topo encostou, 1 = fim do pin). */
  const prog = (node) => {
    const r = node.getBoundingClientRect(), span = r.height - innerHeight;
    return span > 0 ? clamp(-r.top / span) : clamp(-r.top / innerHeight);
  };
  /** Quanto a seção já entrou por baixo [0..1]. */
  const enter = (node) => clamp(1 - node.getBoundingClientRect().top / innerHeight);

  const V = new THREE.Vector3(), look = new THREE.Vector3(), tmp = new THREE.Vector3();
  const visibleH = (dist) => 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const HS = C.heroScale;
  let state = {}, lastCard = -1;

  function update(t) {
    const W = innerWidth, H = innerHeight, mob = isMobile();
    // aba oculta/sem tamanho: innerHeight 0 vira NaN no progresso e o erro mataria o loop do three
    if (!W || !H) return false;
    const heroK = clamp(scrollY / H);
    const inP = prog(sec.intro);
    const dvE = enter(sec.devices), dvP = prog(sec.devices);
    const blP = prog(sec.bloom), stP = prog(sec.statement), gaP = prog(sec.gallery), fiP = prog(sec.final);
    const blE = enter(sec.bloom), gaE = enter(sec.gallery), fiE = enter(sec.final);
    // florescer numa régua só: entrada + pin (sem degrau quando a seção encosta no topo)
    const blPin = (sec.bloom.offsetHeight - H) / H;
    const blT = clamp((blE + blP * blPin) / (1 + blPin));
    smx += (mx - smx) * 0.05; smy += (my - smy) * 0.05;

    /* ===== DOM ===== */
    const heroOp = 1 - clamp(heroK * 1.6);
    el.heroCopy.forEach((n) => { n.style.opacity = heroOp; });

    const inE = enter(sec.intro);
    el.panel.style.transform = `translateY(${(1 - sm(inE)) * 8}vh) scale(${lerp(0.9, 1, sm(inE)) * lerp(1, 0.94, sm(dvE))})`;
    el.panel.style.opacity = lerp(0.2, 1, sm(inE)) * lerp(1, 0.4, sm(dvE));

    const rad = (mob ? 24 : 36) * (1 - sm(dvE));
    el.sheet.style.borderRadius = `${rad}px ${rad}px 0 0`;
    el.sheet.style.opacity = 1 - seg(dvP, 0.8, 0.84);
    el.track.style.transform = `translateX(${lerp(8, -58, dvP / 0.8)}%)`;
    el.dvCopy.style.opacity = seg(dvP, 0.12, 0.2) * (1 - seg(dvP, 0.52, 0.6));

    const pw = el.phones[0].offsetWidth, ph = pw * 19 / 9;
    const cover = Math.max(W / pw, H / ph) * 1.2;
    const spread = mob ? W * 0.3 : Math.min(W * 0.19, 300);
    const b = seg(dvP, 0.08, 0.64), c = sm(seg(dvP, 0.58, 0.8)), grow = sm(seg(dvP, 0.66, 0.86));
    el.phones.forEach((node, i) => {
      const o = i - centerIndex, center = o === 0;
      const a = sm(seg(dvP, i * 0.022, 0.13 + i * 0.022)); // subida escalonada
      const x = o * spread * (1 + c * 1.6);
      let y = (1 - a) * H * 1.15 + Math.sin(i * 1.7) * H * 0.04 * (1 - c);
      let z = -Math.abs(o) * 140 * (1 - c * 0.5) + (center ? 60 : 0);
      let ry = lerp(34, -34, b) - o * 9, rz = o * 4 + (1 - a) * -14, rx = (1 - a) * 28 + 6 * (1 - c);
      let s = 1;
      if (center) {
        const st = sm(seg(dvP, 0.56, 0.7));
        ry *= 1 - st; rz *= 1 - st; rx *= 1 - st; y *= 1 - st; z = lerp(z, 0, st);
        s = lerp(1, cover, grow);
      }
      node.style.transform = `translate3d(${x}px, ${y}px, ${z}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${s})`;
      node.style.opacity = center ? 1 - seg(dvP, 0.88, 0.98) : 1 - c;
    });
    const cFade = 1 - seg(dvP, 0.62, 0.7);
    curtainInner.forEach((n) => { n.style.opacity = cFade; });

    const dvRect = sec.devices.getBoundingClientRect();
    el.nav.classList.toggle("on-light", dvRect.top < 40 && dvRect.bottom > 40 && dvP < 0.8);

    el.bloomCap.style.opacity = seg(blP, 0.22, 0.38) * (1 - seg(blP, 0.82, 0.96));
    el.bloomCap.style.transform = `translateY(${(1 - seg(blP, 0.22, 0.4)) * 30}px)`;
    el.bloomSide.style.opacity = seg(blP, 0.34, 0.5) * (1 - seg(blP, 0.82, 0.96));

    const stOut = 1 - seg(stP, 0.82, 0.97);
    [stAch, stBch].forEach((list, k) => list.forEach((ch, i) => {
      const r = sm(seg(stP, 0.04 + k * 0.1 + i * 0.022, 0.3 + k * 0.1 + i * 0.022));
      ch.style.transform = `translateY(${(1 - r) * 60}%)`;
      ch.style.opacity = r;
    }));
    el.stA.style.transform = `translateX(${-stP * 5}vw)`;
    el.stB.style.transform = `translateX(${(1 - stP) * 5}vw)`;
    el.stA.style.opacity = el.stB.style.opacity = stOut;
    el.stNote.style.opacity = seg(stP, 0.3, 0.45) * stOut;

    const headOut = seg(gaP, 0.03, 0.12);
    el.gHead.style.opacity = seg(gaE, 0.6, 1) * (1 - headOut);
    el.gHead.style.transform = `scale(${1 + headOut * 1.8})`;
    el.gHud.style.opacity = seg(gaP, 0.1, 0.16) * (1 - seg(gaP, 0.9, 0.97));

    el.finalCopy.style.opacity = seg(fiP, 0.2, 0.42);
    el.finalCopy.style.transform = `translateY(${(1 - sm(seg(fiP, 0.2, 0.45))) * 40}px)`;

    /* ===== WebGL ===== */
    const covered = dvRect.top <= 0 && dvP < 0.8; // folha clara cobre tudo: não desenha
    state = { heroK, inP, dvP, blP, stP, gaP, fiP, covered };
    if (covered) return false;

    const intro = sm(t / 1800);
    const aspect = W / H;
    bgMat.uniforms.uAspect.value = aspect;
    bgMat.uniforms.uTime.value = t * 0.001;

    // --- objeto herói
    const camZ0 = 6.5, hVis = visibleH(camZ0), wVis = hVis * aspect;
    const panelPos = mob ? tmp.set(0, -hVis * 0.2, 0) : tmp.set(wVis * 0.22, -0.1, 0);
    const toPanel = sm(heroK) * (1 - sm(seg(dvP, 0.5, 0.8)));
    heroG.position.copy(panelPos).multiplyScalar(toPanel);
    let hs = lerp(1, mob ? HS.panelMobile : HS.panel, toPanel);
    if (dvP > 0.5) hs = lerp(hs, HS.curtain, sm(seg(dvP, 0.5, 0.8)));
    hs = lerp(hs, HS.bloom, sm(seg(blT, 0.1, 0.7)));

    const u = gaP + (sm(gaP) - gaP) * 0.6;
    const galleryCam = curve.getPointAt(u);
    if (gaP > 0 && galleryCam.z < -2) { // câmera passou: o objeto reaparece no fim do túnel
      const k = sm(seg(fiE, 0.3, 1));
      heroG.position.set(mob ? 0 : 1.9 * k, mob ? 0.9 * k : 0, FINAL_Z);
      hs = mob ? HS.finalMobile : HS.final;
    }
    heroG.scale.setScalar(hs * intro);
    const scrollTerm = Math.min(scrollY, sec.final.offsetTop - H) * 0.0008;
    hero.animate(hero.object, { t, intro, scrollTerm, fiE, fiP });

    // --- câmera
    if (gaP > 0 || fiP > 0) {
      camera.position.copy(galleryCam);
      look.copy(curve.getPointAt(Math.min(1, u + 0.06)));
      if (u < 0.12) look.lerp(V.set(0, 0, 0), 1 - sm(u / 0.12));
      if (u > 0.85) look.lerp(V.set(0, 0, FINAL_Z), sm(seg(u, 0.85, 1)));
      camera.position.z -= sm(fiP) * 0.8;
    } else if (stP > 0) {
      camera.position.copy(statementCam(stP));
      look.set(0, 0, 0);
    } else if (blE > 0) {
      camera.position.set(0, 0, lerp(4.4, ORBIT_R, sm(seg(blT, 0.1, 0.85))));
      look.set(0, 0, 0);
    } else {
      camera.position.set(0, 0, lerp(camZ0, 4.4, sm(seg(dvP, 0.8, 1))));
      look.copy(heroG.position).multiplyScalar(0.35);
    }
    camera.position.x += smx * 0.35;
    camera.position.y += -smy * 0.22;
    camera.lookAt(look);

    // --- partículas
    const m = seg(blT, 0.12, 0.7) + seg(stP, 0.05, 0.7) + seg(gaP, 0, 0.2);
    const pOp = seg(blT, 0.1, 0.25);
    morph.mat.opacity = pOp * lerp(0.95, 0.6, seg(stP, 0.1, 0.6)) * lerp(1, 1.4, seg(gaP, 0, 0.2));
    morph.points.visible = pOp > 0.001;
    if (morph.points.visible) {
      morph.update(m / 3, t);
      morph.points.rotation.y = Math.sin(t * 0.0001) * 0.6 * (1 - seg(gaP, 0, 0.2));
    }
    dust.rotation.z = t * 0.00001;

    // --- galeria + HUD
    gallery.visible = cardMeshes.length > 0 && (stP > 0.9 || gaP > 0 || fiP > 0);
    if (gaP > 0 && cardMeshes.length) {
      let passed = 0;
      for (const cm of cardMeshes) if (cm.position.z > camera.position.z + 0.5) passed++;
      const ci = Math.min(CARDS.length - 1, passed);
      if (ci !== lastCard) {
        lastCard = ci;
        el.gIdx.textContent = String(ci + 1).padStart(2, "0");
        el.gTitle.textContent = CARDS[ci].title;
      }
    }

    // --- fundo, névoa, bloom
    heroG.updateMatrixWorld();
    V.copy(heroG.position).project(camera);
    const dist = camera.position.distanceTo(heroG.position);
    const frac = (HERO_R * heroG.scale.x) / (dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    bgMat.uniforms.uCenter.value.set(V.x * 0.5 + 0.5, V.y * 0.5 + 0.5);
    bgMat.uniforms.uRadius.value = clamp(frac * 0.5 * 1.25, 0.08, 0.6);
    let glow = lerp(1, 0.55, seg(stP, 0.2, 0.8)) * lerp(1, 0.35, seg(gaP, 0, 0.1));
    glow = lerp(glow, 1, seg(gaP, 0.8, 1));
    bgMat.uniforms.uGlowAmt.value = V.z > 1 ? 0 : glow * C.glowStrength;
    const fill = 1 - sm(seg(blT, 0.12, 0.5));
    bgMat.uniforms.uFill.value = Math.max(blE > 0 || dvP >= 0.8 ? fill : 0, sm(seg(fiP, 0.05, 0.55)) * 0.9);
    scene.fog.density = gaP > 0 ? 0.03 : 0.012;
    bloomPass.strength = lerp(C.bloom.strength, C.bloom.strength * 0.8, sm(fiP));

    Object.assign(state, { m: +m.toFixed(3), u: +u.toFixed(3), fill: +bgMat.uniforms.uFill.value.toFixed(2), cam: camera.position.toArray().map((v) => +v.toFixed(2)) });
    return true;
  }

  const t0 = performance.now(); // mesma base de tempo do rAF
  function frame(now) {
    lenis?.raf(now);
    if (update(now - t0)) fx.render();
  }
  window.__step = frame;
  window.__state = () => state;
  window.__ready = galleryReady;
  renderer.setAnimationLoop(frame);
  return { fx, hero, gallery, ready: galleryReady };
}
