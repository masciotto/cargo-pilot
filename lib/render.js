'use strict';

// Framebuffer a celle (char + fg + bg) con output ANSI truecolor 24-bit.
// I colori sono interi 0xRRGGBB o null per il colore predefinito del terminale.

const fgCode = (c) => (c === null ? '' : '\x1b[38;2;' + ((c >> 16) & 0xff) + ';' + ((c >> 8) & 0xff) + ';' + (c & 0xff) + 'm');
const bgCode = (c) => (c === null ? '' : '\x1b[48;2;' + ((c >> 16) & 0xff) + ';' + ((c >> 8) & 0xff) + ';' + (c & 0xff) + 'm');

// Copia una scena (frame di celle) dentro un frame, a partire da (x, y).
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

// Blit di celle half-block prodotte da PixelCanvas.toHalfBlockCells().
function blitCells(dst, cells, x, y) {
  const cw = cells[0] ? cells[0].length : 0;
  const ch = cells.length;
  for (let r = 0; r < ch; r++) {
    const dy = y + r;
    if (dy < 0 || dy >= dst.height) continue;
    for (let c = 0; c < cw; c++) {
      const dx = x + c;
      if (dx < 0 || dx >= dst.width) continue;
      const di = dy * dst.width + dx;
      const cell = cells[r][c];
      dst.ch[di] = cell.ch;
      dst.fg[di] = cell.fg;
      dst.bg[di] = cell.bg;
    }
  }
}

class Frame {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.ch = new Array(width * height).fill(' ');
    this.fg = new Array(width * height).fill(null);
    this.bg = new Array(width * height).fill(null);
  }

  clear(bgColor) {
    this.ch.fill(' ');
    this.fg.fill(null);
    this.bg.fill(bgColor || null);
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
      let cf = null;
      let cb = null;
      for (let x = 0; x < this.width; x++) {
        const i = y * this.width + x;
        const f = this.fg[i];
        const b = this.bg[i];
        if (f !== cf || b !== cb) {
          if (f === null && b === null) out += '\x1b[0m';
          else out += '\x1b[0m' + fgCode(f) + bgCode(b);
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
  white: 0xe6e6e6,
  bright: 0xffffff,
  dim: 0xa8a8a8,
  dimmer: 0x707070,
  text: 0xd4d4d4,
  cyan: 0x4cc9f0,
  cyanDim: 0x2a86b8,
  green: 0x2ecc71,
  greenDim: 0x1e8449,
  yellow: 0xffd166,
  amber: 0xf4a261,
  orange: 0xe76f51,
  red: 0xef233c,
  redDim: 0x8e0404,
  magenta: 0xd90429,
  blue: 0x277da1,
  blueSky: 0x6dc6ff,
  skyTop: 0x090d17,
  skyHigh: 0x0f1629,
  skyMid: 0x1a365d,
  skyLow: 0x2a5c9a,
  skyHorizon: 0x3a86ff,
  cloud: 0xffffff,
  cloudShade: 0xd8d8d8,
  cloudFar: 0xb0b8c4,
  sea: 0x0a1128,
  seaLight: 0x14304a,
  foam: 0x6ee7b7,
  grass: 0x2d6a4f,
  grassDark: 0x1b4332,
  grassLight: 0x40916c,
  dirt: 0x6b4226,
  sand: 0xe9c46a,
  sandDark: 0xc9a227,
  rock: 0xb8b8b8,
  rockDark: 0x8a8a8a,
  snow: 0xffffff,
  runway: 0x3b3b42,
  runwayLight: 0x6a6a72,
  center: 0xffffff,
  edge: 0xe0e0e0,
  papiWhite: 0xffffff,
  papiRed: 0xe71d36,
  plane: 0xe6e6e6,
  planeShade: 0x9aa0a6,
  planeDark: 0x444444,
  window: 0x1a252f,
  accent: 0xf4a261,
  navLeft: 0xe71d36,
  navRight: 0x2ecc71,
  hud: 0xc7c7c7,
  hudLabel: 0x8e8e8e,
  border: 0x4a4a4a,
  title: 0xffd166,
  bg: null,
  black: 0x0a0a0a,
  skin: 0xffdbac,
  wind: 0x5b9bd5,
};

module.exports = { Frame, COLORS, fgCode, bgCode, blit, blitCells, ansiFg: undefined };
