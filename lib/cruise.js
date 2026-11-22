'use strict';

const { COLORS } = require('./render');
const S = require('./sprites');
const scene = require('./scene');
const eng = require('./engine');

const PLANE_X = 8;
const PLANE_H = 5;
const MAX_ROW = eng.SCENE_H - PLANE_H;
const MAXLEN = eng.W - 3;
const HZ = 5;

const TYPES = {
  bird: { label: 'STORNO DI UCCELLI', hull: 5, cargo: 15, fuel: 0, weight: 0.4 },
  storm: { label: 'NUBE DI TEMPESTA', hull: 12, cargo: 7, fuel: -6, weight: 0.24 },
  tank: { label: 'TANICA DI RISERVA', hull: 0, cargo: 0, fuel: 25, weight: 0.2 },
  mount: { label: 'CRESTA MONTUOSA', hull: 30, cargo: 5, fuel: 0, weight: 0.16 },
};

const pad = (n, w) => String(Math.round(n)).padStart(w, ' ');
const zpad = (n, w) => String(Math.max(0, Math.round(n))).padStart(w, '0');
const mmss = (s) => zpad(Math.floor(s / 60), 2) + ':' + zpad(s % 60, 2);

function planeMask() {
  const cells = [];
  const layers = [S.PLANE_SIDE, S.PLANE_SIDE_TAIL, S.PLANE_SIDE_WINDOWS];
  for (const spr of layers) {
    for (let r = 0; r < spr.rows.length; r++) {
      for (let c = 0; c < spr.rows[r].length; c++) {
        if (spr.rows[r][c] !== ' ') cells.push({ x: c, y: r });
      }
    }
  }
  for (const p of S.PROP_FRAMES) for (const r of p.rows) cells.push({ x: p.x, y: r });
  const seen = new Set();
  return cells.filter((c) => {
    const k = c.x + ',' + c.y;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function makeObstacle(type, col, row) {
  const t = TYPES[type];
  let spr;
  let cells;
  if (type === 'bird') {
    spr = Math.random() < 0.5 ? S.BIRD : S.BIRD_FLOCK;
    cells = [];
    spr.rows.forEach((line, r) => {
      for (let c = 0; c < line.length; c++) if (line[c] !== ' ') cells.push({ dx: c, dy: r });
    });
  } else if (type === 'storm') {
    spr = S.CLOUD_STORM;
    cells = [];
    spr.rows.forEach((line, r) => {
      for (let c = 0; c < line.length; c++) if (line[c] !== ' ') cells.push({ dx: c, dy: r });
    });
  } else if (type === 'tank') {
    spr = S.FUEL_TANK;
    cells = [];
    spr.rows.forEach((line, r) => {
      for (let c = 0; c < line.length; c++) if (line[c] !== ' ') cells.push({ dx: c, dy: r });
    });
  } else {
    spr = S.MOUNTAINS[Math.floor(Math.random() * S.MOUNTAINS.length)];
    cells = [];
    spr.rows.forEach((line, r) => {
      for (let c = 0; c < line.length; c++) if (line[c] !== ' ') cells.push({ dx: c, dy: r });
    });
  }
  return { type, col, row, spr, cells, label: t.label, ...t, dead: false };
}

// opts: { hull, fragile, duration, rate, windBase, windMult, biome,
//         from, to, destFee, destPolice, arrivalRunway, distanceKm }
function cruise(opts) {
  const wind0 = (opts.windBase || 0) * (opts.windMult || 1);
  const dur = Math.max(4, opts.duration || 12);
  const spawnRate = Math.max(0.6, Math.min(1.4, (opts.rate || 0.3) * 2.2));
  const burn = 100 / (dur * 1.35);

  const st = {
    hull: opts.hull,
    fuel: opts.fuel !== undefined ? opts.fuel : 100,
    cond: opts.cond !== undefined ? opts.cond : 100,
    y: 4,
    vy: 0,
    windUp: 0,
    windT: 1,
    wind: wind0,
    t: 0,
    obstacles: [],
    clouds: [],
    decor: [],
    nextSpawn: 0.7,
    msg1: 'Crociera verso ' + opts.to + '. Manovra con ↑/↓ (W/S) per evitare gli ostacoli.',
    msg2: 'Le taniche verdi (+) riforniscono: il carburante brucia davvero.',
    flash: 0,
    shake: 0,
    hits: 0,
    tanks: 0,
    radio: 0,
    reason: null,
    overT: 0,
    propT: 0,
    propI: 0,
    trail: [],
  };

  if (!eng.isInteractive()) {
    st.msg2 = 'AUTOPILOT: pilota automatico in crociera.';
  }

  const mask = planeMask();
  const frame = eng.newFrame();
  const scn = eng.newScene();
  const terrain = S.TERRAIN[opts.biome] || S.TERRAIN.land;

  const RADIO = [
    {
      at: 0.1,
      m1: 'RADIO: rotta ' + opts.from + ' → ' + opts.to + ' (' + opts.distanceKm + ' km).',
      m2: 'Dogana di ' + opts.to + ': livello ' + opts.destPolice + '/5, tassa ' + opts.destFee + '%.',
    },
    {
      at: 0.3,
      m1: 'RADIO: ricorda — risposte esatte in dogana = sconto sulle tasse.',
      m2: 'Il consulente conta quanto il pilota: prepara i documenti.',
    },
    {
      at: 0.55,
      m1: 'RADIO: meteo in arrivo: vento ' + Math.round(Math.abs(st.wind) * 1.94) + ' kt.',
      m2: 'Piste in arrivo: ' + (opts.arrHint || opts.to) + '.',
    },
    {
      at: 0.78,
      m1: 'RADIO: discesa imminente. Carico: ' + Math.round(st.cond) + '%.',
      m2: 'All\'atterraggio conta la morbidezza: atterra morbido, paga meno tassa.',
    },
    {
      at: 0.93,
      m1: 'RADIO: contatto visivo con ' + opts.to + '.',
      m2: 'Prepara il carrello — la pista arriva presto.',
    },
  ];

  function spawnClouds() {
    for (let i = 0; i < 9; i++) {
      const layer = i % 3;
      const spr = layer === 0 ? S.CLOUD_FAR : layer === 1 ? S.CLOUD_MID : S.CLOUD_BIG;
      st.clouds.push({
        x: Math.random() * eng.SCENE_W,
        y: layer === 2 ? 1 + Math.floor(Math.random() * 4) : Math.floor(Math.random() * 4),
        spr,
        v: [3, 6, 10][layer],
        layer,
      });
    }
    for (let i = 0; i < 8; i++) {
      const far = Math.random() < 0.45;
      st.decor.push({
        x: Math.random() * eng.SCENE_W,
        kind: far ? 'mount' : Math.random() < 0.5 ? 'mount' : 'tower',
        v: far ? 4 + Math.random() * 2 : 9 + Math.random() * 5,
        h: 2 + Math.floor(Math.random() * 3),
        base: far ? HZ + 2 : eng.SCENE_H - 1,
        far,
      });
    }
  }
  spawnClouds();

  function occupied() {
    const px = Math.round(PLANE_X);
    const py = Math.round(st.y);
    return mask.map((c) => ({ x: px + c.x, y: py + c.y }));
  }

  function hitObstacle(o) {
    const dmg = TYPES[o.type];
    st.hits += 1;
    const parts = [];
    if (dmg.hull) {
      const h = dmg.hull;
      st.hull = Math.max(0, st.hull - h);
      parts.push('integrità -' + h);
    }
    if (dmg.cargo) {
      const c = opts.fragile ? Math.round(dmg.cargo * 1.5) : dmg.cargo;
      st.cond = Math.max(0, st.cond - c);
      parts.push('carico -' + c);
    }
    if (dmg.fuel) {
      st.fuel = Math.max(0, Math.min(100, st.fuel + dmg.fuel));
      parts.push('carburante ' + (dmg.fuel > 0 ? '+' : '') + dmg.fuel);
      if (dmg.fuel > 0) st.tanks += 1;
    }
    st.msg1 = '>> ' + o.label + ': ' + parts.join(' | ') + ' <<';
    st.msg2 = dmg.fuel
      ? 'Tanica presa a bordo. Rotta invariata.'
      : 'Evita il prossimo: ' + (o.type === 'mount' ? 'tieniti in quota' : 'muoviti su o giù.');
    st.flash = dmg.hull ? 0.45 : 0.12;
    st.shake = dmg.hull ? 0.4 : 0;
    o.dead = true;
  }

  function render() {
    scn.clear(0);
    scene.drawSky(scn, HZ);
    scene.drawSkyDecor(scn, HZ);
    // sole/nuvole dietro
    for (const c of st.clouds) {
      const x = Math.round(c.x);
      if (x > eng.SCENE_W + 30) continue;
      S.drawSprite(scn, c.spr, x - Math.round(c.spr.rows[0].length / 2), c.y, {});
    }
    // terreno
    scn.fill(0, HZ + 1, eng.SCENE_W, 1, ' ', 0, terrain.surface);
    scn.fill(0, HZ + 2, eng.SCENE_W, 2, ' ', 0, terrain.feature);
    scn.fill(0, HZ + 4, eng.SCENE_W, eng.SCENE_H - HZ - 4, ' ', 0, terrain.deep);
    // orizzonte con profilo
    scene.drawHorizonLine(scn, HZ, 11);
    // sagome sul terreno (parallasse)
    for (const d of st.decor) {
      const x = Math.round(d.x);
      if (x < -12 || x > eng.SCENE_W + 12) continue;
      if (d.kind === 'mount') {
        const m = S.MOUNTAINS[d.h % S.MOUNTAINS.length];
        S.drawSprite(scn, m, x, d.base - m.rows.length + 1, d.far ? { fg: 244 } : {});
      } else {
        for (let r = 0; r < d.h; r++)
          scn.set(x, d.base - r, r === d.h - 1 ? '▀' : '█', d.far ? 245 : 240, terrain.deep);
        scn.set(x, d.base - d.h, '·', 238, 0);
      }
    }
    // ostacoli
    for (const o of st.obstacles) {
      if (o.dead) continue;
      const x = Math.round(o.col);
      const y = Math.round(o.row);
      S.drawSprite(scn, o.spr, x, y, {});
      if (o.type === 'tank') {
        for (let r = 0; r < o.spr.rows.length; r++)
          for (let c = 0; c < o.spr.rows[r].length; c++)
            if (o.spr.rows[r][c] !== ' ') scn.set(x + c, y + r, '+', 46, 0);
      }
      if (o.type === 'storm') {
        for (let i = 0; i < 3; i++) {
          const lx = x + 2 + i * 7;
          const ly = y + 1 + ((Math.floor(Date.now() / 90) + i) % 3);
          if ((Math.floor(Date.now() / 140) + i) % 3 === 0) scn.set(lx, ly, '/', 226, 0);
        }
      }
    }
    // scia dietro l'aereo
    for (let i = 0; i < st.trail.length; i++) {
      const t = st.trail[i];
      scn.set(Math.round(t.x), Math.round(t.y), i % 2 ? '·' : '‒', 251, 0);
    }
    // aereo di lato
    const shake = st.shake > 0 ? (Math.random() < 0.5 ? -1 : 1) : 0;
    const py = Math.round(st.y) + shake;
    const px = PLANE_X;
    S.drawSprite(scn, S.PLANE_SIDE, px, py, {});
    S.drawSprite(scn, S.PLANE_SIDE_TAIL, px, py, {});
    S.drawSprite(scn, S.PLANE_SIDE_WINDOWS, px, py, {});
    const p = S.PROP_FRAMES[st.propI % S.PROP_FRAMES.length];
    for (const r of p.rows) scn.set(px + p.x, py + r, p.ch, 244, 0);

    if (st.flash > 0) {
      const ch = st.flash > 0.2 ? '▓' : '▒';
      scn.fill(0, 0, eng.SCENE_W, eng.SCENE_H, ch, 0, st.flash > 0.2 ? 196 : 208);
    }

    const eta = Math.max(0, dur - st.t);
    const progress = Math.min(1, st.t / dur);
    const hudB =
      pad(Math.round(410 + Math.sin(st.t) * 6), 3) + 'kt ' +
      pad(24000 - Math.floor(progress * 90) * 100, 5) + 'ft ' +
      'VENTO ' + (st.wind >= 0 ? '↘' : '↙') + pad(Math.abs(st.wind) * 1.94, 2) + 'kt ' +
      'TANICHE ' + st.tanks + '  HIT ' + st.hits +
      '  DEST ' + opts.to + ' ' + opts.destFee + '%';

    eng.chrome(frame, {
      title: 'CROCIERA — ' + opts.from + ' → ' + opts.to,
      hud: {
        hull: st.hull,
        fuel: st.fuel,
        cond: st.cond,
        extra: 'Rotta ' + pad(progress * 100, 3) + '% ETA ' + mmss(Math.ceil(eta)),
      },
      scene: scn,
      msg1: st.msg1,
      msg2: st.msg2,
    });
    eng.drawHudB(frame, hudB.slice(0, MAXLEN), st.flash > 0 ? COLORS.amber : COLORS.hud);
    frame.render();
  }

  function onKey(key) {
    if (key.name === 'up' || key.name === 'w') st.vy -= 3.4;
    else if (key.name === 'down' || key.name === 's') st.vy += 3.4;
  }

  function pickType() {
    const r = Math.random();
    let acc = 0;
    for (const [k, v] of Object.entries(TYPES)) {
      acc += v.weight;
      if (r <= acc) return k;
    }
    return 'bird';
  }

  function autopilot(dt) {
    const px = PLANE_X;
    const speed = 14;
    const T = 2.8;
    const dangerRows = new Set();
    for (const o of st.obstacles) {
      if (o.dead || o.type === 'tank') continue;
      const timeTo = (o.col - px) / speed;
      if (timeTo < -0.3 || timeTo > T) continue;
      for (const c of o.cells) dangerRows.add(Math.round(o.row + c.dy));
    }
    let target = null;
    if (st.fuel < 40) {
      const tank = st.obstacles.find(
        (o) => !o.dead && o.type === 'tank' && o.col > px && o.col < px + 46
      );
      if (tank) target = Math.max(0, Math.min(MAX_ROW, Math.round(tank.row) - 1));
    }
    if (target === null) {
      const cur = Math.round(st.y);
      let best = cur;
      let bestDist = Infinity;
      for (let cand = 0; cand <= MAX_ROW; cand++) {
        let ok = true;
        for (let r = cand; r <= cand + PLANE_H - 1; r++) {
          if (dangerRows.has(r)) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        const dist = Math.abs(cand - cur);
        if (dist < bestDist) {
          bestDist = dist;
          best = cand;
        }
      }
      target = best;
    }
    const want = Math.max(-6, Math.min(6, (target - st.y) * 3.2));
    st.vy += (want - st.vy) * Math.min(1, 6 * dt);
  }

  function onTick(dt) {
    st.t += dt;
    st.flash = Math.max(0, st.flash - dt);
    st.shake = Math.max(0, st.shake - dt);
    st.propT += dt;
    if (st.propT > 0.09) {
      st.propT = 0;
      st.propI += 1;
    }

    if (st.reason) {
      st.overT += dt;
      return st.overT > 1.4;
    }

    st.windT -= dt;
    if (st.windT <= 0) {
      st.windT = 1.6 + Math.random() * 2.4;
      st.wind = wind0 * (0.5 + Math.random() * 1.1);
      st.windUp = (Math.random() - 0.5) * 1.6;
    }

    if (!eng.isInteractive()) autopilot(dt);

    st.vy += st.windUp * dt * 6;
    st.vy *= Math.exp(-2.4 * dt);
    st.y += st.vy * dt;
    if (st.y < 0) {
      st.y = 0;
      st.vy = Math.max(0, st.vy);
    } else if (st.y > MAX_ROW) {
      st.y = MAX_ROW;
      st.vy = Math.min(0, st.vy);
    }

    st.fuel = Math.max(0, st.fuel - burn * dt);
    if (st.fuel <= 0) {
      st.reason = 'fuel';
      st.msg1 = '*** CARBURANTE ESAURITO: motore in avaria. ***';
      st.msg2 = 'Sei costretto a un atterraggio di emergenza.';
      st.flash = 0.5;
    }
    if (st.hull <= 0) {
      st.reason = 'hull';
      st.msg1 = '*** INTEGRITA' + '\u00C0' + ' CRITICA: struttura ceduta. ***';
      st.msg2 = 'L\'aereo non risponde piu\' ai comandi.';
      st.flash = 0.5;
    }
    if (st.cond <= 0) {
      st.reason = 'cargo';
      st.msg1 = '*** CARICO DISTRUTTO: nulla da consegnare. ***';
      st.msg2 = 'Le casse sono un relitto umido.';
      st.flash = 0.4;
    }

    // scia
    st.trail.push({ x: PLANE_X - 1, y: st.y + 2.4 });
    while (st.trail.length > 16) st.trail.shift();
    for (const t of st.trail) t.x -= 12 * dt;

    // nuvole / sagome
    for (const c of st.clouds) {
      c.x -= c.v * dt;
      if (c.x < -30) {
        c.x = eng.SCENE_W + 20 + Math.random() * 30;
        c.y = c.layer === 2 ? 1 + Math.floor(Math.random() * 4) : Math.floor(Math.random() * 4);
      }
    }
    for (const d of st.decor) {
      d.x -= d.v * dt;
      if (d.x < -14) d.x = eng.SCENE_W + 6 + Math.random() * 20;
    }

    // ostacoli
    const speed = 14;
    for (const o of st.obstacles) o.col -= speed * dt;
    st.obstacles = st.obstacles.filter((o) => !o.dead && o.col > -34);

    st.nextSpawn -= dt;
    if (st.nextSpawn <= 0) {
      st.nextSpawn = (0.9 + Math.random() * 1.1) / spawnRate;
      const type = pickType();
      const row =
        type === 'mount'
          ? eng.SCENE_H - S.MOUNTAINS[0].rows.length
          : Math.floor(Math.random() * (MAX_ROW + 1));
      st.obstacles.push(makeObstacle(type, eng.SCENE_W + 4, row));
    }

    // collisioni
    const cells = occupied();
    for (const o of st.obstacles) {
      if (o.dead) continue;
      const ox = Math.round(o.col);
      const oy = Math.round(o.row);
      let touch = false;
      for (const oc of o.cells) {
        const x = ox + oc.dx;
        const y = oy + oc.dy;
        for (const pc of cells) {
          if (pc.x === x && pc.y === y) {
            touch = true;
            break;
          }
        }
        if (touch) break;
      }
      if (touch) hitObstacle(o);
    }

    // radio
    const progress = st.t / dur;
    while (st.radio < RADIO.length && progress >= RADIO[st.radio].at) {
      const r = RADIO[st.radio];
      st.radio += 1;
      if (st.hits === 0 || st.radio > 2) {
        st.msg1 = r.m1;
        st.msg2 = r.m2;
      }
    }

    if (progress >= 1 && !st.reason) {
      st.reason = 'landed';
      st.msg1 = 'Fine crociera: discesa verso ' + opts.to + '.';
      st.msg2 = 'Carico al ' + Math.round(st.cond) + '%, carburante al ' + Math.round(st.fuel) + '%.';
    }
    return false;
  }

  return eng.runLoop({ onTick, onKey, onRender: render }).then(() => ({
    hull: st.hull,
    fuel: st.fuel,
    cond: st.cond,
    reason: st.reason || 'landed',
    hits: st.hits,
    tanks: st.tanks,
    duration: Math.round(st.t),
  }));
}

module.exports = { cruise };
