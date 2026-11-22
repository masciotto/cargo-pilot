'use strict';

const readline = require('readline');
const { Frame, COLORS, blitCells } = require('./render');
const { PixelCanvas } = require('./pixel');

// Dimensione terminale rilevata all'avvio (web: imposta dal PTY, 160x42).
function detectSize() {
  const cols = process.stdout.columns || 160;
  const rows = process.stdout.rows || 42;
  return {
    W: Math.max(60, Math.min(200, cols)),
    H: Math.max(20, Math.min(60, rows)),
  };
}

const sz = detectSize();
const W = sz.W;
const H = sz.H;
const SCENE_X = 1;
const SCENE_Y = 4;
const SCENE_W = Math.max(10, W - 2);
const SCENE_H = Math.max(4, H - 8);
const MAXLEN = Math.max(20, W - 3);

const BORD = COLORS.border;
const TITLE = COLORS.title;

function newFrame() {
  return new Frame(W, H);
}

function newScene() {
  return new PixelCanvas(SCENE_W, SCENE_H * 2);
}

function borderLine(f, y, title) {
  const inner = W - 2;
  const t = title ? ' ' + title + ' ' : '';
  const pad = Math.max(0, inner - t.length);
  const left = Math.floor(pad / 2);
  f.text(0, y, '╔' + '═'.repeat(left), BORD);
  if (t) f.text(1 + left, y, t, TITLE);
  f.text(1 + left + t.length, y, '═'.repeat(pad - left) + '╗', BORD);
}

function midLine(f, y) {
  f.text(0, y, '╠' + '═'.repeat(W - 2) + '╣', BORD);
}

function bottomLine(f, y) {
  f.text(0, y, '╚' + '═'.repeat(W - 2) + '╝', BORD);
}

// hudA: barre generali (integrità, carburante, carico) + slot opzionale.
function drawHudA(f, s) {
  const y = 1;
  const bar = (label, pct, color) => {
    const n = Math.max(0, Math.min(5, Math.round((pct / 100) * 5)));
    return label + ' ' + String(Math.round(pct)).padStart(3) + '% ' + '█'.repeat(n) + '░'.repeat(5 - n);
  };
  const parts = [
    ['INTEG', bar('INTEG', s.hull, s.hull > 60 ? COLORS.green : s.hull > 30 ? COLORS.yellow : COLORS.red)],
    ['CARB', bar('CARB', s.fuel, s.fuel > 30 ? COLORS.cyan : COLORS.red)],
    ['CARGO', bar('CARGO', s.cond, s.cond > 30 ? COLORS.hud : COLORS.red)],
  ];
  let x = 1;
  for (const [label, txt] of parts) {
    f.text(x, y, label, COLORS.hudLabel);
    f.text(x + label.length + 1, y, txt.slice(label.length + 1), COLORS.hud);
    x += txt.length + 2;
  }
  if (s.extra) f.text(x, y, String(s.extra).slice(0, W - 2 - x), COLORS.hud);
}

// hudB: riga specifica della fase (velocità, altitudine, vento...).
function drawHudB(f, txt, color) {
  f.text(1, 2, String(txt).slice(0, MAXLEN - 2), color || COLORS.hud);
}

function drawMsg(f, line1, line2) {
  f.text(1, H - 3, String(line1 || '').slice(0, W - 3), COLORS.text);
  f.text(1, H - 2, String(line2 || '').slice(0, W - 3), COLORS.hudLabel);
}

// Costruisce il frame completo a partire dalla scena (PixelCanvas) e HUD testo.
function chrome(f, o) {
  f.clear(COLORS.bg);
  borderLine(f, 0, o.title);
  drawHudA(f, o.hud);
  if (o.hudB) drawHudB(f, o.hudB.text, o.hudB.color);
  midLine(f, 3);
  if (o.scene) {
    const cells = o.scene.toHalfBlockCells();
    blitCells(f, cells, SCENE_X, SCENE_Y);
  }
  midLine(f, H - 4);
  drawMsg(f, o.msg1, o.msg2);
  bottomLine(f, H - 1);
}

// --- loop di fase -----------------------------------------------------------

function isInteractive() {
  return !!process.stdin.isTTY;
}

// Esegue la fase: onTick(dt) -> truthy per terminare; onRender disegna.
function runLoop(opts) {
  const tty = isInteractive();
  const tickMs = opts.tickMs || (tty ? 90 : 10);
  const simSpeed = opts.simSpeed || (tty ? 1 : 10);
  const stdin = process.stdin;
  const onKey = opts.onKey;
  const onTick = opts.onTick;
  const onRender = opts.onRender;
  const onExit = opts.onExit;

  return new Promise((resolve, reject) => {
    let rawOn = false;
    let timer = null;
    let done = false;

    const handler = (str, key) => {
      if (!key) return;
      if (key.ctrl && key.name === 'c') {
        cleanup();
        process.exit(0);
      }
      if (onKey) onKey(key);
    };

    if (tty && onKey) {
      readline.emitKeypressEvents(stdin);
      try {
        stdin.setRawMode(true);
        rawOn = true;
      } catch (e) {
        rawOn = false;
      }
      stdin.on('keypress', handler);
    }

    function cleanup() {
      if (timer) clearInterval(timer);
      timer = null;
      stdin.removeListener('keypress', handler);
      if (rawOn) {
        try { stdin.setRawMode(false); } catch (e) {}
        rawOn = false;
      }
    }

    // Schermo fisso: niente wrap (righe troppo lunghe = frame frammentato).
    process.stdout.write('\x1b[?7l\x1b[?25l\x1b[2J\x1b[H');
    let last = Date.now();
    let n = 0;
    timer = setInterval(() => {
      if (done) return;
      const now = Date.now();
      const dt = (Math.min(0.4, (now - last) / 1000)) * simSpeed;
      last = now;
      let stop;
      try {
        stop = onTick(dt);
      } catch (err) {
        done = true;
        cleanup();
        reject(err);
        return;
      }
      const wantRender = tty || n % 15 === 0;
      n += 1;
      if (wantRender || stop) {
        try {
          onRender();
        } catch (err) {
          done = true;
          cleanup();
          reject(err);
          return;
        }
      }
      if (stop) {
        done = true;
        cleanup();
        process.stdout.write('\x1b[?25h\x1b[?7h');
        if (onExit) {
          Promise.resolve(onExit(stop)).then(resolve).catch(reject);
        } else {
          resolve(stop);
        }
      }
    }, tickMs);
  });
}

module.exports = {
  sz, W, H, SCENE_W, SCENE_H, SCENE_X, SCENE_Y, MAXLEN,
  newFrame, newScene, chrome, borderLine, midLine, bottomLine,
  drawHudA, drawHudB, drawMsg, runLoop, isInteractive, COLORS,
};
