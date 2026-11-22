'use strict';

// Sprite pixel-art per la scena di volo.
// Ogni sprite: { rows: string[], colors: {char: 0xRRGGBB}, fg, bg }.
// Disegnati su PixelCanvas con drawSpriteCells.

const C = require('./render').COLORS;

function grid(w, h) {
  const g = [];
  for (let r = 0; r < h; r++) g.push(new Array(w).fill(' '));
  return g;
}

function set(g, x, y, ch) {
  if (y < 0 || y >= g.length) return;
  const row = g[y];
  if (x < 0 || x >= row.length) return;
  row[x] = ch;
}

function rect(g, x, y, w, h, ch) {
  for (let r = y; r < y + h; r++) {
    for (let c = x; c < x + w; c++) set(g, c, r, ch);
  }
}

function line(g, x0, y0, x1, y1, ch) {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0, y = y0;
  for (;;) {
    set(g, x, y, ch);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}

function rowsOf(g) { return g.map((r) => r.join('')); }

// Colori sprite (chiave -> RGB)
const KEYS = {
  FUS: '#',      // fusoliera bianca
  SHADE: 'W',
  DARK: 'd',
  WIN: 'w',
  ENGINE: 'E',
  GEAR: 'g',
  RED: 'r',
  GREEN: 'G',
  TAIL: 'T',
  WING: 'i',
  CLOUD: 'c',
  CLOUD_SHADE: 'C',
  STORM: 'm',
  LIGHTNING: 'l',
  BIRD: 'b',
  FUEL: 't',
  PLUS: '+',
  GUST: '>',
  MOUNTAIN: 'm',
  SNOW: 's',
};

const COL = {
  [KEYS.FUS]: C.plane,
  [KEYS.SHADE]: C.planeShade,
  [KEYS.DARK]: C.planeDark,
  [KEYS.WIN]: C.window,
  [KEYS.ENGINE]: C.planeDark,
  [KEYS.GEAR]: C.planeDark,
  [KEYS.RED]: C.navLeft,
  [KEYS.GREEN]: C.navRight,
  [KEYS.TAIL]: C.plane,
  [KEYS.WING]: C.plane,
  [KEYS.CLOUD]: C.cloudShade,
  [KEYS.CLOUD_SHADE]: C.cloud,
  [KEYS.STORM]: 0x3d3d44,
  [KEYS.LIGHTNING]: C.yellow,
  [KEYS.BIRD]: C.planeDark,
  [KEYS.FUEL]: C.green,
  [KEYS.PLUS]: C.white,
  [KEYS.GUST]: C.cyan,
  [KEYS.MOUNTAIN]: C.rock,
  [KEYS.SNOW]: C.snow,
};

// --- Aereo di dorso (decollo / atterraggio), vista da dietro ----------------

function buildRearPlane(bank) {
  const W = 46;
  const H = 22;
  const g = grid(W, H);
  const b = Math.max(-1, Math.min(1, bank));
  const shift = b * 2;
  const cx = Math.floor(W / 2);

  // coda verticale
  for (let r = 1; r <= 5; r++) {
    for (let c = cx - 1; c <= cx + 1; c++) set(g, c + (r > 3 ? b : 0), r, KEYS.TAIL);
  }
  set(g, cx - 2 + (b > 0 ? 1 : b < 0 ? -1 : 0), 0, KEYS.TAIL);
  set(g, cx + 2 + (b > 0 ? 1 : b < 0 ? -1 : 0), 0, KEYS.TAIL);

  // ali
  const wingY = 8;
  const wingSpan = 16;
  for (let c = cx - wingSpan; c <= cx + wingSpan; c++) set(g, c + shift, wingY, KEYS.WING);
  // motori sotto ali
  rect(g, cx - wingSpan - 2 + shift, wingY + 1, 4, 3, KEYS.ENGINE);
  rect(g, cx + wingSpan - 2 + shift, wingY + 1, 4, 3, KEYS.ENGINE);

  // fusoliera centrale
  const fW = 6;
  for (let r = 4; r <= 18; r++) {
    const fshift = r > 14 ? b : 0;
    const col = r < 10 ? KEYS.SHADE : KEYS.FUS;
    for (let c = cx - Math.floor(fW / 2); c <= cx + Math.floor(fW / 2); c++) set(g, c + fshift, r, col);
  }
  // abitacolo
  set(g, cx - 1, 5, KEYS.WIN); set(g, cx, 5, KEYS.WIN);
  set(g, cx - 1, 6, KEYS.WIN); set(g, cx, 6, KEYS.WIN);

  // carrello
  for (let c = cx - 2; c <= cx + 2; c++) set(g, c + b, 19, KEYS.GEAR);
  rect(g, cx - 3 + b, 20, 2, 2, KEYS.GEAR);
  rect(g, cx + 1 + b, 20, 2, 2, KEYS.GEAR);

  // luci nav estremità ala
  set(g, cx - wingSpan - 1 + shift, wingY, KEYS.RED);
  set(g, cx + wingSpan + 1 + shift, wingY, KEYS.GREEN);

  return { rows: rowsOf(g), colors: COL };
}

// --- Aereo di lato (crociera), vista laterale -------------------------------

function buildSidePlane() {
  const W = 44;
  const H = 14;
  const g = grid(W, H);
  // fusoliera
  rect(g, 4, 4, 30, 6, KEYS.FUS);
  // prua
  line(g, 34, 4, 40, 5, KEYS.FUS);
  line(g, 34, 9, 40, 5, KEYS.FUS);
  // coda
  rect(g, 4, 2, 8, 8, KEYS.TAIL);
  set(g, 4, 1, KEYS.TAIL); set(g, 11, 1, KEYS.TAIL);
  // finestrini
  for (let c = 6; c <= 30; c += 3) set(g, c, 6, KEYS.WIN);
  for (let c = 7; c <= 31; c += 3) set(g, c, 7, KEYS.WIN);
  // ala
  rect(g, 10, 9, 24, 3, KEYS.WING);
  // motori sotto ala
  rect(g, 14, 11, 6, 3, KEYS.ENGINE);
  rect(g, 24, 11, 6, 3, KEYS.ENGINE);
  // carrello
  rect(g, 8, 12, 3, 2, KEYS.GEAR);
  rect(g, 30, 12, 3, 2, KEYS.GEAR);
  // luci nav
  set(g, 41, 5, KEYS.RED); set(g, 0, 5, KEYS.GREEN);

  return { rows: rowsOf(g), colors: COL };
}

// --- Nuvole -----------------------------------------------------------------

function buildCloud(w, h) {
  const g = grid(w, h);
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  const rx = Math.floor(w / 2.2);
  const ry = Math.floor(h / 2.2);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const dx = (c - cx) / rx;
      const dy = (r - cy) / ry;
      if (dx * dx + dy * dy <= 1) set(g, c, r, KEYS.CLOUD);
    }
  }
  // riflesso alto-sinistra
  for (let r = 1; r < Math.max(2, Math.floor(h / 2)); r++) {
    for (let c = 1; c < Math.max(2, Math.floor(w / 3)); c++) set(g, c, r, KEYS.CLOUD_SHADE);
  }
  return { rows: rowsOf(g), colors: COL };
}

const CLOUD_BIG = buildCloud(30, 9);
const CLOUD_MID = buildCloud(20, 7);
const CLOUD_FAR = buildCloud(14, 5);

const CLOUD_STORM = (() => {
  const g = grid(22, 7);
  rect(g, 2, 1, 18, 5, KEYS.STORM);
  for (let i = 0; i < 4; i++) line(g, 4 + i * 5, 6, 6 + i * 5, 0, KEYS.LIGHTNING);
  return { rows: rowsOf(g), colors: COL };
})();

// --- Ostacoli ---------------------------------------------------------------

const BIRD = (() => {
  const g = grid(6, 3);
  set(g, 2, 0, KEYS.BIRD); set(g, 3, 0, KEYS.BIRD); set(g, 4, 0, KEYS.BIRD);
  set(g, 0, 1, KEYS.BIRD); set(g, 5, 1, KEYS.BIRD);
  set(g, 1, 2, KEYS.BIRD); set(g, 2, 2, KEYS.BIRD); set(g, 3, 2, KEYS.BIRD); set(g, 4, 2, KEYS.BIRD);
  return { rows: rowsOf(g), colors: COL };
})();

const BIRD_FLOCK = (() => {
  const g = grid(14, 4);
  const pts = [[2,0],[4,0],[6,0],[0,1],[7,1],[13,1],[1,2],[3,2],[8,2],[12,2],[5,3],[7,3],[10,3]];
  for (const [x, y] of pts) set(g, x, y, KEYS.BIRD);
  return { rows: rowsOf(g), colors: COL };
})();

const FUEL_TANK = (() => {
  const g = grid(6, 4);
  rect(g, 1, 0, 4, 2, KEYS.FUEL);
  set(g, 1, 2, KEYS.FUEL); set(g, 4, 2, KEYS.FUEL);
  rect(g, 2, 3, 2, 1, KEYS.FUEL);
  set(g, 2, 1, KEYS.PLUS); set(g, 3, 1, KEYS.PLUS);
  return { rows: rowsOf(g), colors: COL };
})();

const WIND_GUST = (() => {
  const g = grid(8, 2);
  for (let c = 0; c < 8; c++) set(g, c, 0, KEYS.GUST);
  for (let c = 0; c < 6; c++) set(g, c, 1, KEYS.GUST);
  return { rows: rowsOf(g), colors: COL };
})();

// --- Montagna ---------------------------------------------------------------

function makeMountain(h) {
  const W = 13;
  const H = Math.max(4, h);
  const g = grid(W, H);
  const cx = Math.floor(W / 2);
  for (let r = 0; r < H; r++) {
    const half = Math.floor((H - 1 - r) * (W / 2) / Math.max(1, H - 1));
    for (let c = cx - half; c <= cx + half; c++) set(g, c, r, KEYS.MOUNTAIN);
  }
  const top = Math.floor(H * 0.25);
  for (let r = 0; r <= top; r++) {
    const half = Math.floor((top - r) * (W / 2) / Math.max(1, top));
    for (let c = cx - half; c <= cx + half; c++) set(g, c, r, KEYS.SNOW);
  }
  return { rows: rowsOf(g), colors: COL };
}

const MOUNTAINS = [5, 6, 7].map(makeMountain);

// --- Terreno (colori di riferimento) ----------------------------------------

const TERRAIN = {
  land: { surface: C.grass, deep: C.grassDark, feature: C.grassLight },
  sea: { surface: C.sea, deep: C.seaLight, feature: C.foam },
  desert: { surface: C.sand, deep: C.sandDark, feature: C.dirt },
  city: { surface: C.rock, deep: C.rockDark, feature: C.cloudFar },
  snow: { surface: C.snow, deep: C.cloudShade, feature: C.white },
};

const REAR_PLANE = { '-1': buildRearPlane(-1), 0: buildRearPlane(0), 1: buildRearPlane(1) };
const PLANE_SIDE = buildSidePlane();

// Eliche di prua: 4 fotogrammi animati (x = colonna, rows = righe celle).
// Allineate al muso della PLANE_SIDE (fusoliera righe 4–9, prua ~5).
const PROP_FRAMES = [
  { x: 41, rows: [4, 5, 6], ch: '|' },
  { x: 41, rows: [5], ch: '\\' },
  { x: 41, rows: [4, 5, 6], ch: '/' },
  { x: 41, rows: [5], ch: '-' },
];

// Compat chiavi usate da scene.js (colori di terreno come oggetti)
module.exports = {
  grid, set, rect, line, rowsOf,
  PLANE_SIDE,
  PROP_FRAMES,
  REAR_PLANE,
  CLOUD_BIG, CLOUD_MID, CLOUD_FAR, CLOUD_STORM,
  BIRD, BIRD_FLOCK, FUEL_TANK, WIND_GUST,
  MOUNTAINS, TERRAIN, COLORS: C,
  KEYS,
};
