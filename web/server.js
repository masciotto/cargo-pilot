'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const pty = require('node-pty');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const COLS = 160;
const ROWS = 42;

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ ok: true, game: 'cargo-pilot' }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/term' });

wss.on('connection', (ws) => {
  const shell = process.execPath;
  const args = [path.join(__dirname, '..', 'game.js')];
  const env = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' };

  const term = pty.spawn(shell, args, {
    name: 'xterm-256color',
    cols: COLS,
    rows: ROWS,
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
