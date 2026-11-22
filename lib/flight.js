'use strict';

const ui = require('./ui');
const { takeoff } = require('./takeoff');
const { cruise } = require('./cruise');
const { landing } = require('./landing');

// Orchestratore del volo: decollo -> crociera -> scelta aeroporto -> atterraggio.
// opts: { hull, fragile, cargoWeight, level, dep, chooseArrival, autopilot }
async function fly(opts) {
  const level = opts.level;
  const dep = opts.dep;
  const windBase = level.wind || 4;
  const windMult = dep.windMult || 1;

  const to = await takeoff({
    hull: opts.hull,
    runway: dep,
    windBase,
    windMult,
    cargoWeight: opts.cargoWeight,
    ground: level.ground,
    to: level.to,
  });
  if (to.hull <= 0) {
    return { hull: 0, fuel: to.fuel, cond: to.cond, reason: 'hull', takeoff: to };
  }

  const arrList = (level.arr || []).map(
    (a) => a.name + ' — ' + a.len + ' m' + (a.note ? ' · ' + a.note : '')
  );
  const cr = await cruise({
    hull: to.hull,
    fuel: to.fuel,
    cond: to.cond,
    fragile: opts.fragile,
    duration: level.flight.duration,
    rate: level.flight.rate,
    windBase,
    windMult,
    biome: level.biome,
    from: level.from,
    to: level.to,
    destFee: level.feePct * 100,
    destPolice: level.police,
    distanceKm: level.distanceKm,
    arrHint: arrList.join('  |  '),
  });
  if (cr.reason !== 'landed') {
    return {
      hull: cr.hull,
      fuel: cr.fuel,
      cond: cr.cond,
      reason: cr.reason,
      takeoff: to,
      cruise: cr,
    };
  }

  ui.clear();
  const arrIdx = opts.chooseArrival ? await opts.chooseArrival(arrList) : 0;
  const arr = (level.arr || [dep])[Math.max(0, Math.min(arrList.length - 1, arrIdx))];

  const la = await landing({
    hull: cr.hull,
    fuel: cr.fuel,
    cond: cr.cond,
    fragile: opts.fragile,
    runway: arr,
    windBase,
    windMult: arr.windMult || windMult,
    ground: level.ground,
    to: level.to,
  });

  return {
    hull: la.hull,
    fuel: la.fuel,
    cond: la.cond,
    reason: la.hull <= 0 ? 'crash' : 'landed',
    takeoff: to,
    cruise: cr,
    landing: la,
    arrival: arr,
    departure: dep,
  };
}

// Moltiplicatore di tassa legato alla qualita' di atterraggio.
function landingMultiplier(quality) {
  switch (quality) {
    case 'perfect':
      return 0.95;
    case 'good':
      return 1.0;
    case 'hard':
      return 1.08;
    case 'veryhard':
      return 1.15;
    default:
      return 1.25;
  }
}

module.exports = { fly, landingMultiplier };
