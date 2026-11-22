'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const pty = require('node-pty');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
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
  const env = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' };

  const term = pty.spawn(shell, args, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: path.join(__dirname, '..'),
    env,
  });

  term.onData((data) => {
    if (ws.readyState === ws.OPEN) ws.send(data);
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
