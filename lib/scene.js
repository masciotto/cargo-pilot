'use strict';

// Proiezione scena di volo su PixelCanvas (half-block).
// Ogni cella del terminale = 2 pixel verticali (riga cella y -> pixel 2y, 2y+1).
// Orizzonte a hz (riga cella); dy = rigaCella - hz (>=1 sotto l'orizzonte).
// Punto a distanza d metri, camera ad altezza h: dy = FOCAL*h/d.
// Scostamento laterale m (metri): colonne = FOCAL_X*m*dy/(FOCAL*h).

const { PixelCanvas, pack, blendColor } = require('./pixel');
const { COLORS } = require('./render');
const S = require('./sprites');

const FOCAL = 120;
const FOCAL_X = 198;
const HALF_W = 18;
const GROUND_CAM_H = 6;

const dyAt = (d, h) => (FOCAL * h) / Math.max(1e-6, d);
const colsAt = (m, dy, h) => (FOCAL_X * m * dy) / (FOCAL * Math.max(1e-6, h));
const cellHeight = (canvas) => Math.floor(canvas.height / 2);

const SKY_TOP = pack(9, 13, 23);
const SKY_HORIZON = pack(58, 134, 255);

function interp(a, b, t) {
  return pack(
    Math.round(((a >> 16) & 0xff) + (((b >> 16) & 0xff) - ((a >> 16) & 0xff)) * t),
    Math.round(((a >> 8) & 0xff) + (((b >> 8) & 0xff) - ((a >> 8) & 0xff)) * t),
    Math.round((a & 0xff) + ((b & 0xff) - (a & 0xff)) * t)
  );
}

function colorParts(c) {
  return { r: (c >> 16) & 0xff, g: (c >> 8) & 0xff, b: c & 0xff };
}

function fillRow(canvas, yCell, x0, x1, color) {
  const p = colorParts(color);
  canvas.fillRect(Math.max(0, x0), yCell * 2, Math.max(0, x1 - x0 + 1), 2, p.r, p.g, p.b);
}

function setPix(canvas, x, yCell, color) {
  const p = colorParts(color);
  canvas.set(x, yCell * 2, p.r, p.g, p.b);
  canvas.set(x, yCell * 2 + 1, p.r, p.g, p.b);
}

function fillBand(canvas, yCell, hCells, color) {
  const p = colorParts(color);
  canvas.fillRect(0, yCell * 2, canvas.width, hCells * 2, p.r, p.g, p.b);
}

function drawSky(canvas, hz) {
  const hPix = hz * 2;
  for (let py = 0; py <= hPix; py++) {
    const c = interp(SKY_TOP, SKY_HORIZON, py / Math.max(1, hPix));
    const p = colorParts(c);
    canvas.fillRect(0, py, canvas.width, 1, p.r, p.g, p.b);
  }
  // sole alto a destra
  const sx = canvas.width - 14;
  const sy = 2;
  const sun = pack(255, 210, 60);
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const d2 = dx * dx + dy * dy;
      const cc = d2 <= 2 ? sun : d2 <= 6 ? pack(255, 180, 40) : null;
      if (cc) canvas.set(sx + dx, sy + dy, cc >> 16, (cc >> 8) & 0xff, cc & 0xff);
    }
  }
  canvas.set(sx, sy - 1, 255, 200, 30);
  canvas.set(sx, sy + 1, 255, 200, 30);
  canvas.set(sx - 1, sy, 255, 200, 30);
  canvas.set(sx + 1, sy, 255, 200, 30);
}

function drawGround(canvas, hz, color) {
  const p = colorParts(color);
  canvas.fillRect(0, hz * 2 + 2, canvas.width, canvas.height - (hz * 2 + 2), p.r, p.g, p.b);
  // leggera sfumatura verso il basso per profondità
  const hTotal = cellHeight(canvas);
  for (let py = hz * 2 + 2; py < canvas.height; py++) {
    const t = (py - hz * 2 - 2) / Math.max(1, canvas.height - hz * 2 - 2);
    const cc = interp(color, pack(0, 0, 0), t * 0.35);
    const pp = colorParts(cc);
    canvas.fillRect(0, py, canvas.width, 1, pp.r, pp.g, pp.b);
  }
}

function drawHorizonLine(canvas, hz, seed) {
  let s = seed || 7;
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const row = hz * 2 + 1;
  for (let x = 0; x < canvas.width; x++) {
    const r = rnd();
    if (r < 0.05) canvas.set(x, row, COLORS.runway >> 16, (COLORS.runway >> 8) & 0xff, COLORS.runway & 0xff);
    else if (r < 0.08) canvas.set(x, row, COLORS.runwayLight >> 16, (COLORS.runwayLight >> 8) & 0xff, COLORS.runwayLight & 0xff);
    else if (r < 0.10) canvas.set(x, row, COLORS.edge >> 16, (COLORS.edge >> 8) & 0xff, COLORS.edge & 0xff);
    else if (r < 0.115) canvas.set(x, row, COLORS.dirt >> 16, (COLORS.dirt >> 8) & 0xff, COLORS.dirt & 0xff);
  }
}

function drawRunwayBand(canvas, o) {
  const hz = o.hz;
  const top = Math.max(hz + 1, Math.ceil(o.topRow));
  const bot = Math.min(cellHeight(canvas) - 1, Math.floor(o.botRow));
  const K = FOCAL * o.camH;
  for (let y = top; y <= bot; y++) {
    const dy = y - hz;
    const half = colsAt(HALF_W, dy, o.camH);
    const cxr = o.cx - colsAt(o.x0, dy, o.camH);
    const l = Math.round(cxr - half);
    const r = Math.round(cxr + half);
    const x0 = Math.max(0, l);
    const x1 = Math.min(canvas.width - 1, r);
    if (x1 < x0) continue;
    // asfalto
    fillRow(canvas, y, x0, x1, COLORS.runway);
    // bordi
    if (l >= 0 && l < canvas.width) canvas.set(l, y * 2, COLORS.edge >> 16, (COLORS.edge >> 8) & 0xff, COLORS.edge & 0xff);
    if (l >= 0 && l < canvas.width) canvas.set(l, y * 2 + 1, COLORS.edge >> 16, (COLORS.edge >> 8) & 0xff, COLORS.edge & 0xff);
    if (r >= 0 && r < canvas.width) canvas.set(r, y * 2, COLORS.edge >> 16, (COLORS.edge >> 8) & 0xff, COLORS.edge & 0xff);
    if (r >= 0 && r < canvas.width) canvas.set(r, y * 2 + 1, COLORS.edge >> 16, (COLORS.edge >> 8) & 0xff, COLORS.edge & 0xff);
    // strisce centrolinea (tratteggiate, lunghezza scalata con distanza)
    const d = K / Math.max(1, dy);
    const z = d + (o.traveled || 0);
    const period = 70;
    const onLen = 38;
    if ((z % period + period) % period < onLen) {
      const cc = Math.round(cxr);
      if (cc >= 1 && cc < canvas.width - 1) {
        canvas.set(cc - 1, y * 2, COLORS.center >> 16, (COLORS.center >> 8) & 0xff, COLORS.center & 0xff);
        canvas.set(cc, y * 2, COLORS.center >> 16, (COLORS.center >> 8) & 0xff, COLORS.center & 0xff);
        canvas.set(cc + 1, y * 2, COLORS.center >> 16, (COLORS.center >> 8) & 0xff, COLORS.center & 0xff);
        canvas.set(cc, y * 2 + 1, COLORS.center >> 16, (COLORS.center >> 8) & 0xff, COLORS.center & 0xff);
      }
    }
  }
  return { top, bot };
}

function drawEndMarker(canvas, o) {
  const row = Math.round(o.hz + o.dyEnd);
  const hMax = cellHeight(canvas);
  if (row < o.hz + 1 || row > hMax - 1) return;
  const dy = row - o.hz;
  const half = colsAt(HALF_W, dy, o.camH);
  const cxr = o.cx - colsAt(o.x0, dy, o.camH);
  const l = Math.max(0, Math.round(cxr - half));
  const r = Math.min(canvas.width - 1, Math.round(cxr + half));
  const critical = !!o.critical;
  const flash = o.flash;
  for (let x = l; x <= r; x++) {
    const even = (x - l) % 2 === 0;
    let c;
    if (critical) c = flash ? COLORS.papiRed : COLORS.redDim;
    else c = even ? COLORS.white : COLORS.amber;
    const p = colorParts(c);
    canvas.set(x, row * 2, p.r, p.g, p.b);
    canvas.set(x, row * 2 + 1, p.r, p.g, p.b);
  }
}

function drawThreshold(canvas, o) {
  const dNear = Math.max(4, o.d);
  const dFar = dNear + 34;
  const dyNear = dyAt(dNear, o.camH);
  const dyFar = dyAt(dFar, o.camH);
  const rowTop = Math.max(o.hz + 1, Math.ceil(o.hz + dyFar));
  const rowBot = Math.min(cellHeight(canvas) - 1, Math.floor(o.hz + dyNear));
  for (let y = rowTop; y <= rowBot; y++) {
    const dy = y - o.hz;
    const half = colsAt(HALF_W, dy, o.camH);
    const cxr = o.cx - colsAt(o.x0, dy, o.camH);
    const l = Math.max(0, Math.round(cxr - half));
    const r = Math.min(canvas.width - 1, Math.round(cxr + half));
    const w = Math.max(1, r - l);
    for (let x = l; x <= r; x++) {
      const k = Math.floor(((x - l) / w) * 10);
      if (k % 2 === 0) {
        canvas.set(x, y * 2, COLORS.center >> 16, (COLORS.center >> 8) & 0xff, COLORS.center & 0xff);
        canvas.set(x, y * 2 + 1, COLORS.center >> 16, (COLORS.center >> 8) & 0xff, COLORS.center & 0xff);
      }
    }
  }
}

function drawApproachLights(canvas, o) {
  const K = FOCAL * o.camH;
  for (let i = 0; i < 7; i++) {
    const d = o.d + 40 + i * 34;
    const dy = K / d;
    const row = Math.round(o.hz + dy);
    const hMax = cellHeight(canvas);
    if (row < o.hz + 1 || row > hMax - 1) continue;
    const cxr = o.cx - colsAt(o.x0, dy, o.camH);
    const half = Math.max(1, Math.round(colsAt(14, dy, o.camH)));
    const active = ((o.rabbit || 0) % 7 + 7) % 7 === i;
    const c = active ? COLORS.yellow : COLORS.white;
    const p = colorParts(c);
    for (let k = -1; k <= 1; k++) {
      const x = Math.round(cxr) + k * Math.max(1, half);
      if (x < 0 || x >= canvas.width) continue;
      canvas.set(x, row * 2, p.r, p.g, p.b);
      canvas.set(x, row * 2 + 1, p.r, p.g, p.b);
    }
  }
}

function drawPAPI(canvas, o) {
  const row = Math.round(o.hz + dyAt(Math.max(4, o.d), o.camH));
  const hMax = cellHeight(canvas);
  if (row < o.hz + 1 || row > hMax - 1) return;
  const dy = row - o.hz;
  const cxr = o.cx - colsAt(o.x0, dy, o.camH);
  const angle = (Math.atan2(Math.max(0.01, o.alt), Math.max(1, o.d)) * 180) / Math.PI;
  const angles = [2.5, 2.83, 3.17, 3.5];
  for (let i = 0; i < 4; i++) {
    const x = Math.round(cxr - colsAt(HALF_W + 7 + i * 5, dy, o.camH));
    if (x < 0 || x >= canvas.width) continue;
    const white = angle > angles[i];
    const c = white ? COLORS.papiWhite : COLORS.papiRed;
    const p = colorParts(c);
    canvas.set(x, row * 2, p.r, p.g, p.b);
    canvas.set(x, row * 2 + 1, p.r, p.g, p.b);
    canvas.set(x + 1, row * 2, p.r, p.g, p.b);
    canvas.set(x + 1, row * 2 + 1, p.r, p.g, p.b);
  }
}

function drawGlideMark(canvas, hz, dyIdeal, color) {
  const row = Math.round(hz + dyIdeal);
  const hMax = cellHeight(canvas);
  if (row <= hz || row >= hMax) return;
  const p = colorParts(color);
  for (const x of [0, canvas.width - 1]) {
    canvas.set(x, row * 2, p.r, p.g, p.b);
    canvas.set(x, row * 2 + 1, p.r, p.g, p.b);
  }
}

function drawWindStreaks(canvas, hz, streaks, windDir) {
  for (const s of streaks) {
    const y = Math.round(s.y);
    if (y <= 0 || y > hz) continue;
    const x = Math.round(s.x);
    const len = s.len;
    const p = colorParts(s.fg);
    for (let i = 0; i < len; i++) {
      const px = x + (windDir > 0 ? i : len - i);
      if (px >= 0 && px < canvas.width) canvas.set(px, y * 2, p.r, p.g, p.b);
    }
  }
}

// Disegna uno sprite sul canvas: (x0, y0) in celle, ogni riga sprite = 1 cella
// (2 pixel verticali), così collisioni e maschere restano in coordinate celle.
function drawSprite(canvas, spr, x0, y0, opts) {
  const o = opts || {};
  const flip = !!o.flip;
  for (let r = 0; r < spr.rows.length; r++) {
    const line = spr.rows[r];
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === ' ') continue;
      let col = spr.colors && spr.colors[ch] !== undefined ? spr.colors[ch] : spr.fg;
      if (col === undefined) continue;
      if (o.tint !== undefined) col = blendColor(col, o.tint);
      const sx = flip ? x0 + (line.length - 1 - c) : x0 + c;
      const p = colorParts(col);
      canvas.set(sx, (y0 + r) * 2, p.r, p.g, p.b);
      canvas.set(sx, (y0 + r) * 2 + 1, p.r, p.g, p.b);
    }
  }
}

module.exports = {
  FOCAL, FOCAL_X, HALF_W, GROUND_CAM_H, dyAt, colsAt,
  drawSky, drawGround, drawHorizonLine, drawRunwayBand, drawEndMarker,
  drawThreshold, drawApproachLights, drawPAPI, drawGlideMark, drawWindStreaks,
  drawSprite, setPix, fillBand, cellHeight, pack, interp, colorParts,
};
