'use strict';

// Sprite e disegno a strati sul frame.

function drawSprite(f, spr, x, y, opts) {
  const o = opts || {};
  const flip = !!o.flip;
  const rows = spr.rows;
  for (let r = 0; r < rows.length; r++) {
    const line = rows[r];
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === ' ') continue;
      const sx = flip ? x + (line.length - 1 - c) : x + c;
      let fg;
      if (spr.colors && spr.colors[ch] !== undefined) fg = spr.colors[ch];
      else if (o.fg !== undefined) fg = o.fg;
      else fg = spr.fg;
      const bg = o.bg !== undefined ? o.bg : spr.bg;
      f.set(sx, y + r, ch, fg, bg);
    }
  }
}

// --- Aereo di lato (prua a destra) -----------------------------------------

function grid(w, h) {
  const g = [];
  for (let r = 0; r < h; r++) g.push(new Array(w).fill(' '));
  return g;
}

function buildSidePlane() {
  const g = grid(27, 5);
  for (let c = 4; c <= 20; c++) g[1][c] = '▄';
  for (let c = 1; c <= 23; c++) g[2][c] = '█';
  for (let c = 4; c <= 21; c++) g[3][c] = '▀';
  g[2][0] = '▐';
  g[2][24] = '▌';
  g[1][21] = '▄';
  g[3][22] = '▄';
  for (let c = 6; c <= 9; c++) g[0][c] = '█';
  // ala e motore sotto la fusoliera
  for (let c = 8; c <= 10; c++) g[4][c] = '▄';
  for (let c = 16; c <= 18; c++) g[4][c] = '▄';
  for (let c = 11; c <= 15; c++) g[4][c] = '█';
  // carrello
  for (let c = 5; c <= 7; c++) g[4][c] = '▀';
  return {
    rows: g.map((r) => r.join('')),
    colors: { '█': 252, '▄': 145, '▀': 250, '▐': 244, '▌': 244 },
  };
}

function buildSideTail() {
  const g = grid(27, 5);
  for (let c = 6; c <= 9; c++) g[0][c] = '█';
  for (let c = 4; c <= 9; c++) g[1][c] = '█';
  for (let c = 2; c <= 6; c++) g[2][c] = '█';
  return { rows: g.map((r) => r.join('')), colors: { '█': 214 } };
}

function buildSideWindows() {
  const g = grid(27, 5);
  for (let c = 8; c <= 18; c += 2) g[2][c] = '·';
  g[2][20] = ':';
  g[2][21] = ':';
  g[1][19] = '▄';
  g[1][20] = '▄';
  return { rows: g.map((r) => r.join('')), colors: { '·': 24, ':': 24, '▄': 39 } };
}

const PLANE_SIDE = buildSidePlane();
const PLANE_SIDE_TAIL = buildSideTail();
const PLANE_SIDE_WINDOWS = buildSideWindows();

// Elici di prua: 3 righe verticali, 4 fotogrammi.
const PROP_FRAMES = [
  { x: 25, rows: [1, 2, 3], ch: '|' },
  { x: 25, rows: [1, 2, 3], ch: '\\' },
  { x: 25, rows: [2], ch: '-' },
  { x: 25, rows: [1, 2, 3], ch: '/' },
];

// --- Aereo di dorso (decollo / atterraggio), 11 x 5 ------------------------

function makeRearPlane(bank) {
  const W = 11;
  const H = 5;
  const g = [];
  for (let r = 0; r < H; r++) g.push(new Array(W).fill(' '));

  const b = Math.max(-1, Math.min(1, bank));
  const leftRow = 2 - b;
  const rightRow = 2 + b;

  // ali (prima, sotto la fusoliera)
  for (let c = 0; c <= 4; c++) {
    if (leftRow >= 0 && leftRow < H) g[leftRow][c] = '▄';
  }
  for (let c = 6; c <= 10; c++) {
    if (rightRow >= 0 && rightRow < H) g[rightRow][c] = '▄';
  }
  // nacelle motori
  if (leftRow >= 0 && leftRow < H) {
    g[leftRow][3] = '█';
    g[leftRow][4] = '█';
  }
  if (rightRow >= 0 && rightRow < H) {
    g[rightRow][6] = '█';
    g[rightRow][7] = '█';
  }

  // coda verticale
  g[0][5] = '█';
  g[0][6] = '█';

  // fusoliera
  for (let r = 1; r <= 3; r++) {
    for (let c = 4; c <= 7; c++) g[r][c] = '█';
  }

  // carrello
  g[4][4] = '▀';
  g[4][7] = '▀';

  return {
    rows: g.map((r) => r.join('')),
    colors: { '█': 252, '▄': 145, '▀': 250 },
  };
}

const REAR_PLANE = {
  '-1': makeRearPlane(-1),
  0: makeRearPlane(0),
  1: makeRearPlane(1),
};

function rearNavLights(bank) {
  const b = Math.max(-1, Math.min(1, bank));
  return [
    { x: 0, y: 2 - b, fg: 196 },
    { x: 10, y: 2 + b, fg: 46 },
  ];
}

// --- Nuvole -----------------------------------------------------------------

const CLOUD_BIG = {
  rows: [
    '      ▄▄▄▄▄▄▄▄▄▄▄▄',
    '  ▄██████████████████▄▄▄▄',
    '▄█████████████████████████▄',
    '▀███████████████████████████▀',
    '  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
  ],
  colors: { '█': 255, '▄': 255, '▀': 246 },
};

const CLOUD_MID = {
  rows: [
    '    ▄▄▄▄▄▄▄▄▄',
    ' ▄███████████▄▄',
    '▄███████████████▄',
    '▀█████████████████▀',
    '  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
  ],
  colors: { '█': 250, '▄': 250, '▀': 244 },
};

const CLOUD_FAR = {
  rows: ['   ▄▄▄▄▄▄▄▄▄', ' ▄████████████▄', ' ▀█████████████▀', '   ▀▀▀▀▀▀▀▀▀▀▀'],
  colors: { '█': 244, '▄': 244, '▀': 240 },
};

const CLOUD_STORM = {
  rows: [
    '     ▓▓▓▓▓▓▓▓▓▓▓',
    '  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓',
    '▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓',
    ' ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓',
    '   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓',
  ],
  colors: { '▓': 239, '█': 238 },
};

// --- Ostacoli in volo -------------------------------------------------------

const BIRD = { rows: ['v'], colors: { v: 252 } };
const BIRD_FLOCK = { rows: [' v v', 'v  v'], colors: { v: 252 } };

const FUEL_TANK = {
  rows: ['▄█▄', '▐█▌'],
  colors: { '█': 46, '▄': 34, '▀': 34, '▐': 34, '▌': 34 },
};

const WIND_GUST = { rows: ['»»»', ' »»'], colors: { '»': 51 } };

// Montagna: contorno, larghezza 11, altezza h (cresce dal terreno).
function makeMountain(h) {
  const W = 11;
  const H = Math.max(3, h);
  const g = [];
  for (let r = 0; r < H; r++) g.push(new Array(W).fill(' '));
  g[0][4] = '^';
  g[0][5] = '^';
  for (let r = 1; r < H - 1; r++) {
    const left = 4 - r;
    const right = 5 + r;
    if (left >= 0) g[r][left] = '/';
    if (right < W) g[r][right] = '\\';
  }
  const base = H - 1;
  for (let c = 0; c < W; c++) g[base][c] = '_';
  const last = H - 2;
  if (last > 0) {
    const l = 4 - last;
    const r = 5 + last;
    if (l >= 0) g[last][l] = '/';
    if (r < W) g[last][r] = '\\';
  }
  return {
    rows: g.map((r) => r.join('')),
    colors: { '/': 242, '\\': 242, '^': 255, '_': 240 },
  };
}

const MOUNTAINS = [4, 5, 6].map(makeMountain);

// --- Terreno (volo di lato) -------------------------------------------------

const TERRAIN = {
  land: { surface: 28, deep: 22, feature: 29 },
  sea: { surface: 24, deep: 17, feature: 51 },
  desert: { surface: 179, deep: 136, feature: 146 },
  city: { surface: 238, deep: 236, feature: 244 },
  snow: { surface: 255, deep: 246, feature: 244 },
};

module.exports = {
  drawSprite,
  PLANE_SIDE,
  PLANE_SIDE_TAIL,
  PLANE_SIDE_WINDOWS,
  PROP_FRAMES,
  REAR_PLANE,
  rearNavLights,
  CLOUD_BIG,
  CLOUD_MID,
  CLOUD_FAR,
  CLOUD_STORM,
  BIRD,
  BIRD_FLOCK,
  FUEL_TANK,
  WIND_GUST,
  MOUNTAINS,
  TERRAIN,
};
