'use strict';

// Sprite pixel-art per la scena di volo.
// Ogni sprite: { rows: string[], colors: {char: 0xRRGGBB}, fg, bg }.
// Disegnati su PixelCanvas con drawSpriteCells.
// Silhouette ispirate a side-scroller/classic flight (Luftrausers, OpenTTD):
// contorno leggibile, pochi pixel, niente "mattoni".

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
  STRIPE: 'S',
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
  [KEYS.WING]: C.planeShade,
  [KEYS.CLOUD]: 0xc8d8e8,
  [KEYS.CLOUD_SHADE]: 0x9ab0c8,
  [KEYS.STORM]: 0x3d3d44,
  [KEYS.LIGHTNING]: C.yellow,
  [KEYS.BIRD]: C.planeDark,
  [KEYS.FUEL]: C.green,
  [KEYS.PLUS]: C.white,
  [KEYS.GUST]: C.cyan,
  [KEYS.MOUNTAIN]: C.rock,
  [KEYS.SNOW]: C.snow,
  [KEYS.STRIPE]: C.accent,
};

// --- Aereo di dorso (decollo / atterraggio), vista da dietro ----------------
// Doppio turbofan, ali con diedro, coda a T. Leggibile anche a bank ±1.

function buildRearPlane(bank) {
  const W = 44;
  const H = 22;
  const g = grid(W, H);
  const b = Math.max(-1, Math.min(1, bank));
  const shift = b * 2;
  const cx = Math.floor(W / 2);

  // --- penna verticale (coda) ---
  // cima a H=1, base sul fusoliera ~H=8
  for (let r = 1; r <= 7; r++) {
    const half = r < 3 ? 1 : r < 5 ? 2 : 3;
    const lean = r > 4 ? Math.round(b * (r - 4) * 0.6) : 0;
    for (let c = cx - half; c <= cx + half; c++) {
      set(g, c + lean, r, r <= 2 ? KEYS.SHADE : KEYS.TAIL);
    }
  }
  // limo orizzontale su coda
  rect(g, cx - 5 + Math.round(b), 7, 11, 1, KEYS.WING);

  // --- fusoliera (dal naso basso al alto) ---
  // H=8..17, larghezza 7 → 9
  for (let r = 8; r <= 17; r++) {
    const half = r <= 10 ? 3 : r <= 14 ? 4 : r <= 16 ? 3 : 2;
    const lean = r > 14 ? Math.round(b * (r - 14) * 0.5) : 0;
    for (let c = cx - half; c <= cx + half; c++) {
      set(g, c + lean, r, r <= 11 ? KEYS.SHADE : KEYS.FUS);
    }
  }
  // abitacolo / abitacolo posteriore (finestrini dorso)
  set(g, cx - 1, 9, KEYS.WIN); set(g, cx, 9, KEYS.WIN);
  set(g, cx - 1, 10, KEYS.WIN); set(g, cx, 10, KEYS.WIN);

  // --- ali a diedro (vista da dietro: ali verso l'alto leggero) ---
  const wingY = 13;
  // spar principale
  for (let c = cx - 15; c <= cx + 15; c++) {
    const t = Math.abs(c - cx) / 15;
    const y = wingY - Math.round(t * 1.5); // diedro
    set(g, c + shift, y, KEYS.WING);
    if (t > 0.35) set(g, c + shift, y + 1, KEYS.SHADE);
  }
  // flap / aileron in sottovolo
  for (let c = cx - 12; c <= cx + 12; c++) {
    if (Math.abs(c - cx) > 4) set(g, c + shift, wingY + 2, KEYS.SHADE);
  }

  // --- motori (gondole sotto ali) ---
  // sinistro
  const engL = cx - 11 + shift;
  const engR = cx + 8 + shift;
  for (const ex of [engL, engR]) {
    rect(g, ex, wingY + 1, 4, 4, KEYS.ENGINE);
    // intake luminoso
    set(g, ex + 1, wingY + 1, KEYS.SHADE);
    set(g, ex + 2, wingY + 1, KEYS.SHADE);
    // ugello
    set(g, ex, wingY + 4, KEYS.DARK);
    set(g, ex + 1, wingY + 4, KEYS.DARK);
    set(g, ex + 2, wingY + 4, KEYS.DARK);
    set(g, ex + 3, wingY + 4, KEYS.DARK);
  }

  // --- luci nav estremità ala ---
  set(g, cx - 16 + shift, wingY - 1, KEYS.RED);
  set(g, cx + 16 + shift, wingY - 1, KEYS.GREEN);

  // --- carrello (solo se visibile: qui in decollo/atterraggio) ---
  // naso
  rect(g, cx - 1 + Math.round(b * 0.5), 18, 2, 3, KEYS.GEAR);
  set(g, cx - 1, 21, KEYS.DARK); set(g, cx, 21, KEYS.DARK);
  // principali
  for (const gx of [cx - 7 + shift, cx + 5 + shift]) {
    rect(g, gx, 17, 2, 3, KEYS.GEAR);
    set(g, gx, 20, KEYS.DARK); set(g, gx + 1, 20, KEYS.DARK);
    set(g, gx, 21, KEYS.DARK); set(g, gx + 1, 21, KEYS.DARK);
  }

  return { rows: rowsOf(g), colors: COL };
}

// --- Aereo di lato (crociera), vista laterale, muso a destra ---------------
// Silhouette da side-scroller: coda a T, fascia livrea, ala a freccia,
// due turbofan, carrello rientrato. ~40×12 celle — leggibile a font piccolo.

function buildSidePlane() {
  const W = 36;
  const H = 11;
  const g = grid(W, H);

  // --- penna verticale (coda a sinistra) ---
  // coda a T: penna inclinata + limo orizzontale
  for (let y = 0; y <= 4; y++) {
    const left = 6 - y;              // bordo anteriore
    const right = 9 + Math.floor(y / 2);
    for (let x = left; x <= right; x++) set(g, x, y, y === 0 ? KEYS.SHADE : KEYS.TAIL);
  }
  for (let x = 1; x <= 11; x++) set(g, x, 4, KEYS.WING);
  set(g, 0, 4, KEYS.SHADE);

  // --- cono di coda + fusoliera ---
  for (let x = 0; x <= 5; x++) set(g, x, 5, KEYS.SHADE);
  for (let x = 2; x <= 7; x++) set(g, x, 6, KEYS.FUS);
  // corpo y=5..7
  for (let x = 6; x <= 27; x++) {
    set(g, x, 5, KEYS.SHADE);
    set(g, x, 6, KEYS.FUS);
    set(g, x, 7, KEYS.FUS);
  }
  for (let x = 5; x <= 28; x++) set(g, x, 7, KEYS.STRIPE);

  // --- muso ---
  for (let x = 28; x <= 31; x++) set(g, x, 5, KEYS.SHADE);
  for (let x = 28; x <= 33; x++) set(g, x, 6, KEYS.FUS);
  for (let x = 29; x <= 32; x++) set(g, x, 7, KEYS.STRIPE);
  set(g, 34, 6, KEYS.SHADE);
  set(g, 33, 5, KEYS.DARK); // cockpit

  // --- finestrini ---
  for (let x = 8; x <= 26; x += 2) set(g, x, 6, KEYS.WIN);

  // --- ala a freccia ---
  for (let x = 12; x <= 26; x++) {
    const t = (x - 12) / 14;
    const y = 8 + (t > 0.5 ? 1 : 0);
    set(g, x, y, KEYS.WING);
    if (x < 22) set(g, x, y + 1, KEYS.SHADE);
  }
  for (let x = 11; x <= 17; x++) set(g, x, 8, KEYS.SHADE);

  // --- motori ---
  rect(g, 14, 9, 5, 2, KEYS.ENGINE);
  rect(g, 21, 9, 4, 2, KEYS.ENGINE);
  set(g, 18, 9, KEYS.SHADE); set(g, 18, 10, KEYS.SHADE);
  set(g, 24, 9, KEYS.SHADE); set(g, 24, 10, KEYS.SHADE);
  set(g, 14, 9, KEYS.DARK); set(g, 14, 10, KEYS.DARK);
  set(g, 21, 9, KEYS.DARK); set(g, 21, 10, KEYS.DARK);

  // --- luci nav ---
  set(g, 35, 6, KEYS.RED);
  set(g, 26, 9, KEYS.GREEN);
  set(g, 0, 4, KEYS.GREEN);

  // --- carrello rientrato ---
  set(g, 13, 8, KEYS.DARK);
  set(g, 18, 8, KEYS.DARK);

  return { rows: rowsOf(g), colors: COL };
}

// --- Nuvole -----------------------------------------------------------------

function buildCloud(w, h) {
  const g = grid(w, h);
  // cumulo a "broccoli": più lobi, non un uovo pieno
  const lobes = [];
  const n = Math.max(3, Math.floor(w / 6));
  for (let i = 0; i < n; i++) {
    lobes.push({
      x: Math.floor((i + 0.5) * (w / n)) + (i % 2 === 0 ? -1 : 1),
      y: Math.floor(h / 2) + (i % 2 === 0 ? 0 : 1),
      r: Math.max(2, Math.floor(h / 2) - (i % 3 === 0 ? 1 : 0)),
    });
  }
  for (const L of lobes) {
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const dx = c - L.x;
        const dy = (r - L.y) * 1.3;
        if (dx * dx + dy * dy <= L.r * L.r) set(g, c, r, KEYS.CLOUD);
      }
    }
  }
  // base piatta + ombra
  for (let c = 0; c < w; c++) {
    if (g[h - 1][c] !== ' ') g[h - 1][c] = KEYS.CLOUD_SHADE;
    if (h > 2 && g[h - 2][c] !== ' ' && Math.random() < 0.5) g[h - 2][c] = KEYS.CLOUD_SHADE;
  }
  // riflesso alto-sinistra
  for (let r = 0; r < Math.max(1, Math.floor(h / 3)); r++) {
    for (let c = 1; c < Math.max(2, Math.floor(w / 4)); c++) {
      if (g[r][c] !== ' ') g[r][c] = KEYS.CLOUD_SHADE;
    }
  }
  return { rows: rowsOf(g), colors: COL };
}

const CLOUD_BIG = buildCloud(28, 8);
const CLOUD_MID = buildCloud(18, 6);
const CLOUD_FAR = buildCloud(12, 4);

const CLOUD_STORM = (() => {
  const g = grid(20, 7);
  // cumulo scuro a lobi
  const lobes = [[4, 3, 4], [10, 2, 5], [15, 3, 4], [8, 4, 4]];
  for (const [x, y, r] of lobes) {
    for (let yy = 0; yy < 7; yy++) {
      for (let xx = 0; xx < 20; xx++) {
        const dx = xx - x, dy = (yy - y) * 1.2;
        if (dx * dx + dy * dy <= r * r) set(g, xx, yy, KEYS.STORM);
      }
    }
  }
  // fulmini discreti
  set(g, 6, 5, KEYS.LIGHTNING);
  set(g, 7, 6, KEYS.LIGHTNING);
  set(g, 13, 5, KEYS.LIGHTNING);
  return { rows: rowsOf(g), colors: COL };
})();

// --- Ostacoli ---------------------------------------------------------------

const BIRD = (() => {
  // storno: "m" volanti, leggibile
  const g = grid(7, 3);
  set(g, 2, 0, KEYS.BIRD); set(g, 3, 0, KEYS.BIRD); set(g, 4, 0, KEYS.BIRD);
  set(g, 1, 1, KEYS.BIRD); set(g, 5, 1, KEYS.BIRD);
  set(g, 0, 1, KEYS.BIRD); set(g, 6, 1, KEYS.BIRD);
  set(g, 2, 2, KEYS.BIRD); set(g, 3, 2, KEYS.BIRD); set(g, 4, 2, KEYS.BIRD);
  return { rows: rowsOf(g), colors: COL };
})();

const BIRD_FLOCK = (() => {
  const g = grid(16, 5);
  // stormo a V parziale
  const pts = [
    [3, 0], [5, 1], [1, 1], [7, 2], [0, 2], [9, 1], [12, 0],
    [14, 2], [11, 3], [6, 3], [4, 4], [8, 4],
  ];
  for (const [x, y] of pts) {
    set(g, x, y, KEYS.BIRD);
    set(g, x + 1, y, KEYS.BIRD);
  }
  return { rows: rowsOf(g), colors: COL };
})();

const FUEL_TANK = (() => {
  // tanica aeronautica con croce
  const g = grid(6, 5);
  rect(g, 1, 0, 4, 3, KEYS.FUEL);
  rect(g, 2, 3, 2, 1, KEYS.FUS);
  set(g, 0, 1, KEYS.FUS); set(g, 5, 1, KEYS.FUS);
  // plus
  set(g, 2, 1, KEYS.PLUS); set(g, 3, 1, KEYS.PLUS);
  set(g, 2, 0, KEYS.PLUS); set(g, 2, 2, KEYS.PLUS); set(g, 3, 2, KEYS.PLUS);
  set(g, 2, 1, KEYS.PLUS); set(g, 3, 1, KEYS.PLUS);
  // riscrivi plus centrale bianca
  set(g, 2, 1, KEYS.PLUS); set(g, 3, 1, KEYS.PLUS);
  set(g, 2, 0, KEYS.FUEL); set(g, 3, 0, KEYS.FUEL);
  set(g, 2, 2, KEYS.FUEL); set(g, 3, 2, KEYS.FUEL);
  set(g, 2, 1, KEYS.PLUS); set(g, 3, 1, KEYS.PLUS);
  return { rows: rowsOf(g), colors: COL };
})();

const WIND_GUST = (() => {
  const g = grid(9, 3);
  // raffica a "S" con punte
  for (let c = 0; c < 7; c++) set(g, c, 0, KEYS.GUST);
  set(g, 8, 0, KEYS.GUST);
  for (let c = 2; c < 9; c++) set(g, c, 1, KEYS.GUST);
  for (let c = 0; c < 6; c++) set(g, c, 2, KEYS.GUST);
  return { rows: rowsOf(g), colors: COL };
})();

// --- Montagna ---------------------------------------------------------------

function makeMountain(h) {
  const W = 15;
  const H = Math.max(5, h);
  const g = grid(W, H);
  const cx = Math.floor(W / 2);
  // profilo a doppia cresta
  for (let r = 0; r < H; r++) {
    const t = r / Math.max(1, H - 1);
    const half = Math.floor((1 - t) * (W / 2 - 0.5));
    const peak = r < H * 0.4 ? 1 : 0;
    for (let c = cx - half; c <= cx + half; c++) {
      set(g, c, r, KEYS.MOUNTAIN);
    }
    if (peak && half > 1) {
      // cresta irregolare
      if (r % 2 === 0) set(g, cx - half, r, ' ');
      else set(g, cx + half, r, ' ');
    }
  }
  // neve sulla cima
  const top = Math.max(1, Math.floor(H * 0.28));
  for (let r = 0; r < top; r++) {
    const half = Math.floor((top - r) * (W / 2) / Math.max(1, top));
    for (let c = cx - half; c <= cx + half; c++) set(g, c, r, KEYS.SNOW);
  }
  // ombra lato destro
  for (let r = Math.floor(H * 0.3); r < H; r++) {
    const t = r / Math.max(1, H - 1);
    const half = Math.floor((1 - t) * (W / 2 - 0.5));
    const x = cx + Math.max(0, half - 1);
    if (x < W) set(g, x, r, KEYS.DARK);
  }
  return { rows: rowsOf(g), colors: COL };
}

const MOUNTAINS = [5, 6, 7, 8].map(makeMountain);

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

// Eliche / scia di prua: 4 fotogrammi. Allineate al muso PLANE_SIDE (x≈34).
const PROP_FRAMES = [
  { x: 34, rows: [5, 6, 7], ch: '|' },
  { x: 34, rows: [6], ch: '\\' },
  { x: 34, rows: [5, 6, 7], ch: '/' },
  { x: 34, rows: [6], ch: '-' },
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
