'use strict';

const { COLORS } = require('./render');
const S = require('./sprites');
const scene = require('./scene');
const eng = require('./engine');
const bridge = require('./bridge');

const CX = Math.floor(eng.SCENE_W / 2);
const PLANE_X = CX - 5;
const REAR_H = 22; // righe sprite REAR_PLANE (1 riga = 1 cella)
const PLANE_Y = Math.max(3, eng.SCENE_H - REAR_H - 1);
const V_R = 64; // m/s ≈ 125 kt
const STEER = 6.0;
const WIND_K = 0.18;
const MAX_LATERAL = scene.HALF_W;
const MAXLEN = eng.W - 3;

const pad = (n, w) => String(Math.round(n)).padStart(w, ' ');

function windTag(wind) {
  if (Math.abs(wind) < 0.6) return 'VENTO calmo';
  const arrow = wind > 0 ? '↘' : '↙';
  return 'VENTO ' + arrow + pad(Math.abs(wind) * 1.94, 2) + ' kt';
}

function tape(x) {
  const cells = [];
  for (let i = -6; i <= 6; i++) cells.push(i === 0 ? '|' : '·');
  const pos = 6 + Math.max(-6, Math.min(6, Math.round(x / 1.6)));
  cells[pos] = pos === 6 ? '|' : x < 0 ? '◄' : '►';
  const center = 6;
  cells[center] = '|';
  return cells.join('');
}

function bar(v, max, len) {
  const n = Math.max(0, Math.min(len, Math.round((v / max) * len)));
  return '█'.repeat(n) + '░'.repeat(len - n);
}

// opts: { hull, runway, windBase, windMult, cargoWeight, ground, region }
function takeoff(opts) {
  const runway = opts.runway;
  const wind0 = opts.windBase * (opts.windMult || 1);
  const accel = 5.4 - 1.3 * Math.max(0, Math.min(1, opts.cargoWeight || 0));

  const st = {
    v: 0,
    x: 0,
    vx: 0,
    traveled: 0,
    alt: 0,
    pitch: 0,
    phase: 'roll',
    wind: wind0,
    gustT: 1.2,
    input: 0,
    inputT: 0,
    hull: opts.hull,
    fuel: 100,
    cond: 100,
    maxX: 0,
    warned: false,
    quality: 'ok',
    damageHull: 0,
    damageCargo: 0,
    overT: 0,
    stallT: 0,
    msg1: 'Pista ' + runway.name + ' (' + runway.len + ' m). Motore al massimo, freni liberi.',
    msg2: '←/→ (A/D) tieni l\'asse · a Vr premi ↑ (W) per staccare',
    flash: 0,
  };
  if (!eng.isInteractive()) st.msg2 = 'AUTOPILOT attivo: decollo automatico.';

  const frame = eng.newFrame();
  const scn = eng.newScene();
  const hz0 = 5;

  const dyEnd = (hzr) => (scene.FOCAL * scene.GROUND_CAM_H) / Math.max(1, runway.len - st.traveled);

  function render() {
    const kt = Math.round(st.v * 1.94);
    const rem = Math.max(0, runway.len - st.traveled);
    const extra =
      'ALTE ' + pad(st.alt * 3.28, 4) + 'ft ' +
      (st.phase === 'roll' ? 'a terra' : st.phase === 'rotate' ? 'ROTA' : 'salita');
    const bank = Math.max(-1, Math.min(1, Math.round(st.input !== 0 ? st.input : st.vx * 0.3)));

    if (bridge.active) {
      bridge.scene({
        phase: 'takeoff',
        title: 'DECOLLO — ' + runway.name,
        v: st.v,
        kt,
        x: st.x,
        vx: st.vx,
        traveled: st.traveled,
        alt: st.alt,
        pitch: st.pitch,
        runPhase: st.phase,
        wind: st.wind,
        hull: st.hull,
        fuel: st.fuel,
        cond: st.cond,
        runwayLen: runway.len,
        runwayName: runway.name,
        rem,
        bank,
        warned: st.warned,
        flash: st.flash,
        quality: st.quality,
        msg1: st.msg1,
        msg2: st.msg2,
        extra,
        hud:
          'VEL ' + pad(kt, 3) + ' ' + bar(st.v, V_R * 1.3, 12) +
          '  VR' + pad(Math.round(V_R * 1.94), 4) +
          '  PISTA ' + pad(rem, 4) +
          '  ' + windTag(st.wind) +
          '  ASSE ' + tape(st.x),
        vr: V_R,
        t: Date.now() / 1000,
      });
      return;
    }

    const hzr = Math.min(eng.SCENE_H - 1, hz0 + Math.round(st.pitch));
    scn.clear(0, 0, 0);
    scene.drawSky(scn, hzr);
    scene.drawGround(scn, hzr, COLORS.grass);
    if (hzr < eng.SCENE_H - 1) scene.drawHorizonLine(scn, hzr);
    if (hzr < eng.SCENE_H - 1) {
      const dy = dyEnd(hzr);
      if (hzr + dy < eng.SCENE_H) {
        scene.drawRunwayBand(scn, {
          hz: hzr,
          cx: CX,
          x0: st.x,
          camH: scene.GROUND_CAM_H,
          topRow: hzr + dy,
          botRow: eng.SCENE_H - 1,
          traveled: st.traveled,
        });
        scene.drawEndMarker(scn, {
          hz: hzr,
          cx: CX,
          x0: st.x,
          camH: scene.GROUND_CAM_H,
          dyEnd: dy,
          critical: runway.len - st.traveled < 170,
          flash: st.flash > 0,
        });
      }
    }

    // strie di vento nel cielo
    const dir = st.wind >= 0 ? 1 : -1;
    const speed = 6 + Math.abs(st.wind) * 3;
    const t = Date.now() / 1000;
    for (let i = 0; i < 5; i++) {
      const base = (i * 17 + t * speed * dir) % eng.SCENE_W;
      const x = Math.round(((base % eng.SCENE_W) + eng.SCENE_W) % eng.SCENE_W);
      const y = 1 + (i % 3);
      if (y > hzr - 1) continue;
      for (let k = 0; k < 3; k++) {
        const px = (x + k * dir + eng.SCENE_W) % eng.SCENE_W;
        const c = COLORS.cyanDim;
        scn.set(px, y * 2, c >> 16, (c >> 8) & 0xff, c & 0xff);
      }
    }

    const maxPy = Math.max(0, eng.SCENE_H - REAR_H);
    const py = Math.min(maxPy, Math.max(0, PLANE_Y + Math.round(st.pitch * 0.5)));
    if (py < eng.SCENE_H) {
      scene.drawSprite(scn, S.REAR_PLANE[bank], PLANE_X, py, {});
    }

    const hud =
      'VEL ' + pad(kt, 3) + ' ' + bar(st.v, V_R * 1.3, 12) +
      ' VR' + pad(Math.round(V_R * 1.94), 4) +
      '  PISTA ' + pad(rem, 4) +
      '  ' + windTag(st.wind) +
      '  ASSE ' + tape(st.x);

    eng.chrome(frame, {
      title: 'DECOLLO — ' + runway.name,
      hud: {
        hull: st.hull,
        fuel: st.fuel,
        cond: st.cond,
        extra,
      },
      scene: scn,
      msg1: st.msg1,
      msg2: st.msg2,
    });
    eng.drawHudB(
      frame,
      hud.slice(0, MAXLEN),
      st.warned && st.phase === 'roll' ? COLORS.amber : COLORS.hud
    );
    frame.render();
  }

  function rotate() {
    if (st.phase !== 'roll') return;
    st.phase = 'rotate';
    st.quality = st.v <= V_R * 1.05 && Math.abs(st.x) < 7 ? 'perfect' : 'ok';
    st.msg1 = 'ROTAZIONE — naso su, carrello in rientro.';
    st.msg2 = 'Tratteni ←/→ per tenere l\'ala dritta durante la salita.';
  }

  function stall() {
    if (st.phase !== 'roll' || st.stallT > 0) return;
    st.stallT = 2.2;
    st.hull = Math.max(0, st.hull - 6);
    st.damageHull += 6;
    st.quality = 'stall';
    st.v *= 0.85;
    st.msg1 = 'STALLO! Hai staccato prima di Vr: l\'aereo ricade sul asfalto.';
    st.msg2 = 'Aspetta il lampeggio Vr e poi premi ↑.';
    st.flash = 6;
  }

  function end(reason) {
    if (st.phase === 'over') return;
    st.phase = 'over';
    st.overT = 0;
    if (reason === 'overrun') {
      st.hull = Math.max(0, st.hull - 30);
      st.damageHull += 30;
      st.cond = Math.max(0, st.cond - 20);
      st.damageCargo += 20;
      st.quality = 'overrun';
      st.msg1 = '*** FINE PISTA! L\'aereo supera il limite della corsia. ***';
      st.msg2 = 'Impatto al fondo pista: danno strutturale grave.';
    } else if (reason === 'crash') {
      st.quality = st.quality === 'ok' ? 'crash' : st.quality;
      st.msg1 = '*** AEREO FUORI CONTROLLO: la struttura ha ceduto in pista. ***';
      st.msg2 = 'Soccorso in pista: il contratto salta.';
      st.flash = 0.6;
    } else if (reason === 'excursion') {
      st.hull = Math.max(0, st.hull - 18);
      st.damageHull += 18;
      st.cond = Math.max(0, st.cond - 10);
      st.damageCargo += 10;
      st.quality = 'excursion';
      st.msg1 = '*** USCITA DI PISTA: ruote sull\'erba a ' + Math.round(st.v * 1.94) + ' kt. ***';
      st.msg2 = 'Revisione in hangar e controllo del carico.';
    } else {
      st.msg1 = 'Fuori campo: quota acquisita, rotta di ' + (opts.to || '') + '.';
      st.msg2 = 'Decollo riuscito — carico al ' + Math.round(st.cond) + '%.';
      if (st.quality === 'perfect') st.fuel = Math.min(100, st.fuel + 8);
    }
  }

  function onKey(key) {
    if (key.name === 'left' || key.name === 'a') {
      st.input = -1;
      st.inputT = 0.3;
    } else if (key.name === 'right' || key.name === 'd') {
      st.input = 1;
      st.inputT = 0.3;
    } else if (key.name === 'up' || key.name === 'w') {
      if (st.phase === 'roll') {
        if (st.v >= V_R * 0.92) rotate();
        else stall();
      }
    }
  }

  function onTick(dt) {
    st.flash = Math.max(0, st.flash - dt);
    st.stallT = Math.max(0, st.stallT - dt);
    st.inputT -= dt;
    if (st.inputT <= 0) st.input = 0;
    st.gustT -= dt;
    if (st.gustT <= 0) {
      st.gustT = 1.4 + Math.random() * 2.2;
      st.wind = wind0 * (0.5 + Math.random() * 1.0);
    }

    if (st.phase === 'over') {
      st.overT += dt;
      return st.overT > 1.4;
    }
    if (st.hull <= 0) {
      end('crash');
      return false;
    }

    if (!eng.isInteractive() && st.phase === 'roll') {
      st.input = Math.max(-1, Math.min(1, -st.x * 0.3 - st.vx * 0.8));
      if (st.v >= V_R) rotate();
    } else if (!eng.isInteractive()) {
      st.input = Math.max(-1, Math.min(1, -st.x * 0.25 - st.vx * 0.7));
    }

    if (st.phase === 'roll') {
      st.v += accel * dt;
      st.traveled += st.v * dt;
      st.vx += (st.input * STEER + st.wind * WIND_K) * dt;
      st.vx *= Math.exp(-1.6 * dt);
      st.x += st.vx * dt;
      st.maxX = Math.max(st.maxX, Math.abs(st.x));
      st.fuel = Math.max(0, st.fuel - dt * 0.7);
      if (!st.warned && st.v >= V_R * 0.92) {
        st.warned = true;
        st.msg1 = '>> Vr RAGGIUNTO: premi ↑ (W) per staccare! <<';
        st.msg2 = 'Superata la fine della pista si finisce fuori corsia (' + runway.len + ' m).';
      }
      if (st.traveled >= runway.len) end('overrun');
      else if (Math.abs(st.x) > MAX_LATERAL) end('excursion');
    } else if (st.phase === 'rotate') {
      st.pitch = Math.min(4.5, st.pitch + dt * 6);
      st.alt += (2 + st.pitch * 2.4) * dt;
      st.traveled += st.v * dt;
      st.v += accel * 0.5 * dt;
      st.vx += (st.input * STEER * 0.7 + st.wind * WIND_K * 0.5) * dt;
      st.vx *= Math.exp(-1.4 * dt);
      st.x += st.vx * dt;
      st.fuel = Math.max(0, st.fuel - dt * 0.7);
      if (st.pitch < 2.6 && st.traveled >= runway.len) end('overrun');
      else if (st.pitch >= 4.5) {
        st.phase = 'climb';
        st.msg1 = 'Salita in corridoio. Carrello e flap rientrati.';
        st.msg2 = 'Il traverso spinge ancora: compensa con ←/→.';
      }
    } else if (st.phase === 'climb') {
      st.overT += dt;
      st.pitch = Math.max(3, st.pitch - dt * 0.4);
      st.alt += 14 * dt;
      st.traveled += st.v * dt;
      st.vx += (st.input * STEER * 0.5 + st.wind * WIND_K * 0.35) * dt;
      st.vx *= Math.exp(-1.3 * dt);
      st.x += st.vx * dt;
      st.fuel = Math.max(0, st.fuel - dt * 0.6);
      if (st.overT > 4.2) {
        if (st.quality === 'ok' && st.maxX < 7) st.quality = 'perfect';
        end('climb');
      }
    }
    return false;
  }

  return eng.runLoop({ onTick, onKey, onRender: render }).then(() => ({
    hull: st.hull,
    fuel: st.fuel,
    cond: st.cond,
    quality: st.quality,
    damageHull: st.damageHull,
    damageCargo: st.damageCargo,
    maxX: Math.round(st.maxX),
    distance: Math.round(st.traveled),
  }));
}

module.exports = { takeoff, V_R };
