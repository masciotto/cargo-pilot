'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const pty = require('node-pty');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3210;
const DEF_COLS = 160;
const DEF_ROWS = 42;

function clampInt(v, min, max, def) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ ok: true, game: 'cargo-pilot' }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/term' });

wss.on('connection', (ws, req) => {
  // Il client sceglie cols/rows (desktop 160x42, telefono molto meno).
  let cols = DEF_COLS;
  let rows = DEF_ROWS;
  try {
    const u = new URL(req.url, 'http://localhost');
    cols = clampInt(u.searchParams.get('cols'), 60, 200, DEF_COLS);
    rows = clampInt(u.searchParams.get('rows'), 20, 60, DEF_ROWS);
  } catch (e) {
    /* default */
  }

  const shell = process.execPath;
  const args = [path.join(__dirname, '..', 'game.js')];
  const env = {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    CP_WEB: '1',
  };

  const term = pty.spawn(shell, args, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: path.join(__dirname, '..'),
    env,
  });

  // Estrae messaggi di scena (OSC CP) e li inoltra come JSON;
  // il resto va al terminale come prima.
  const OSC_RE = /\x1b\]1337;CP;([\s\S]*?)\x07/g;
  term.onData((data) => {
    if (ws.readyState !== ws.OPEN) return;
    let last = 0;
    let m;
    OSC_RE.lastIndex = 0;
    while ((m = OSC_RE.exec(data)) !== null) {
      if (m.index > last) ws.send(data.slice(last, m.index));
      try {
        ws.send(m[1]);
      } catch (e) {
        /* JSON malformato: scarta */
      }
      last = m.index + m[0].length;
    }
    if (last < data.length) ws.send(data.slice(last));
  });

  term.onExit(({ exitCode }) => {
    if (ws.readyState === ws.OPEN) {
      ws.send('\r\n[sessione terminata — ricarica per rigiocare]\r\n');
      ws.close();
    }
    void exitCode;
  });

  ws.on('message', (msg) => {
    const text = typeof msg === 'string' ? msg.toString() : msg.toString('utf8');
    term.write(text);
  });

  ws.on('close', () => {
    try {
      term.kill();
    } catch (e) {
      /* già chiuso */
    }
  });

  ws.on('error', () => {
    try {
      term.kill();
    } catch (e) {
      /* già chiuso */
    }
  });
});

server.listen(PORT, () => {
  console.log('Cargo Pilot in ascolto su http://localhost:' + PORT);
});
