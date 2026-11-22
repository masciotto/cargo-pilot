'use strict';

// Proiezione "gioco" per le scene con pista (decollo / atterraggio).
// Orizzonte a hz; dy = riga - hz (>= 1 sotto l'orizzonte).
// Un punto a distanza d metri con camera ad altezza h proietta a dy = FOCAL*h/d.
// Uno scostamento laterale m (metri) proietta a FOCAL_X*m*dy/(FOCAL*h) colonne.

const { COLORS } = require('./render');

const FOCAL = 120;
const FOCAL_X = 198;
const HALF_W = 18;
const GROUND_CAM_H = 6;

const dyAt = (d, h) => (FOCAL * h) / Math.max(1e-6, d);
const colsAt = (m, dy, h) => (FOCAL_X * m * dy) / (FOCAL * Math.max(1e-6, h));

const SKY_STEPS = [17, 18, 19, 20, 21, 27, 31, 35, 45];

function drawSky(f, hz) {
  for (let y = 0; y <= hz; y++) {
    const t = y / Math.max(1, hz);
    const c = SKY_STEPS[Math.min(SKY_STEPS.length - 1, Math.round(t * (SKY_STEPS.length - 1)))];
    f.fill(0, y, f.width, 1, ' ', 0, c);
  }
}

function drawGroundBase(f, hz, base) {
  for (let y = hz + 1; y < f.height; y++) f.fill(0, y, f.width, 1, ' ', 0, base);
}

// Profilo lontano sulla linea dell'orizzonte (hangar, torri, alberi).
function drawHorizonLine(f, hz, seed) {
  let s = seed || 7;
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  for (let x = 0; x < f.width; x++) {
    const r = rnd();
    if (r < 0.06) f.set(x, hz, '▄', 236, 0);
    else if (r < 0.09) f.set(x, hz, '█', 237, 0);
    else if (r < 0.1) f.set(x, hz, '▀', 238, 0);
    else if (r < 0.11) f.set(x, hz, '|', 240, 0);
    else if (r < 0.12) f.set(x, hz, '▀', 245, 0);
  }
}

function drawSkyDecor(f, hz) {
  // Sole nella parte alta a destra
  const sx = f.width - 12;
  const sy = 1;
  f.set(sx, sy, '\\', 228, 0);
  f.set(sx + 1, sy, 'O', 226, 0);
  f.set(sx + 2, sy, '/', 228, 0);
  f.set(sx + 1, sy - 1, '|', 228, 0);
  f.set(sx + 1, sy + 1, '|', 228, 0);
  f.set(sx, sy + 1, '/', 228, 0);
  f.set(sx + 2, sy + 1, '\\', 228, 0);
  f.set(sx - 1, sy, '·', 222, 0);
  f.set(sx + 3, sy, '·', 222, 0);
}

// Una pista: riempie la fascia [topRow, botRow] con asfalto, bordi e strisce.
// o = { hz, cx, x0, camH, topRow, botRow, traveled, dashOn, marker }
function drawRunwayBand(f, o) {
  const hz = o.hz;
  const top = Math.max(hz + 1, Math.ceil(o.topRow));
  const bot = Math.min(f.height - 1, Math.floor(o.botRow));
  const K = FOCAL * o.camH;
  const span = [];
  for (let y = top; y <= bot; y++) {
    const dy = y - hz;
    const half = colsAt(HALF_W, dy, o.camH);
    const cxr = o.cx - colsAt(o.x0, dy, o.camH);
    const l = Math.round(cxr - half);
    const r = Math.round(cxr + half);
    span.push({ y, l, r, dy });
    for (let x = Math.max(0, l); x <= Math.min(f.width - 1, r); x++) {
      f.set(x, y, ' ', 0, COLORS.runway);
    }
  }
  // strisce centrali + bordi
  const period = 70;
  const onLen = 38;
  for (const s of span) {
    const d = K / s.dy;
    const z = d + (o.traveled || 0);
    const cxr = o.cx - colsAt(o.x0, s.dy, o.camH);
    const half = colsAt(HALF_W, s.dy, o.camH);
    const l = Math.round(cxr - half);
    const r = Math.round(cxr + half);
    if (l >= 0 && l < f.width) f.set(l, s.y, '█', COLORS.edge, 0);
    if (r >= 0 && r < f.width) f.set(r, s.y, '█', COLORS.edge, 0);
    if (l - 1 >= 0) f.set(l - 1, s.y, '·', 246, 0);
    if (r + 1 < f.width) f.set(r + 1, s.y, '·', 246, 0);
    if ((z % period + period) % period < onLen) {
      const cc = Math.round(cxr);
      if (cc >= 1 && cc < f.width - 1) {
        f.set(cc - 1, s.y, '█', COLORS.center, 0);
        f.set(cc, s.y, '█', COLORS.center, 0);
        f.set(cc + 1, s.y, '█', COLORS.center, 0);
      }
    }
  }
  return span;
}

// Marcatore di fine pista (decollo / rullaggio): linea di luci sul segnale.
function drawEndMarker(f, o) {
  const row = Math.round(o.hz + o.dyEnd);
  if (row < o.hz + 1 || row > f.height - 1) return;
  const dy = row - o.hz;
  const half = colsAt(HALF_W, dy, o.camH);
  const cxr = o.cx - colsAt(o.x0, dy, o.camH);
  const l = Math.max(0, Math.round(cxr - half));
  const r = Math.min(f.width - 1, Math.round(cxr + half));
  const critical = !!o.critical;
  const flash = o.flash;
  for (let x = l; x <= r; x++) {
    const even = (x - l) % 2 === 0;
    if (critical) f.set(x, row, even ? '█' : '▄', flash ? 196 : 124, 0);
    else f.set(x, row, even ? '█' : '▄', even ? 255 : 203, 0);
  }
}

// Chiave di soglia (piano keys) subito dopo la soglia di atterraggio.
function drawThreshold(f, o) {
  const dNear = Math.max(4, o.d);
  const dFar = dNear + 34;
  const dyNear = dyAt(dNear, o.camH);
  const dyFar = dyAt(dFar, o.camH);
  const rowTop = Math.max(o.hz + 1, Math.ceil(o.hz + dyFar));
  const rowBot = Math.min(f.height - 1, Math.floor(o.hz + dyNear));
  for (let y = rowTop; y <= rowBot; y++) {
    const dy = y - o.hz;
    const half = colsAt(HALF_W, dy, o.camH);
    const cxr = o.cx - colsAt(o.x0, dy, o.camH);
    const l = Math.max(0, Math.round(cxr - half));
    const r = Math.min(f.width - 1, Math.round(cxr + half));
    const w = Math.max(1, r - l);
    for (let x = l; x <= r; x++) {
      const k = Math.floor(((x - l) / w) * 10);
      if (k % 2 === 0) f.set(x, y, '█', 255, 0);
    }
  }
}

// Sistema di avvicinamento: luci sulla prolungata, con "coniglio" animato.
function drawApproachLights(f, o) {
  const K = FOCAL * o.camH;
  for (let i = 0; i < 7; i++) {
    const d = o.d + 40 + i * 34;
    const dy = K / d;
    const row = Math.round(o.hz + dy);
    if (row < o.hz + 1 || row > f.height - 1) continue;
    const cxr = o.cx - colsAt(o.x0, dy, o.camH);
    const half = Math.max(1, Math.round(colsAt(14, dy, o.camH)));
    const active = ((o.rabbit || 0) % 7 + 7) % 7 === i;
    for (let k = -1; k <= 1; k++) {
      const x = Math.round(cxr) + k * Math.max(1, half);
      if (x < 0 || x >= f.width) continue;
      if (k === 0) f.set(x, row, '█', active ? 226 : 255, 0);
      else f.set(x, row, '█', active ? 226 : 253, 0);
    }
  }
}

// PAPI: 4 luci a sinistra della soglia, rosse se sotto il sentiero di 3°.
function drawPAPI(f, o) {
  const row = Math.round(o.hz + dyAt(Math.max(4, o.d), o.camH));
  if (row < o.hz + 1 || row > f.height - 1) return;
  const dy = row - o.hz;
  const cxr = o.cx - colsAt(o.x0, dy, o.camH);
  const angle = (Math.atan2(Math.max(0.01, o.alt), Math.max(1, o.d)) * 180) / Math.PI;
  const angles = [2.5, 2.83, 3.17, 3.5];
  for (let i = 0; i < 4; i++) {
    const x = Math.round(cxr - colsAt(HALF_W + 7 + i * 5, dy, o.camH));
    if (x < 0 || x >= f.width) continue;
    const white = angle > angles[i];
    f.set(x, row, '■', white ? 231 : 196, 0);
  }
}

// Indicatore di sentiero ideale ai margini della scena.
function drawGlideMark(f, hz, dyIdeal, color) {
  for (const x of [0, f.width - 1]) {
    const y = Math.round(hz + dyIdeal);
    if (y > hz && y < f.height) f.set(x, y, '▮', color, 0);
  }
}

// Vento: strie che attraversano il cielo nella direzione del vento.
function drawWindStreaks(f, hz, streaks, windDir) {
  for (const s of streaks) {
    const y = Math.round(s.y);
    if (y <= 0 || y > hz) continue;
    const x = Math.round(s.x);
    const len = s.len;
    for (let i = 0; i < len; i++) {
      const px = x + (windDir > 0 ? i : len - i);
      if (px >= 0 && px < f.width) f.set(px, y, '~', s.fg, 0);
    }
  }
}

module.exports = {
  FOCAL,
  FOCAL_X,
  HALF_W,
  GROUND_CAM_H,
  dyAt,
  colsAt,
  drawSky,
  drawSkyDecor,
  drawGroundBase,
  drawHorizonLine,
  drawRunwayBand,
  drawEndMarker,
  drawThreshold,
  drawApproachLights,
  drawPAPI,
  drawGlideMark,
  drawWindStreaks,
};
