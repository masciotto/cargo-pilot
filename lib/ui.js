'use strict';

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';

const paint = (c, s) => c + s + RESET;

const good = (s) => paint(GREEN, s);
const bad = (s) => paint(RED, s);
const warn = (s) => paint(YELLOW, s);
const info = (s) => paint(CYAN, s);
const dim = (s) => paint(DIM, s);
const bold = (s) => paint(BOLD, s);
const hot = (s) => paint(MAGENTA, s);

function clear() {
  process.stdout.write('\x1b[2J\x1b[H');
}

function sleep(ms) {
  if (!process.stdin.isTTY) return Promise.resolve();
  return new Promise((r) => setTimeout(r, ms));
}

let eof = false;
const queue = [];
let waiter = null;

function settle(v) {
  const w = waiter;
  waiter = null;
  if (w) w(v);
}

function bindRL(rl) {
  rl.on('line', (line) => {
    if (waiter) settle(line.trim());
    else queue.push(line);
  });
  rl.on('close', () => {
    eof = true;
    settle('__EOF__');
  });
}

// --- caricamento partita dal browser -------------------------------------
// Il server web (pagina) può rispondere a uno specifico prompt con una riga
// @@LOAD@@<base64 JSON>: la accettiamo solo se il prompt è "armato".
let loadArmed = false;
let pendingLoad = null;

function armLoad() {
  loadArmed = true;
}

function takePendingLoad() {
  const v = pendingLoad;
  pendingLoad = null;
  return v;
}

function checkLoad(a) {
  if (!loadArmed) return a;
  if (typeof a === 'string' && a.slice(0, 8) === '@@LOAD@@') {
    loadArmed = false;
    try {
      pendingLoad = JSON.parse(Buffer.from(a.slice(8), 'base64').toString('utf8'));
    } catch (e) {
      pendingLoad = null;
    }
    return '__LOAD__';
  }
  // risposta normale: il prompt è stato superato, disarmo
  loadArmed = false;
  return a;
}

async function ask(rl, q) {
  process.stdout.write(q);
  let a;
  if (queue.length) a = queue.shift();
  else if (eof) a = '__EOF__';
  else
    a = await new Promise((resolve) => {
      waiter = (v) => resolve(v == null ? '__EOF__' : v);
    });
  return checkLoad(a);
}

async function menu(rl, title, items) {
  console.log('\n' + bold(title));
  items.forEach((it, i) => {
    console.log('  ' + info(`[${i + 1}]`) + ' ' + it);
  });
  for (;;) {
    const a = await ask(rl, paint(YELLOW, '> ') + ' ');
    if (a === '__LOAD__') return -1;
    if (a === '__EOF__') return 0;
    const n = parseInt(a, 10);
    if (n >= 1 && n <= items.length) return n - 1;
    console.log(dim('Scelta non valida, riprova.') + RESET);
  }
}

function stars(wanted) {
  return '★'.repeat(wanted) + '☆'.repeat(Math.max(0, 5 - wanted));
}

function bar(pct, len) {
  const l = len || 20;
  const n = Math.max(0, Math.min(l, Math.round((pct / 100) * l)));
  const body = '#'.repeat(n) + '.'.repeat(l - n);
  const color = pct > 60 ? GREEN : pct > 30 ? YELLOW : RED;
  return paint(color, '[' + body + ']');
}

function section(title) {
  const pad = Math.max(4, 62 - title.length);
  console.log('\n' + paint(CYAN, '── ' + title + ' ' + '─'.repeat(pad)));
}

function visibleLen(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}

function box(lines, color) {
  let c = color || '';
  if (typeof c === 'number') c = '\x1b[' + c + 'm';
  const w = Math.max(...lines.map(visibleLen)) + 2;
  console.log(paint(c, '╔' + '═'.repeat(w) + '╗'));
  for (const l of lines) {
    const padN = Math.max(1, w - 1 - visibleLen(l));
    console.log(paint(c, '║') + ' ' + l + ' '.repeat(padN) + paint(c, '║'));
  }
  console.log(paint(c, '╚' + '═'.repeat(w) + '╝'));
}

const PLANE_ART = [
  '                 _____',
  '        ________/     \\_____',
  '   ----<   CARGO  AIR    >----',
  '        \\_______________/',
  '',
];

function titleScreen() {
  clear();
  box(
    [
      '',
      '  C A R G O   P I L O T   -   v1.0 PROVA',
      '',
      '  "Il mondo e il tuo magazzino"',
      '',
    ],
    CYAN
  );
  for (const l of PLANE_ART) console.log(paint(YELLOW, l));
}

function splash(level, total, wanted) {
  clear();
  box(
    [
      `LIVELLO ${level.n}/${total}  -  ${level.title}`,
      '',
      `  ${level.from}   ${'-'.repeat(6)}>   ${level.to}`,
      `  ${level.distanceKm} km   |   dogana: ${level.policeLabel} (${level.police}/5)`,
      `  polizia: ${stars(wanted)}`,
    ],
    YELLOW
  );
}

module.exports = {
  ask,
  menu,
  armLoad,
  takePendingLoad,
  sleep,
  clear,
  bindRL,
  good,
  bad,
  warn,
  info,
  dim,
  bold,
  hot,
  stars,
  bar,
  section,
  box,
  titleScreen,
  splash,
  RESET,
};
