'use strict';

// PixelCanvas: buffer pixel (RGB) per la scena di volo.
// L'output finale si codifica in caratteri half-block "▀" con truecolor:
// ogni cella del terminale = 2 pixel verticali, fg = pixel sopra, bg = pixel sotto.

const H_FULL_BLOCK = '█';
const H_UPPER = '▀';
const H_LOWER = '▄';
const H_BOTH = '█';

function pack(r, g, b) {
  return (r << 16) | (g << 8) | b;
}

function unpack(c) {
  return { r: (c >> 16) & 0xff, g: (c >> 8) & 0xff, b: c & 0xff };
}

function ansiFg(c) {
  const { r, g, b } = unpack(c);
  return '\x1b[38;2;' + r + ';' + g + ';' + b + 'm';
}
function ansiBg(c) {
  const { r, g, b } = unpack(c);
  return '\x1b[48;2;' + r + ';' + g + ';' + b + 'm';
}

class PixelCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.buf = new Uint8Array(width * height * 3);
    this.bg = pack(0, 0, 0);
  }

  clear(r, g, b) {
    const p = pack(r, g, b);
    const n = this.width * this.height;
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      this.buf[o] = r;
      this.buf[o + 1] = g;
      this.buf[o + 2] = b;
    }
    this.bg = p;
  }

  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  set(x, y, r, g, b) {
    if (!this.inside(x, y)) return;
    const o = (y * this.width + x) * 3;
    this.buf[o] = r;
    this.buf[o + 1] = g;
    this.buf[o + 2] = b;
  }

  fillRect(x, y, w, h, r, g, b) {
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(this.width, x + w);
    const y1 = Math.min(this.height, y + h);
    for (let yy = y0; yy < y1; yy++) {
      const base = (yy * this.width + x0) * 3;
      for (let xx = x0; xx < x1; xx++) {
        const o = base + (xx - x0) * 3;
        this.buf[o] = r;
        this.buf[o + 1] = g;
        this.buf[o + 2] = b;
      }
    }
  }

  blend(x, y, r, g, b, a) {
    // a in [0,1] miscela col pixel esistente
    if (!this.inside(x, y)) return;
    const o = (y * this.width + x) * 3;
    const pr = this.buf[o];
    const pg = this.buf[o + 1];
    const pb = this.buf[o + 2];
    this.buf[o] = pr + Math.round((r - pr) * a);
    this.buf[o + 1] = pg + Math.round((g - pg) * a);
    this.buf[o + 2] = pb + Math.round((b - pb) * a);
  }

  get(x, y) {
    if (!this.inside(x, y)) return pack(0, 0, 0);
    const o = (y * this.width + x) * 3;
    return pack(this.buf[o], this.buf[o + 1], this.buf[o + 2]);
  }

  // Disegna uno sprite definito come griglia di caratteri e mappa colore.
  drawSpriteCells(spr, x0, y0, tint) {
    for (let yy = 0; yy < spr.rows.length; yy++) {
      const row = spr.rows[yy];
      for (let xx = 0; xx < row.length; xx++) {
        const ch = row[xx];
        if (ch === ' ') continue;
        let c = spr.colors && spr.colors[ch] !== undefined ? spr.colors[ch] : spr.fg;
        if (tint) c = blendColor(c, tint);
        this.set(x0 + xx, y0 + yy, c >> 16, (c >> 8) & 0xff, c & 0xff);
      }
    }
  }

  // Encoder half-block: restituisce array di celle {ch:'▀', fg, bg}.
  toHalfBlockCells() {
    const cells = [];
    for (let yy = 0; yy < this.height; yy += 2) {
      const row = [];
      for (let xx = 0; xx < this.width; xx++) {
        const oTop = (yy * this.width + xx) * 3;
        const oBot = (((yy + 1) * this.width + xx) * 3);
        let ct = pack(this.buf[oTop], this.buf[oTop + 1], this.buf[oTop + 2]);
        let cb = pack(this.buf[oBot], this.buf[oBot + 1], this.buf[oBot + 2]);
        if (ct === cb && ct === this.bg) {
          row.push({ ch: ' ', fg: null, bg: null });
        } else if (ct === cb) {
          row.push({ ch: H_FULL_BLOCK, fg: null, bg: ct });
        } else if (ct === this.bg) {
          row.push({ ch: H_LOWER, fg: null, bg: cb });
        } else if (cb === this.bg) {
          row.push({ ch: H_UPPER, fg: ct, bg: null });
        } else {
          row.push({ ch: H_UPPER, fg: ct, bg: cb });
        }
      }
      cells.push(row);
    }
    return cells;
  }
}

function blendColor(c, tint) {
  const { r, g, b } = unpack(c);
  const tr = tint >> 16;
  const tg = (tint >> 8) & 0xff;
  const tb = tint & 0xff;
  return pack(Math.min(255, r + tr - 128), Math.min(255, g + tg - 128), Math.min(255, b + tb - 128));
}

function gradRow(y, h, top, bot) {
  const t = y / Math.max(1, h - 1);
  return pack(
    Math.round(top.r + (bot.r - top.r) * t),
    Math.round(top.g + (bot.g - top.g) * t),
    Math.round(top.b + (bot.b - top.b) * t)
  );
}

module.exports = { PixelCanvas, pack, unpack, ansiFg, ansiBg, H_UPPER, H_LOWER, H_FULL_BLOCK, H_BOTH, gradRow, blendColor };
