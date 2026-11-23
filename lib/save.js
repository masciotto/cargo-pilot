'use strict';

// Salvataggio partite sul server (JSON in saves/NOME.json).
// Ogni pilota ha il suo file: run in corso + carriera accumulata.

const fs = require('fs');
const path = require('path');

const DIR = process.env.CP_SAVE_DIR || path.join(__dirname, '..', 'saves');

function key(name) {
  const k = String(name || '')
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 16);
  return k || 'ANONIMO';
}

function fileOf(name) {
  return path.join(DIR, key(name) + '.json');
}

function load(name) {
  try {
    const data = JSON.parse(fs.readFileSync(fileOf(name), 'utf8'));
    if (!data || data.v !== 1) return null;
    data.career = data.career || emptyCareer();
    return data;
  } catch (e) {
    return null;
  }
}

function save(name, data) {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const payload = Object.assign({ v: 1 }, data, { name: key(name), updated: Date.now() });
    const tmp = fileOf(name) + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(payload));
    fs.renameSync(tmp, fileOf(name));
    return true;
  } catch (e) {
    return false;
  }
}

function emptyCareer() {
  return { cash: 0, flights: 0, ok: 0, crashes: 0, illegal: 0, caught: 0 };
}

function scoreOf(data) {
  return (data && data.career && data.career.cash) || 0;
}

function list() {
  try {
    return fs
      .readdirSync(DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
        } catch (e) {
          return null;
        }
      })
      .filter((d) => d && d.v === 1)
      .sort((a, b) => scoreOf(b) - scoreOf(a));
  } catch (e) {
    return [];
  }
}

module.exports = { load, save, list, key, scoreOf, emptyCareer, fileOf };
