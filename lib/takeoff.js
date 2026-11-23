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
const STEER = 11.0; // sensibilità comandi: l'aereo risponde al tocco
const WIND_K = 0.30; // traverso e raffiche: molto più vivi di prima
const DRAG = 0.115; // resistenza aerodinamica
const THR_HOLD = 0.7; // durata di un tocco sull'acceleratore (s)
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
  // Potenza motore: il carico pesante allunga la corsa fino a Vr.
  const power = 13.5 - 3.5 * Math.max(0, Math.min(1, opts.cargoWeight || 0));

  const st = {
    v: 0,
    x: 0,
    vx: 0,
    traveled: 0,
    alt: 0,
    pitch: 0,
    phase: 'roll',
    wind: wind0,
    gustT: 0.8,
    thrT: 0,
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
    driftWarn: false,
    msg1: 'Pista ' + runway.name + ' (' + runway.len + ' m). Tieni ▲ (↑) aperto: acceleratore al massimo.',
    msg2: '▲ (↑) acceleratore · a Vr premi W (tasto centrale del pad) per staccare',
    flash: 0,
    shake: 0,
    banner: null,
    bannerT: 0,
  };
  if (!eng.isInteractive()) st.msg2 = 'AUTOPILOT attivo: decollo automatico.';

  const frame = eng.newFrame();
  const scn = eng.newScene();
  const hz0 = 5;

  const dyEnd = (hzr) => (scene.FOCAL * scene.GROUND_CAM_H) / Math.max(1, runway.len - st.traveled);

  function render() {
    const kt = Math.round(st.v * 1.94);
    const rem = Math.max(0, runway.len - st.traveled);
    const mot = st.thrT > 0 ? 'MOT ▓▓▓' : 'MOT ░░░';
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
        shake: st.shake,
        banner: st.banner,
        bannerT: st.bannerT,
        quality: st.quality,
        msg1: st.msg1,
        msg2: st.msg2,
        extra,
        hud:
          'VEL ' + pad(kt, 3) + ' ' + bar(st.v, V_R * 1.3, 12) +
          '  VR' + pad(Math.round(V_R * 1.94), 4) +
          '  ' + mot +
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
      '  ' + mot +
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
    st.quality = st.v <= V_R * 1.08 && Math.abs(st.x) < 5 ? 'perfect' : 'ok';
    st.msg1 = 'ROTAZIONE — naso su, carrello in rientro.';
    st.msg2 = 'In salita le raffiche ti spingono: tieni ←/→ per restare in asse.';
    setBanner('ROTAZIONE', 'Vr raggiunta · naso su', '#7fd787', 1.6, 0.15);
  }

  function stall() {
    if (st.phase !== 'roll' || st.stallT > 0) return;
    st.stallT = 2.2;
    st.hull = Math.max(0, st.hull - 6);
    st.damageHull += 6;
    st.quality = 'stall';
    st.v *= 0.85;
    st.msg1 = 'STALLO! Hai staccato con W prima di Vr: l\'aereo ricade sull\'asfalto.';
    st.msg2 = 'Accelera con ▲ fino a Vr (lampeggio) e poi premi W.';
    st.flash = 6;
    setBanner('STALLO', 'staccato prima di Vr', '#ef233c', 1.8, 0.9);
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
      setBanner('FINE PISTA', 'impatto al fondo corsia', '#ef233c', 2, 0.9);
    } else if (reason === 'crash') {
      st.quality = st.quality === 'ok' ? 'crash' : st.quality;
      st.msg1 = '*** AEREO FUORI CONTROLLO: la struttura ha ceduto in pista. ***';
      st.msg2 = 'Soccorso in pista: il contratto salta.';
      st.flash = 0.6;
      setBanner('FUORI CONTROLLO', 'la struttura ha ceduto', '#ef233c', 2, 0.9);
    } else if (reason === 'excursion') {
      st.hull = Math.max(0, st.hull - 18);
      st.damageHull += 18;
      st.cond = Math.max(0, st.cond - 10);
      st.damageCargo += 10;
      st.quality = 'excursion';
      st.msg1 = '*** USCITA DI PISTA: ruote sull\'erba a ' + Math.round(st.v * 1.94) + ' kt. ***';
      st.msg2 = 'Revisione in hangar e controllo del carico.';
      setBanner('USCITA DI PISTA', 'ruote sull\'erba', '#f4a261', 1.8, 0.7);
    } else {
      st.msg1 = 'Fuori campo: quota acquisita, rotta di ' + (opts.to || '') + '.';
      st.msg2 = 'Decollo riuscito — carico al ' + Math.round(st.cond) + '%.';
      if (st.quality === 'perfect') st.fuel = Math.min(100, st.fuel + 8);
      setBanner('DECOLLO RIUSCITO', 'rotta di ' + (opts.to || ''), '#7fd787', 1.8, 0.2);
    }
  }

  function onKey(key) {
    if (key.name === 'left' || key.name === 'a') {
      st.input = -1;
      st.inputT = 0.32;
    } else if (key.name === 'right' || key.name === 'd') {
      st.input = 1;
      st.inputT = 0.32;
    } else if (key.name === 'up') {
      // ▲ = acceleratore: ogni tocco tiene il motore aperto per THR_HOLD s.
      st.thrT = THR_HOLD;
    } else if (key.name === 'w') {
      // Tasto centrale del pad (W): stacco da terra.
      if (st.phase === 'roll') {
        if (st.v >= V_R * 0.92) rotate();
        else stall();
      }
    } else if (key.name === 'space') {
      // SPAZIO stacca solo se c'è abbastanza velocità: altrimenti è un tasto
      // sbagliato e non ti fa stallare.
      if (st.phase === 'roll' && st.v >= V_R * 0.92) rotate();
    }
  }

  function setBanner(text, sub, color, life, shake) {
    st.banner = { text, sub: sub || '', color: color || '#ffd866' };
    st.bannerT = life || 1.6;
    st.shake = shake || 0;
  }

  function onTick(dt) {
    st.flash = Math.max(0, st.flash - dt);
    st.shake = Math.max(0, st.shake - dt);
    st.bannerT = Math.max(0, st.bannerT - dt);
    if (st.bannerT <= 0) st.banner = null;
    st.stallT = Math.max(0, st.stallT - dt);
    st.inputT -= dt;
    if (st.inputT <= 0) st.input = 0;
    st.thrT = Math.max(0, st.thrT - dt);

    // Raffiche: frequenti e violente, ancora peggio durante la salita.
    st.gustT -= dt;
    if (st.gustT <= 0) {
      const climbing = st.phase === 'climb';
      st.gustT = 0.8 + Math.random() * (climbing ? 1.4 : 1.7);
      st.wind = wind0 * (0.4 + Math.random() * 1.5);
      if (st.phase !== 'over') st.vx += (Math.random() - 0.5) * (climbing ? 3.6 : 2.6);
      if (climbing) {
        st.msg1 = 'SCARICA DI VENTO in salita: correggi con ←/→.';
        st.msg2 = 'Scostamento ' + (st.x >= 0 ? '+' : '-') + pad(Math.abs(st.x), 3) +
          ' m dal centro pista.';
      }
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
      st.thrT = THR_HOLD;
      st.input = Math.max(-1, Math.min(1, -st.x * 0.3 - st.vx * 0.8));
      if (st.v >= V_R) rotate();
    } else if (!eng.isInteractive()) {
      st.input = Math.max(-1, Math.min(1, -st.x * 0.25 - st.vx * 0.7));
    }

    const thr = st.thrT > 0 ? 1 : 0;

    if (st.phase === 'roll') {
      st.v = Math.max(0, st.v + (power * thr - DRAG * st.v * (0.25 + 0.75 * thr)) * dt);
      st.traveled += st.v * dt;
      st.vx += (st.input * STEER + st.wind * WIND_K) * dt;
      st.vx *= Math.exp(-1.5 * dt);
      st.x += st.vx * dt;
      st.maxX = Math.max(st.maxX, Math.abs(st.x));
      st.fuel = Math.max(0, st.fuel - dt * 0.7);
      if (!st.warned && st.v >= V_R * 0.92) {
        st.warned = true;
        st.msg1 = '>> Vr RAGGIUNTO: premi W (tasto centrale) per staccare! <<';
        st.msg2 = 'Tieni ▲ (↑) aperto e tieni l\'asse con ←/→.';
      }
      if (Math.abs(st.x) > 9 && !st.driftWarn) {
        st.driftWarn = true;
        if (st.warned) {
          st.msg2 = 'Asse fuori corsia (' + Math.round(st.x) + ' m): correggi con ←/→.';
        } else {
          st.msg1 = 'Attenzione: il traverso ti porta fuori asse — correggi con ←/→.';
          st.msg2 = 'A Vr stacca con W (tasto centrale del pad).';
        }
      } else if (Math.abs(st.x) < 5) {
        st.driftWarn = false;
      }
      if (st.traveled >= runway.len) end('overrun');
      else if (Math.abs(st.x) > MAX_LATERAL) end('excursion');
    } else if (st.phase === 'rotate') {
      st.pitch = Math.min(4.5, st.pitch + dt * 6);
      st.alt += (2 + st.pitch * 2.4) * dt;
      st.traveled += st.v * dt;
      st.v = Math.max(0, st.v + (power * 0.5 - DRAG * st.v * 0.5) * dt);
      st.vx += (st.input * STEER * 0.8 + st.wind * WIND_K * 0.7) * dt;
      st.vx *= Math.exp(-1.3 * dt);
      st.x += st.vx * dt;
      st.maxX = Math.max(st.maxX, Math.abs(st.x));
      st.fuel = Math.max(0, st.fuel - dt * 0.7);
      if (st.pitch < 2.6 && st.traveled >= runway.len) end('overrun');
      else if (st.pitch >= 4.5) {
        st.phase = 'climb';
        st.msg1 = 'Salita in corridoio: l\'aereo è nelle tue mani.';
        st.msg2 = '←/→ tengono l\'asse contro le scariche di vento.';
      }
    } else if (st.phase === 'climb') {
      st.overT += dt;
      st.pitch = Math.max(3, st.pitch - dt * 0.4);
      st.alt += 14 * dt;
      st.traveled += st.v * dt;
      st.v = Math.max(0, st.v + (power * 0.4 - DRAG * st.v * 0.4) * dt);
      st.vx += (st.input * STEER * 0.9 + st.wind * WIND_K * 1.2) * dt;
      st.vx *= Math.exp(-1.1 * dt);
      st.x += st.vx * dt;
      st.maxX = Math.max(st.maxX, Math.abs(st.x));
      st.fuel = Math.max(0, st.fuel - dt * 0.6);
      if (Math.abs(st.x) > 10) {
        st.msg1 = '>> FUORI CORRIDOIO: scostamento ' + Math.round(Math.abs(st.x)) + ' m. <<';
        st.msg2 = 'Il traverso non molla: compensa con ←/→.';
      }
      if (st.overT > 6.5) {
        if (st.maxX > 13) st.quality = 'drift';
        else if (st.maxX > 7 && st.quality === 'perfect') st.quality = 'ok';
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
