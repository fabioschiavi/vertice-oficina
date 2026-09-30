/* VÉRTICE — conteúdo da adaptação: roda de carro 3D + fotos reais (Pixabay). */
import { runCinema } from "./engine/cinema.js";
import { wheelHero } from "./engine/heroes.js";

/* ícone da marca: aro + 9 pás curvas (mesma linguagem do rotor 3D) */
{
  const NS = "http://www.w3.org/2000/svg", g = document.querySelector(".brand-rotor");
  const ring = document.createElementNS(NS, "circle");
  Object.entries({ r: 10, fill: "none", stroke: "currentColor", "stroke-width": 1.6 }).forEach(([k, v]) => ring.setAttribute(k, v));
  g.appendChild(ring);
  for (let k = 0; k < 9; k++) {
    const a0 = (k / 9) * Math.PI * 2, a1 = a0 + 0.61, am = a0 + 0.3;
    const p = (r, a) => `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", `M${p(3, a0)} Q${p(6.8, am - 0.05)} ${p(9.4, a1)}`);
    Object.entries({ fill: "none", stroke: "currentColor", "stroke-width": 1.3, "stroke-linecap": "round" }).forEach(([k2, v]) => path.setAttribute(k2, v));
    g.appendChild(path);
  }
}

const CARDS = [
  ["g12-chegada", "Chegada"],
  ["g01-presenca", "Presença"],
  ["g02-linhas", "Linhas"],
  ["g08-elevador", "Inspeção no elevador"],
  ["g05-freios", "Freios"],
  ["g04-rodas", "Rodas e pneus"],
  ["g06-motor", "Motor"],
  ["g11-ferramental", "Ferramental"],
  ["g10-lavagem", "Lavagem técnica a vapor"],
  ["g07-polimento", "Lavagem de contato"],
  ["g13-detalhamento", "Detalhamento"],
  ["g03-protecao", "Proteção cerâmica"],
  ["g09-assinatura", "Assinatura de luz"],
  ["g14-entrega", "Entrega"],
].map(([file, title]) => ({ title, src: `img/${file}.jpg` }));

runCinema({
  colors: {
    base: 0x0b0e11, glow: 0xc0643f, fill: 0xd96b46, dust: 0xe8d8c8,
    particles: ["#e8e4dc", "#c9ced3", "#f7f5f0", "#f08058", "#b8bec4", "#ffffff", "#f4a284"],
  },
  // estúdio do reflexo: softbox grande acima à esquerda, faixa estreita à direita, cobre atrás
  env: [
    [6, 3, 0xffffff, 6, -3.5, 4, 2],
    [0.6, 9, 0xffffff, 7, 5, 0, 1.5],
    [6, 5, 0xf08058, 2.2, 0, -1, -6],
    [8, 1.4, 0xf08058, 1.2, 0, -4.5, 2],
    [1.2, 1.2, 0xffffff, 3, 2, 1.5, 5],
    [7, 2.2, 0xffffff, 3.2, -1, 2.5, 6],   // softbox frontal: faces viradas pra câmera
    [0.8, 8, 0xffffff, 5, -6, 0, 3],       // faixa lateral: rotor visto de lado no painel
  ],
  glowStrength: 0.6,
  exposure: 1.1,
  hero: wheelHero({ caliper: 0xf08058 }),
  heroScale: { panelMobile: 0.28, panelMobileY: 0.3 },
  cards: CARDS,
});
