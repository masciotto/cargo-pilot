'use strict';

const { COLORS } = require('./render');
const S = require('./sprites');
const scene = require('./scene');
const eng = require('./engine');
const bridge = require('./bridge');

const CX = Math.floor(eng.SCENE_W / 2);
const PLANE_X = CX - 5;
const REAR_H = 22;
const PLANE_Y = Math.max(3, eng.SCENE_H - REAR_H - 1);
const MAXLEN = eng.W - 3;
const HZ0 = 5;
const SLOPE = Math.tan((3 * Math.PI) / 180);
const V_APP = 62;
const STEER = 11.0; // sensibilità: risposta immediata del pad
const WIND_K = 0.30; // traverso più aggressivo
const MAX_LATERAL = scene.HALF_W;

const pad = (n, w) => String(Math.round(n)).padStart(w, ' ');
const zpad = (n, w) => String(Math.max(0, Math.round(n))).padStart(w, '0');
const sign = (n) => (n >= 0 ? '+' : '-') + zpad(Math.abs(n), 3);

function windTag(wind) {
  if (Math.abs(wind) < 0.6) return 'VENTO calmo';
  return 'VENTO ' + (wind > 0 ? '↘' : '↙') + pad(Math.abs(wind) * 1.94, 2) + 'kt';
}

function tape(x) {
  const cells = [];
  for (let i = -6; i <= 6; i++) cells.push(i === 0 ? '|' : '·');
  const pos = 6 + Math.max(-6, Math.min(6, Math.round(x / 1.6)));
  cells[pos] = pos === 6 ? '|' : x < 0 ? '◄' : '►';
  cells[6] = '|';
  return cells.join('');
}

function bar(v, max, len) {
  const n = Math.max(0, Math.min(len, Math.round((v / max) * len)));
  return '█'.repeat(n) + '░'.repeat(len - n);
}

// opts: { hull, runway {name,len}, windBase, windMult, ground, to, fragile }
function landing(opts) {
  const runway = opts.runway;
  const len = runway.len;
  const wind0 = opts.windBase * (opts.windMult || 1);

  const st = {
    phase: 'approach',
    alt: 900 * SLOPE,
    d: 900,
    x: 0,
    vx: 0,
    vs: -V_APP * SLOPE,
    v: V_APP,
    pitchCmd: 3,
    pitchVis: 1.5,
    wind: wind0,
    gustT: 0.8,
    inputX: 0,
    inputT: 0,
    inputY: 0,
    brakeT: 0,
    hull: opts.hull,
    fuel: opts.fuel !== undefined ? opts.fuel : 100,
    cond: opts.cond !== undefined ? opts.cond : 100,
    quality: 'good',
    damageHull: 0,
    damageCargo: 0,
    touchAt: 0,
    touchVs: 0,
    maxX: 0,
    msg1: 'Avvicinamento a ' + opts.to + ' — pista ' + runway.name + ' (' + len + ' m).',
    msg2: '←/→ tengono l\'asse · ↑/↓ la prua · W (centro) il flare · SPAZIO i freni.',
    flash: 0,
    shake: 0,
    slow: 0,
    banner: null,
    bannerT: 0,
    overT: 0,
    stopMsg: null,
  };
  if (!eng.isInteractive()) st.msg2 = 'AUTOPILOT: avvicinamento automatico su sentiero di 3 gradi.';

  const frame = eng.newFrame();
  const scn = eng.newScene();

  const camH = () => (st.phase === 'roll' ? 2 : Math.max(1.5, st.alt));

  function dyOf(d) {
    return (scene.FOCAL * camH()) / Math.max(0.5, d);
  }

  function render() {
    const glideErr = st.phase === 'approach' ? st.alt - Math.max(0, st.d) * SLOPE : 0;
    const papi = papiCount();
    const hudA =
      st.phase !== 'approach'
        ? 'RULL ' + zpad(Math.round(st.v * 1.94), 3) + 'kt ' +
          bar(st.v, V_APP, 10) +
          '  MARG ' + zpad(Math.max(0, len + st.d), 4) + 'm  ' +
          (st.brakeT > 0 ? 'FRENI ON' : 'freni (SPA)') +
          '  ASSE ' + tape(st.x)
        : 'ALT ' + zpad(st.alt * 3.28, 4) + 'ft  VS ' + (st.vs >= 0 ? '+' : '-') +
          Math.abs(st.vs).toFixed(1) + '  DIST ' + zpad(Math.max(0, st.d), 4) + 'm' +
          '  SCOST ' + sign(st.x) + 'm  ' + windTag(st.wind);
    const bank = Math.max(-1, Math.min(1, Math.round(st.inputX !== 0 ? st.inputX : st.vx * 0.3)));

    if (bridge.active) {
      bridge.scene({
        phase: 'landing',
        title: 'ATTERRAGGIO — ' + runway.name,
        runPhase: st.phase,
        alt: st.alt,
        d: st.d,
        x: st.x,
        vx: st.vx,
        vs: st.vs,
        v: st.v,
        pitchVis: st.pitchVis,
        wind: st.wind,
        hull: st.hull,
        fuel: st.fuel,
        cond: st.cond,
        runwayLen: len,
        runwayName: runway.name,
        bank,
        flash: st.flash,
        shake: st.shake,
        slow: st.slow,
        banner: st.banner,
        bannerT: st.bannerT,
        quality: st.quality,
        msg1: st.msg1,
        msg2: st.msg2,
        hudA,
        extra:
          st.phase === 'approach'
            ? 'GLIDE ' + (glideErr >= 0 ? '+' : '-') + zpad(Math.abs(glideErr), 3) + 'm ' + papiBar(papi).replace('PAPI ', '')
            : 'MARGINE ' + zpad(Math.max(0, len + st.d), 4) + 'm',
        papi,
        brake: st.brakeT > 0,
        t: Date.now() / 1000,
        sceneW: eng.SCENE_W,
        sceneH: eng.SCENE_H,
      });
      return;
    }

    const hzr = HZ0;
    scn.clear(0, 0, 0);
    scene.drawSky(scn, hzr);
    scene.drawGround(scn, hzr, COLORS.grass);
    if (hzr < eng.SCENE_H - 1) scene.drawHorizonLine(scn, hzr, 5);

    const h = camH();
    const dFar = st.d + len;
    if (dFar > 1 && hzr < eng.SCENE_H - 1) {
      const dyFar = dyOf(dFar);
      const dyNear = st.d > 0 ? dyOf(st.d) : eng.SCENE_H;
      scene.drawRunwayBand(scn, {
        hz: hzr,
        cx: CX,
        x0: st.x,
        camH: h,
        topRow: hzr + dyFar,
        botRow: hzr + dyNear,
        traveled: Math.max(0, -st.d),
      });
      scene.drawEndMarker(scn, {
        hz: hzr,
        cx: CX,
        x0: st.x,
        camH: h,
        dyEnd: dyFar,
        critical: dFar < 180,
        flash: st.flash > 0 && dFar < 180,
      });
      if (st.d > 0) {
        scene.drawThreshold(scn, { hz: hzr, cx: CX, x0: st.x, camH: h, d: st.d });
        if (st.d < 700)
          scene.drawApproachLights(scn, {
            hz: hzr,
            cx: CX,
            x0: st.x,
            camH: h,
            d: st.d,
            rabbit: Math.floor(Date.now() / 140),
          });
        if (st.d < 500)
          scene.drawPAPI(scn, { hz: hzr, cx: CX, x0: st.x, camH: h, d: st.d, alt: st.alt });
        const dIdeal = Math.max(30, st.alt / SLOPE);
        scene.drawGlideMark(scn, hzr, dyOf(dIdeal), COLORS.cyan);
      }
    }

    // strie di vento
    const dir = st.wind >= 0 ? 1 : -1;
    const t = Date.now() / 1000;
    for (let i = 0; i < 5; i++) {
      const base = (i * 17 + t * (6 + Math.abs(st.wind) * 3) * dir) % eng.SCENE_W;
      const x = Math.round(((base % eng.SCENE_W) + eng.SCENE_W) % eng.SCENE_W);
      const y = 1 + (i % 3);
      if (y > hzr - 1) continue;
      for (let k = 0; k < 3; k++) {
        const px = (x + k * dir + eng.SCENE_W) % eng.SCENE_W;
        const c = COLORS.cyanDim;
        scn.set(px, y * 2, c >> 16, (c >> 8) & 0xff, c & 0xff);
      }
    }

    // aereo di dorso
    const maxPy = Math.max(0, eng.SCENE_H - REAR_H);
    const py = Math.min(maxPy, Math.max(0, PLANE_Y + Math.round(st.pitchVis * 0.4)));
    if (py < eng.SCENE_H) {
      scene.drawSprite(scn, S.REAR_PLANE[bank], PLANE_X, py, {});
    }

    if (st.flash > 0) {
      const cc = st.flash > 0.2 ? 0xef233c : 0xf4a261;
      scn.fillRect(0, 0, eng.SCENE_W, eng.SCENE_H * 2, cc >> 16, (cc >> 8) & 0xff, cc & 0xff);
    }

    eng.chrome(frame, {
      title: 'ATTERRAGGIO — ' + runway.name,
      hud: {
        hull: st.hull,
        fuel: st.fuel,
        cond: st.cond,
        extra:
          st.phase === 'approach'
            ? 'GLIDE ' + (glideErr >= 0 ? '+' : '-') + zpad(Math.abs(glideErr), 3) + 'm ' + papiBar(papi).replace('PAPI ', '')
            : 'MARGINE ' + zpad(Math.max(0, len + st.d), 4) + 'm',
      },
      scene: scn,
      msg1: st.msg1,
      msg2: st.msg2,
    });
    eng.drawHudB(frame, hudA.slice(0, MAXLEN), COLORS.hud);
    frame.render();
  }

  function papiCount() {
    if (st.d <= 0 || st.d > 600) return 2;
    const angle = (Math.atan2(Math.max(0.01, st.alt), st.d) * 180) / Math.PI;
    let n = 0;
    for (const a of [2.5, 2.83, 3.17, 3.5]) if (angle > a) n += 1;
    return n;
  }

  function papiBar(n) {
    return 'PAPI ' + '●'.repeat(n) + '○'.repeat(4 - n);
  }

  function damage(h, c) {
    if (h) {
      st.hull = Math.max(0, st.hull - h);
      st.damageHull += h;
    }
    if (c) {
      const cc = opts.fragile ? Math.round(c * 1.5) : c;
      st.cond = Math.max(0, st.cond - cc);
      st.damageCargo += cc;
    }
  }

  function end(reason) {
    if (st.phase === 'over') return;
    st.phase = 'over';
    st.overT = 0;
    if (reason === 'overrun') {
      damage(30, 15);
      st.quality = 'overrun';
      st.msg1 = '*** FINE PISTA IN RULLAGGIO: l\'aereo esce dal fondo corsia. ***';
      st.msg2 = 'Frenata insufficiente per la pista di ' + len + ' m.';
      st.flash = 0.5;
      setBanner('SCORSO LA PISTA', len + ' m non bastati', '#ef233c', 1.8, 0.7, 0.35);
    } else if (reason === 'excursion') {
      damage(18, 10);
      st.quality = 'excursion';
      st.msg1 = '*** USCITA DI PISTA DURANTE IL RULLAGGIO. ***';
      st.msg2 = 'Il carrello è nell\'erba: revisione in hangar.';
      st.flash = 0.4;
      setBanner('USCITA DI PISTA', 'il carrello è nell\'erba', '#f4a261', 1.8, 0.6, 0.35);
    } else if (reason === 'long') {
      damage(25, 15);
      st.quality = 'long';
      st.msg1 = '*** ATTERRAGGIO OLTRE LA SOGLIA: pista bruciata. ***';
      st.msg2 = 'Sei atterrato troppo lungo: poco spazio per fermarti.';
      st.flash = 0.4;
      setBanner('OLTRE LA SOGLIA', 'poco spazio per fermarti', '#f4a261', 1.8, 0.5, 0.35);
    } else if (reason === 'crash') {
      damage(45, 35);
      st.quality = 'veryhard';
      st.msg1 = '*** IMPATTO SECCO: atterraggio durissimo. ***';
      st.msg2 = 'Aereo ammaccato, carico rovinato.';
      st.flash = 0.6;
      setBanner('IMPATTO SECCO', 'atterraggio durissimo', '#ef233c', 2.0, 0.9, 0.4);
    } else if (reason === 'stopped') {
      const margine = Math.max(0, len + st.d);
      const soft = st.quality === 'good' || st.quality === 'perfect';
      if (soft && st.touchAt > len * 0.6) {
        st.quality = 'long';
        damage(10, 6);
      } else if (soft && margine < 30) {
        st.quality = 'hard';
        damage(5, 3);
      }
      st.msg1 =
        'A terra a ' + runway.name + ': ' + qualityLabel(st.quality) +
        ' (touchdown a ' + Math.round(st.touchAt) + ' m).';
      st.msg2 = 'Fermato con ' + Math.round(margine) + ' m di margine. Carico al ' + Math.round(st.cond) + '%.';
      setBanner(
        qualityLabel(st.quality),
        'fermato con ' + Math.round(margine) + ' m di margine',
        soft ? '#7fd787' : '#ffd866',
        1.7,
        0.08,
        0.4
      );
      st.flash = 0;
    }
  }

  function qualityLabel(q) {
    return (
      {
        perfect: 'ATTERRAGGIO PERFETTO',
        good: 'BUON ATTERRAGGIO',
        hard: 'ATTERRAGGIO DURO',
        veryhard: 'ATTERRAGGIO MOLTO DURO',
        excursion: 'USCITA DI PISTA',
        short: 'ATTERRATO CORTO',
        long: 'ATTERRATO LUNGO',
        overrun: 'SCORSO LA PISTA',
      }[q] || q.toUpperCase()
    );
  }

  function touchdown(vs, off) {
    st.phase = 'roll';
    st.touchVs = vs;
    st.touchAt = Math.max(0, off);
    st.v = V_APP * 0.97;
    const av = Math.abs(vs);
    const lat = Math.abs(st.x);
    if (av >= 5) {
      end('crash');
      return;
    }
    if (lat > 11) {
      st.quality = 'excursion';
      damage(14, 8);
    } else if (av < 1.2) st.quality = 'perfect';
    else if (av < 2.2) st.quality = 'good';
    else if (av < 3.6) {
      st.quality = 'hard';
      damage(8, 5);
    } else {
      st.quality = 'veryhard';
      damage(18, 12);
    }
    if (st.quality !== 'excursion' && lat > 6) {
      damage(6, 4);
      st.quality = 'hard';
    }
    st.msg1 =
      'TOUCHDOWN a ' + Math.round(st.touchAt) + ' m — ' + qualityLabel(st.quality) +
      ' (vs ' + vs.toFixed(1) + ' m/s).';
    st.msg2 = 'FRENI: SPAZIO, ▼ o il tasto centrale — e tieni l\'asse con ←/→. Margine ' +
      Math.round(len + st.d) + ' m.';
    st.flash = st.quality === 'perfect' || st.quality === 'good' ? 0 : 0.25;

    // Cinematica: banner grande + rallentatore sul tocco.
    const soft = st.quality === 'perfect' || st.quality === 'good';
    setBanner(
      qualityLabel(st.quality),
      'TOUCHDOWN a ' + Math.round(st.touchAt) + ' m · vs ' + vs.toFixed(1) + ' m/s',
      soft ? '#7fd787' : st.quality === 'excursion' ? '#f4a261' : '#ff8b6b',
      soft ? 2.0 : 1.6,
      soft ? 0.12 : 0.55,
      soft ? 0.7 : 0.4
    );
  }

  function onKey(key) {
    if (key.name === 'left' || key.name === 'a') {
      st.inputX = -1;
      st.inputT = 0.34;
    } else if (key.name === 'right' || key.name === 'd') {
      st.inputX = 1;
      st.inputT = 0.34;
    } else if (key.name === 'up') {
      if (st.phase === 'approach') st.pitchCmd = Math.max(-3, st.pitchCmd - 1.7);
    } else if (key.name === 'w') {
      // Tasto centrale del pad: flare in avvicinamento, freni in rullaggio.
      if (st.phase === 'approach') st.pitchCmd = Math.max(-3, st.pitchCmd - 1.7);
      else st.brakeT = 0.45;
    } else if (key.name === 'down' || key.name === 's') {
      if (st.phase === 'approach') st.pitchCmd = Math.min(6.5, st.pitchCmd + 1.7);
      else st.brakeT = 0.45;
    } else if (key.name === 'space') {
      if (st.phase === 'roll') st.brakeT = 0.45;
      else st.pitchCmd = Math.max(-3, st.pitchCmd - 1.5);
    }
  }

  function autopilot(dt) {
    if (st.phase === 'approach') {
      const ideal = Math.max(0, st.d) * SLOPE;
      let want;
      if (st.d < 120) want = Math.max(-2.2, Math.min(-0.35, -(st.alt - 1.0) / 2.5));
      else want = -V_APP * SLOPE + (st.alt - ideal) / 4;
      st.pitchCmd = Math.max(-3, Math.min(6.5, -want / 1.05));
      st.inputX = Math.max(-1, Math.min(1, -st.x * 0.3 - st.vx * 0.8));
      st.inputT = 0.3;
    } else if (st.phase === 'roll') {
      st.brakeT = 0.45;
      st.inputX = Math.max(-1, Math.min(1, -st.x * 0.3 - st.vx * 0.8));
      st.inputT = 0.3;
    }
  }

  function setBanner(text, sub, color, life, shake, slow) {
    st.banner = { text, sub: sub || '', color: color || '#ffd866' };
    st.bannerT = life || 1.6;
    st.shake = shake || 0;
    st.slow = slow || 0;
  }

  function onTick(dtReal) {
    // Rallentatore cinematografico al tocco: tutto il mondo rallenta.
    let dt = dtReal;
    if (st.slow > 0) {
      st.slow = Math.max(0, st.slow - dtReal);
      dt = dtReal * 0.35;
    }
    st.shake = Math.max(0, st.shake - dtReal);
    st.bannerT = Math.max(0, st.bannerT - dtReal);
    if (st.bannerT <= 0) st.banner = null;
    st.flash = Math.max(0, st.flash - dt);
    st.inputT -= dt;
    if (st.inputT <= 0) st.inputX = 0;
    st.gustT -= dt;
    if (st.gustT <= 0) {
      st.gustT = 0.9 + Math.random() * 1.5;
      st.wind = wind0 * (0.35 + Math.random() * 1.6);
      st.vx += (Math.random() - 0.5) * 2.4;
      if (st.phase === 'approach') {
        st.vs += (Math.random() - 0.5) * 1.3;
        if (st.msg1.indexOf('FLARE') < 0) {
          st.msg1 = 'SCARICA DI VENTO sull\'ala: ←/→ tengono l\'asse, ↑/↓ la prua.';
          st.msg2 = 'PAPI ' + '●'.repeat(papiCount()) + '○'.repeat(4 - papiCount()) +
            ' — 2 bianche e 2 rosse = sentiero giusto.';
        }
      }
    }

    if (st.phase === 'over') {
      st.overT += dt;
      return st.overT > 1.5;
    }

    if (!eng.isInteractive()) autopilot(dt);

    if (st.phase === 'approach') {
      const targetVs = -st.pitchCmd * 1.05;
      st.vs += (targetVs - st.vs) * Math.min(1, 3.4 * dt);
      st.alt += st.vs * dt;
      st.d -= st.v * dt;
      st.pitchVis += (st.pitchCmd * 0.55 - st.pitchVis) * Math.min(1, 3.6 * dt);
      st.fuel = Math.max(0, st.fuel - dt * 0.35);

      st.vx += (st.inputX * STEER + st.wind * WIND_K) * dt;
      st.vx *= Math.exp(-1.45 * dt);
      st.x += st.vx * dt;
      st.maxX = Math.max(st.maxX, Math.abs(st.x));

      if (st.d < 140 && st.alt < 12 && st.msg1.indexOf('FLARE') < 0) {
        st.msg1 = 'FLARE: tira su con ↑ o con il tasto centrale (W).';
        st.msg2 = 'PAPI ' + '●'.repeat(papiCount()) + '○'.repeat(4 - papiCount()) +
          ' — 2 bianche e 2 rosse = sentiero giusto.';
      }
      if (st.d < -len + 20 && st.alt > 1.5) {
        end('long');
      } else if (st.alt <= 1.3) {
        const off = st.d <= 0 ? -st.d : 0;
        if (st.d > 40) {
          st.quality = 'short';
          damage(15, 8);
          st.msg1 = '*** ATTERRATO PRIMA DELLA SOGLIA. ***';
          st.msg2 = 'Erba e cordoli: danno al carrello.';
          st.touchAt = 0;
          st.phase = 'roll';
          st.v = V_APP * 0.9;
          st.flash = 0.4;
          setBanner('ATTERRATO CORTO', 'cordoli e erba: danno al carrello', '#ff8b6b', 1.6, 0.6, 0.35);
        } else {
          touchdown(st.vs, off);
        }
      } else if (Math.abs(st.x) > MAX_LATERAL) {
        end('excursion');
      }
    } else if (st.phase === 'roll') {
      st.brakeT -= dt;
      const decel = 4.6 + (st.brakeT > 0 ? 4.6 : 0);
      st.v = Math.max(0, st.v - decel * dt);
      st.d -= st.v * dt;
      st.pitchVis += (0.4 - st.pitchVis) * Math.min(1, 3 * dt);
      st.fuel = Math.max(0, st.fuel - dt * 0.1);
      st.vx += (st.inputX * STEER * 0.75 + st.wind * WIND_K * 0.7) * dt;
      st.vx *= Math.exp(-1.9 * dt);
      st.x += st.vx * dt;
      st.maxX = Math.max(st.maxX, Math.abs(st.x));

      if (st.v <= 0.6) end('stopped');
      else if (len + st.d <= 0) end('overrun');
      else if (Math.abs(st.x) > MAX_LATERAL) end('excursion');
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
    touchAt: Math.round(st.touchAt),
    touchVs: Number(st.touchVs.toFixed(1)),
    margin: Math.max(0, Math.round(len + st.d)),
    stopped: st.v <= 0.6,
    maxX: Math.round(st.maxX),
  }));
}

module.exports = { landing };
