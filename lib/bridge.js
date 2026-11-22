'use strict';

// Ponte stato → canvas (web). Attivo solo con CP_WEB=1 (spawn del server).
// Invia JSON via OSC privato: server lo estrae e lo inoltra sul WS.
// In locale (senza CP_WEB) il gioco resta 100% ANSI.

const active = process.env.CP_WEB === '1';

function emit(obj) {
  if (!active) return;
  try {
    const json = JSON.stringify(obj);
    process.stdout.write('\x1b]1337;CP;' + json + '\x07');
  } catch (e) {
    /* non bloccare il gioco */
  }
}

function scene(state) {
  emit(Object.assign({ cp: 'scene' }, state));
}

function end() {
  emit({ cp: 'end' });
}

module.exports = { active, scene, end, emit };
