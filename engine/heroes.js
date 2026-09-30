/* NOVA FX — templates/cinema-scroll/engine/heroes.js
   Objetos-herói procedurais pro motor cinema.js. Cada fábrica devolve:
     ({ THREE, renderer, mobile }) => ({ object, radius, animate(object, s) })
   - object: Object3D centrado na origem (o motor posiciona e escala o grupo externo)
   - radius: raio aproximado (define o tamanho do halo que segue o objeto)
   - animate: rotações a partir de s = { t, intro, scrollTerm, fiE, fiP }
*/

/* ---------------- estrela de 4 pontas (Astrum) ---------------- */

/** Contorno polar: superelipse com p < 1 (pontas nos eixos, lados côncavos, centro sólido). */
export const starRadius = (th, R, p = 0.55) =>
  R * Math.pow(Math.pow(Math.abs(Math.cos(th)), p) + Math.pow(Math.abs(Math.sin(th)), p), -1 / p);

/** Path SVG da estrela (ícone da marca, telas de celular). */
export function starPath(R, p = 0.55) {
  let d = "";
  for (let i = 0; i <= 160; i++) {
    const a = (i / 160) * Math.PI * 2, r = starRadius(a, R, p);
    d += (i ? "L" : "M") + (Math.cos(a) * r).toFixed(2) + " " + (Math.sin(a) * r).toFixed(2);
  }
  return d + "Z";
}

export const starHero = ({ R = 1.3, H = 0.42, p = 0.55, roughness = 0.1 } = {}) => ({ THREE, mobile }) => {
  // anéis polares frente/verso costurados na borda → normais suaves ("estrela inflada")
  const S = mobile ? 128 : 192, rings = mobile ? 20 : 30, rows = rings * 2 + 1;
  const pos = new Float32Array(rows * S * 3);
  for (let i = 0; i < rows; i++) {
    const front = i <= rings, k = front ? i / rings : (rows - 1 - i) / rings; // 0 no polo, 1 na borda
    const phi = (k * Math.PI) / 2, s = Math.sin(phi), zc = Math.cos(phi);
    for (let j = 0; j < S; j++) {
      const th = (j / S) * Math.PI * 2, r = starRadius(th, R, p), o = (i * S + j) * 3;
      pos[o] = Math.cos(th) * r * s; pos[o + 1] = Math.sin(th) * r * s;
      pos[o + 2] = (front ? 1 : -1) * zc * H * (1 - 0.4 * s);
    }
  }
  const idx = [];
  for (let i = 0; i < rows - 1; i++)
    for (let j = 0; j < S; j++) {
      const a = i * S + j, b = i * S + ((j + 1) % S), c = (i + 1) * S + j, d = (i + 1) * S + ((j + 1) % S);
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const n = g.attributes.normal.array;
  for (let j = 0; j < S; j++) { n.set([0, 0, 1], j * 3); n.set([0, 0, -1], ((rows - 1) * S + j) * 3); }

  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness, envMapIntensity: 1 }));
  return {
    object: mesh,
    radius: R,
    animate(o, { t, intro, scrollTerm, fiE }) {
      // no fechamento gira até ficar de frente (a estrela é simétrica a cada π em Y)
      const faceOn = (Math.round(scrollTerm / Math.PI) * Math.PI - scrollTerm) * fiE * fiE * (3 - 2 * fiE);
      o.rotation.y = Math.sin(t * 0.0004) * 0.8 * (1 - 0.6 * fiE) + scrollTerm + faceOn + (1 - intro) * 3;
      o.rotation.x = Math.sin(t * 0.00021) * 0.3;
      o.rotation.z = Math.sin(t * 0.0003) * 0.1;
    },
  };
};

/* ---------------- rotor usinado de 9 pás (Vértice) ---------------- */

/**
 * Aro e cubo por LatheGeometry (perfil chanfrado revolvido); pás como tubos paramétricos
 * de seção "superelipse" (faces planas, bordas arredondadas) ao longo de uma linha central
 * curva r(u) = r0 + (r1 - r0)u, θ(u) = θ0 + sweep·u. As pontas das pás somem dentro do cubo
 * e do aro, então não precisam de tampa.
 */
export const rotorHero = ({
  blades = 9, R = 1.08, scale = 1.2, sweep = 0.61,
  bodyRoughness = 0.24, edgeRoughness = 0.13,
} = {}) => ({ THREE, mobile }) => {
  const matBody = new THREE.MeshStandardMaterial({ color: 0xbec5cb, metalness: 1, roughness: bodyRoughness });
  const matEdge = new THREE.MeshStandardMaterial({ color: 0xf2f4f6, metalness: 1, roughness: edgeRoughness });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x8a9096, metalness: 1, roughness: 0.34 });

  // perfil chanfrado [rIn, rOut] × [-h/2, h/2] revolvido em torno de Y
  const lathe = (rIn, rOut, h, c, segs) => {
    const y = h / 2, pts = [
      [rIn + c, -y], [rOut - c, -y], [rOut, -y + c], [rOut, y - c],
      [rOut - c, y], [rIn + c, y], [rIn, y - c], [rIn, -y + c], [rIn + c, -y],
    ].map(([r, yy]) => new THREE.Vector2(r, yy));
    const g = new THREE.LatheGeometry(pts, segs);
    g.rotateX(Math.PI / 2); // eixo do rotor = Z (de frente pra câmera)
    return g;
  };
  const segs = mobile ? 96 : 160;
  const spinner = new THREE.Group();
  spinner.add(new THREE.Mesh(lathe(R * 0.889, R, 0.14, 0.014, segs), matEdge));      // aro externo
  spinner.add(new THREE.Mesh(lathe(0.16, 0.32, 0.38, 0.015, segs / 2), matEdge));    // cubo vazado
  spinner.add(new THREE.Mesh(lathe(0.2, 0.235, 0.4, 0.004, segs / 2), matDark));     // sulco 1
  spinner.add(new THREE.Mesh(lathe(0.265, 0.285, 0.4, 0.004, segs / 2), matDark));   // sulco 2

  // pá paramétrica
  const NU = mobile ? 28 : 40, NP = mobile ? 16 : 24;
  const r0 = 0.3, r1 = R * 0.907, T = 0.05;
  const bladeGeo = (() => {
    const pos = new Float32Array((NU + 1) * NP * 3);
    const C = (u) => { const r = r0 + (r1 - r0) * u, th = sweep * u; return [Math.cos(th) * r, Math.sin(th) * r]; };
    for (let i = 0; i <= NU; i++) {
      const u = i / NU, [cx, cy] = C(u);
      const [ax, ay] = C(Math.max(0, u - 0.01)), [bx, by] = C(Math.min(1, u + 0.01));
      let tx = bx - ax, ty = by - ay; const tl = Math.hypot(tx, ty); tx /= tl; ty /= tl;
      const nx = -ty, ny = tx;                                 // normal no plano
      const w = 0.075 + 0.05 * u;                              // largura cresce pra fora
      const lift = 0.1 * Math.sin(Math.PI * u);                // elevação suave
      for (let j = 0; j < NP; j++) {
        const f = (j / NP) * Math.PI * 2;
        const cv = Math.cos(f), sv = Math.sin(f);
        const v = Math.sign(cv) * Math.pow(Math.abs(cv), 0.55); // superelipse: faces planas
        const zz = Math.sign(sv) * Math.pow(Math.abs(sv), 0.55);
        const o = (i * NP + j) * 3;
        pos[o] = cx + nx * v * (w / 2);
        pos[o + 1] = cy + ny * v * (w / 2);
        pos[o + 2] = lift + v * (w / 2) * 0.55 + zz * (T / 2); // inclinação transversal
      }
    }
    const idx = [];
    for (let i = 0; i < NU; i++)
      for (let j = 0; j < NP; j++) {
        const a = i * NP + j, b = i * NP + ((j + 1) % NP), c = (i + 1) * NP + j, d = (i + 1) * NP + ((j + 1) % NP);
        idx.push(a, b, c, b, d, c);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  })();
  for (let k = 0; k < blades; k++) {
    const m = new THREE.Mesh(bladeGeo, matBody);
    m.rotation.z = (k / blades) * Math.PI * 2;
    spinner.add(m);
  }

  const obj = new THREE.Group();
  obj.add(spinner);
  obj.scale.setScalar(scale);
  return {
    object: obj,
    radius: R * scale,
    animate(o, { t, intro, scrollTerm, fiE }) {
      // gira no próprio eixo (scroll + tempo); corpo em três quartos com oscilação lenta
      spinner.rotation.z = -(t * 0.00035 + scrollTerm * 1.6) - (1 - intro) * 4;
      o.rotation.x = -0.42 + Math.sin(t * 0.00023) * 0.08 + 0.2 * fiE;
      o.rotation.y = 0.5 + Math.sin(t * 0.0003) * 0.18 - 0.2 * fiE;
      o.rotation.z = 0.08;
    },
  };
};

/* ---------------- roda de carro (Vértice) ---------------- */

/**
 * Pneu e aro por LatheGeometry (perfis revolvidos); raios duplos como tubos paramétricos
 * de seção superelipse, em "prato" (sobem do cubo até a borda do aro); disco de freio atrás
 * dos raios; pinça pintada na cor de acento, PARADA enquanto a roda gira (como no carro).
 * Unidades: raio externo do pneu = 1.
 */
export const wheelHero = ({
  spokes = 5, scale = 1.3, caliper = 0xf08058, rimColor = 0xd9dde1,
} = {}) => ({ THREE, mobile }) => {
  const segs = mobile ? 96 : 180;
  const mat = {
    rubber: new THREE.MeshStandardMaterial({ color: 0x17191b, metalness: 0, roughness: 0.78 }),
    rim: new THREE.MeshStandardMaterial({ color: rimColor, metalness: 1, roughness: 0.2 }),
    lip: new THREE.MeshStandardMaterial({ color: 0xf2f4f6, metalness: 1, roughness: 0.12 }),
    barrel: new THREE.MeshStandardMaterial({ color: 0x4a5056, metalness: 1, roughness: 0.42, side: THREE.DoubleSide }),
    disc: new THREE.MeshStandardMaterial({ color: 0x7d8388, metalness: 1, roughness: 0.46 }),
    caliper: new THREE.MeshStandardMaterial({ color: caliper, metalness: 0.25, roughness: 0.32 }),
  };
  // perfil [r, y] revolvido em torno de Y; depois eixo da roda = Z (de frente pra câmera)
  const latheZ = (pts, s = segs) => {
    const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), s);
    g.rotateX(Math.PI / 2);
    return g;
  };
  const ring = (rIn, rOut, y0, y1, c = 0.008) => latheZ([
    [rIn + c, y0], [rOut - c, y0], [rOut, y0 + c], [rOut, y1 - c],
    [rOut - c, y1], [rIn + c, y1], [rIn, y1 - c], [rIn, y0 + c], [rIn + c, y0],
  ]);

  const spinner = new THREE.Group();

  // pneu: talão → flanco abaulado → ombro → banda com 3 sulcos → volta
  const tire = [
    [0.70, -0.2], [0.78, -0.226], [0.88, -0.236], [0.95, -0.226], [0.985, -0.196], [1.0, -0.16],
    [1.0, -0.1], [0.984, -0.095], [0.984, -0.075], [1.0, -0.07], [1.0, -0.02], [0.984, -0.015],
    [0.984, 0.015], [1.0, 0.02], [1.0, 0.07], [0.984, 0.075], [0.984, 0.095], [1.0, 0.1],
    [1.0, 0.16], [0.985, 0.196], [0.95, 0.226], [0.88, 0.236], [0.78, 0.226], [0.70, 0.2],
  ];
  spinner.add(new THREE.Mesh(latheZ(tire), mat.rubber));
  spinner.add(new THREE.Mesh(latheZ([[0.69, -0.19], [0.69, 0.17]]), mat.barrel));   // tambor do aro
  spinner.add(new THREE.Mesh(ring(0.655, 0.72, 0.16, 0.215, 0.012), mat.lip));        // borda polida

  // raios duplos em prato: saem juntos do cubo e se abrem até a borda
  const NU = mobile ? 20 : 30, NP = mobile ? 12 : 18, T = 0.055;
  const spokeGeo = (side) => {
    const pos = new Float32Array((NU + 1) * NP * 3);
    const C = (u) => {
      const r = 0.15 + 0.53 * u, th = side * (0.045 + 0.1 * u);
      return [Math.cos(th) * r, Math.sin(th) * r, 0.15 + 0.055 * Math.pow(u, 1.4)];
    };
    for (let i = 0; i <= NU; i++) {
      const u = i / NU, [cx, cy, cz] = C(u);
      const [ax, ay] = C(Math.max(0, u - 0.01)), [bx, by] = C(Math.min(1, u + 0.01));
      let tx = bx - ax, ty = by - ay; const tl = Math.hypot(tx, ty); tx /= tl; ty /= tl;
      const nx = -ty, ny = tx, w = 0.085 + 0.03 * u; // raio largo, abre em direção à borda
      for (let j = 0; j < NP; j++) {
        const f = (j / NP) * Math.PI * 2, cv = Math.cos(f), sv = Math.sin(f);
        const v = Math.sign(cv) * Math.pow(Math.abs(cv), 0.5), zz = Math.sign(sv) * Math.pow(Math.abs(sv), 0.5);
        const o = (i * NP + j) * 3;
        pos[o] = cx + nx * v * (w / 2); pos[o + 1] = cy + ny * v * (w / 2); pos[o + 2] = cz + zz * (T / 2);
      }
    }
    const idx = [];
    for (let i = 0; i < NU; i++)
      for (let j = 0; j < NP; j++) {
        const a = i * NP + j, b = i * NP + ((j + 1) % NP), c = (i + 1) * NP + j, d = (i + 1) * NP + ((j + 1) % NP);
        idx.push(a, b, c, b, d, c);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  const spokeL = spokeGeo(1), spokeR = spokeGeo(-1);
  for (let k = 0; k < spokes; k++) {
    for (const g of [spokeL, spokeR]) {
      const m = new THREE.Mesh(g, mat.rim);
      m.rotation.z = (k / spokes) * Math.PI * 2 + Math.PI / 2;
      spinner.add(m);
    }
  }

  // cubo: flange + tampa central em domo + 5 porcas sextavadas
  spinner.add(new THREE.Mesh(ring(0.05, 0.175, 0.1, 0.2, 0.012), mat.rim));
  spinner.add(new THREE.Mesh(latheZ([[0.0001, 0.245], [0.03, 0.242], [0.055, 0.232], [0.07, 0.215], [0.075, 0.195]], 48), mat.lip));
  const lugGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.05, 6);
  lugGeo.rotateX(Math.PI / 2);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + Math.PI / 2 + Math.PI / 5;
    const lug = new THREE.Mesh(lugGeo, mat.lip);
    lug.position.set(Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0.215);
    spinner.add(lug);
  }

  // disco de freio (gira junto) com anel de fixação
  spinner.add(new THREE.Mesh(ring(0.24, 0.6, -0.05, 0.0, 0.006), mat.disc));
  spinner.add(new THREE.Mesh(ring(0.13, 0.25, -0.02, 0.06, 0.008), mat.barrel));

  // pinça: setor anelar extrudado, fixo no quadrante superior direito, abraçando a borda do disco
  const caliperMesh = (() => {
    const a0 = Math.PI * 0.12, a1 = Math.PI * 0.42, rI = 0.5, rO = 0.665;
    const sh = new THREE.Shape();
    sh.absarc(0, 0, rO, a0, a1, false);
    sh.absarc(0, 0, rI, a1, a0, true);
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 4, curveSegments: 24 });
    g.translate(0, 0, -0.085);
    return new THREE.Mesh(g, mat.caliper);
  })();

  const body = new THREE.Group();
  body.add(spinner, caliperMesh);
  body.scale.setScalar(scale);
  return {
    object: body,
    radius: scale,
    animate(o, { t, intro, scrollTerm, fiE }) {
      spinner.rotation.z = -(t * 0.0004 + scrollTerm * 1.8) - (1 - intro) * 4; // só a roda gira; a pinça fica
      o.rotation.x = -0.22 + Math.sin(t * 0.00023) * 0.06 + 0.1 * fiE;
      o.rotation.y = 0.62 + Math.sin(t * 0.0003) * 0.16 - 0.25 * fiE;
      o.rotation.z = 0;
    },
  };
};
