'use strict';

// Frame buffer a celle (char + fg + bg) con output ANSI 256 colori.
// I colori sono numeri 0-255: 0 = colore predefinito del terminale.

const fgCode = (n) => (n ? '\x1b[38;5;' + n + 'm' : '');
const bgCode = (n) => (n ? '\x1b[48;5;' + n + 'm' : '');

// Copia una scena (o sottoframe) dentro un frame, a partire da (x, y).
function blit(dst, src, x, y) {
  for (let r = 0; r < src.height; r++) {
    const dy = y + r;
    if (dy < 0 || dy >= dst.height) continue;
    for (let c = 0; c < src.width; c++) {
      const dx = x + c;
      if (dx < 0 || dx >= dst.width) continue;
      const si = r * src.width + c;
      const di = dy * dst.width + dx;
      dst.ch[di] = src.ch[si];
      dst.fg[di] = src.fg[si];
      dst.bg[di] = src.bg[si];
    }
  }
}

class Frame {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.ch = new Array(width * height).fill(' ');
    this.fg = new Array(width * height).fill(0);
    this.bg = new Array(width * height).fill(0);
  }

  clear(bg) {
    this.ch.fill(' ');
    this.fg.fill(0);
    this.bg.fill(bg || 0);
  }

  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  set(x, y, ch, fg, bg) {
    if (!this.inside(x, y)) return;
    const i = y * this.width + x;
    this.ch[i] = ch;
    if (fg !== undefined) this.fg[i] = fg;
    if (bg !== undefined) this.bg[i] = bg;
  }

  text(x, y, str, fg, bg) {
    for (let k = 0; k < str.length; k++) this.set(x + k, y, str[k], fg, bg);
  }

  fill(x, y, w, h, ch, fg, bg) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) this.set(x + i, y + j, ch, fg, bg);
    }
  }

  hline(y, x0, x1, ch, fg, bg) {
    for (let x = x0; x <= x1; x++) this.set(x, y, ch, fg, bg);
  }

  toString() {
    let out = '';
    for (let y = 0; y < this.height; y++) {
      let cf = -1;
      let cb = -1;
      for (let x = 0; x < this.width; x++) {
        const i = y * this.width + x;
        const f = this.fg[i];
        const b = this.bg[i];
        if (f !== cf || b !== cb) {
          out += '\x1b[0m' + fgCode(f) + bgCode(b);
          cf = f;
          cb = b;
        }
        out += this.ch[i];
      }
      out += '\x1b[0m';
      if (y < this.height - 1) out += '\n';
    }
    return out;
  }

  render() {
    const lines = this.toString().split('\n');
    let out = '\x1b[H';
    for (let y = 0; y < lines.length; y++) {
      out += '\x1b[2K' + lines[y];
      if (y < lines.length - 1) out += '\r\n';
    }
    process.stdout.write(out);
  }
}

const COLORS = {
  white: 231,
  bright: 255,
  dim: 245,
  dimmer: 240,
  text: 252,
  cyan: 51,
  cyanDim: 44,
  green: 46,
  greenDim: 34,
  yellow: 226,
  amber: 214,
  orange: 208,
  red: 196,
  redDim: 124,
  magenta: 201,
  blue: 39,
  skyTop: 17,
  skyHigh: 18,
  skyMid: 24,
  skyLow: 31,
  skyHorizon: 37,
  cloud: 255,
  cloudShade: 246,
  cloudFar: 244,
  sea: 17,
  seaLight: 24,
  foam: 51,
  grass: 28,
  grassDark: 22,
  grassLight: 34,
  dirt: 94,
  sand: 179,
  sandDark: 136,
  rock: 242,
  rockDark: 240,
  snow: 255,
  runway: 236,
  runwayLight: 244,
  center: 255,
  edge: 252,
  papiWhite: 231,
  papiRed: 196,
  plane: 252,
  planeShade: 145,
  planeDark: 240,
  window: 24,
  accent: 214,
  navLeft: 196,
  navRight: 46,
  hud: 250,
  hudLabel: 244,
};

module.exports = { Frame, COLORS, fgCode, bgCode, blit };
