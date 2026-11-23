'use strict';
// Anteprime sprite e scena: node tools/preview-sprites.js   (PLAIN=1 = senza colori)
const { Frame, COLORS } = require('../lib/render');
const { PixelCanvas, pack, ansiFg, ansiBg } = require('../lib/pixel');
const S = require('../lib/sprites');
const scene = require('../lib/scene');

const W = 150;
const H = 72;
const plain = process.env.PLAIN === '1';

const f = new Frame(W, H);

function label(t, y) {
  f.text(0, y, t, plain ? null : COLORS.yellow);
  return y + 1;
}

let y = 0;
y = label('PLANE_REAR bank -1 / 0 / +1', y); y += 1;
for (const b of [-1, 0, 1]) {
  const spr = S.REAR_PLANE[b];
  const pc = new PixelCanvas(spr.rows[0].length, spr.rows.length * 2);
  pc.clear(0, 0, 0);
  scene.drawSprite(pc, spr, 0, 0, {});
  const cells = pc.toHalfBlockCells();
  const x0 = 2 + (b + 1) * 48;
  for (let r = 0; r < cells.length; r++) {
    for (let c = 0; c < cells[r].length; c++) {
      const cell = cells[r][c];
      if (cell.ch === ' ') continue;
      let fg = null, bg = null;
      if (!plain) {
        if (cell.fg !== null) fg = cell.fg;
        if (cell.bg !== null) bg = cell.bg;
      }
      f.set(x0 + c, y + r, cell.ch, fg, bg);
    }
  }
}
y += sprRows(S.REAR_PLANE[0]) + 2;

y = label('PLANE_SIDE (crociera)', y); y += 1;
{
  const spr = S.PLANE_SIDE;
  const pc = new PixelCanvas(spr.rows[0].length, spr.rows.length * 2);
  pc.clear(0, 0, 0);
  scene.drawSprite(pc, spr, 0, 0, {});
  const cells = pc.toHalfBlockCells();
  for (let r = 0; r < cells.length; r++) {
    for (let c = 0; c < cells[r].length; c++) {
      const cell = cells[r][c];
      if (cell.ch === ' ') continue;
      let fg = null, bg = null;
      if (!plain) { if (cell.fg !== null) fg = cell.fg; if (cell.bg !== null) bg = cell.bg; }
      f.set(2 + c, y + r, cell.ch, fg, bg);
    }
  }
}
y += S.PLANE_SIDE.rows.length + 2;

y = label('CLOUDS big / mid / far / storm', y); y += 1;
const clouds = [S.CLOUD_BIG, S.CLOUD_MID, S.CLOUD_FAR, S.CLOUD_STORM];
let cx = 2;
for (const spr of clouds) {
  const pc = new PixelCanvas(spr.rows[0].length, spr.rows.length * 2);
  pc.clear(0, 0, 0);
  scene.drawSprite(pc, spr, 0, 0, {});
  const cells = pc.toHalfBlockCells();
  for (let r = 0; r < cells.length; r++) {
    for (let c = 0; c < cells[r].length; c++) {
      const cell = cells[r][c];
      if (cell.ch === ' ') continue;
      let fg = null, bg = null;
      if (!plain) { if (cell.fg !== null) fg = cell.fg; if (cell.bg !== null) bg = cell.bg; }
      f.set(cx + c, y + r, cell.ch, fg, bg);
    }
  }
  cx += spr.rows[0].length + 2;
}
y += Math.max(...clouds.map(s => s.rows.length)) + 2;

y = label('OBSTACLES bird / flock / tank / gust / chute', y); y += 1;
const obs = [S.BIRD, S.BIRD_FLOCK, S.FUEL_TANK, S.WIND_GUST, S.PARACHUTIST];
let ox = 2;
for (const spr of obs) {
  const pc = new PixelCanvas(spr.rows[0].length, spr.rows.length * 2);
  pc.clear(0, 0, 0);
  scene.drawSprite(pc, spr, 0, 0, {});
  const cells = pc.toHalfBlockCells();
  for (let r = 0; r < cells.length; r++) {
    for (let c = 0; c < cells[r].length; c++) {
      const cell = cells[r][c];
      if (cell.ch === ' ') continue;
      let fg = null, bg = null;
      if (!plain) { if (cell.fg !== null) fg = cell.fg; if (cell.bg !== null) bg = cell.bg; }
      f.set(ox + c, y + r, cell.ch, fg, bg);
    }
  }
  ox += spr.rows[0].length + 2;
}
y += Math.max(...obs.map((s) => s.rows.length)) + 2;

y = label('MOUNTAINS h=5,6,7', y); y += 1;
let mx = 2;
for (const m of S.MOUNTAINS) {
  const pc = new PixelCanvas(m.rows[0].length, m.rows.length * 2);
  pc.clear(0, 0, 0);
  scene.drawSprite(pc, m, 0, 0, {});
  const cells = pc.toHalfBlockCells();
  for (let r = 0; r < cells.length; r++) {
    for (let c = 0; c < cells[r].length; c++) {
      const cell = cells[r][c];
      if (cell.ch === ' ') continue;
      let fg = null, bg = null;
      if (!plain) { if (cell.fg !== null) fg = cell.fg; if (cell.bg !== null) bg = cell.bg; }
      f.set(mx + c, y + r, cell.ch, fg, bg);
    }
  }
  mx += m.rows[0].length + 2;
}

f.render();

function sprRows(spr) { return spr.rows.length; }
