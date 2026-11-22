#!/usr/bin/env node
'use strict';

const readline = require('readline');
const ui = require('./lib/ui');
const { SPONSORS, QUESTIONS, LEVELS } = require('./lib/data');
const { fly, landingMultiplier } = require('./lib/flight');

const TOTAL = LEVELS.length;

function restoreTerm() {
  try {
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
  } catch (e) {}
  try {
    process.stdout.write('\x1b[?25h');
  } catch (e) {}
}
process.on('exit', restoreTerm);

function contractValue(sponsor, cargo, market) {
  let v = cargo.value * market;
  if (sponsor.revenue) v *= sponsor.revenue;
  if (sponsor.coffee && cargo.coffee) v *= sponsor.coffee;
  return Math.round(v);
}

const QUALITY_LABEL = {
  perfect: 'PERFETTO',
  good: 'BUONO',
  hard: 'DURO',
  veryhard: 'MOLTO DURO',
  excursion: 'USCITA DI PISTA',
  short: 'CORTO',
  long: 'LUNGO',
  overrun: 'SCORSO LA PISTA',
  stall: 'STALLO IN DECOLLO',
  crash: 'STRUTTURA CEDUTA',
  ok: 'NORMALE',
};

function labelOf(q) {
  return QUALITY_LABEL[q] || '—';
}

async function quizPhase(rl, level) {
  ui.section('DOCUMENTAZIONE - DOGANA DI ' + level.to);
  console.log(ui.dim('Rispondi bene e otterrai uno sconto sulle tasse di destinazione.'));
  let ok = 0;
  let ko = 0;
  for (const qi of level.quiz) {
    const q = QUESTIONS[qi];
    const idx = await ui.menu(rl, q.text, q.opts);
    if (idx === q.ans) {
      ok += 1;
      console.log(ui.good('  Esatto!'));
    } else {
      ko += 1;
      console.log(ui.bad('  Sbagliato. Era: ' + q.opts[q.ans]));
    }
    console.log(ui.dim('  ' + q.why) + ui.RESET);
    await ui.sleep(250);
  }
  const mult = Math.max(0.5, Math.min(1.5, 1 + (ko - ok) * 0.25));
  const label =
    mult < 1
      ? ui.good(`SCONTO consulente: tassa x${mult.toFixed(2)}`)
      : mult > 1
        ? ui.warn(`ERRORE documentale: tassa x${mult.toFixed(2)}`)
        : ui.info('Documentazione neutra: tassa x1.00');
  console.log('\n' + label + '\n');
  await ui.sleep(400);
  return mult;
}

async function customsPhase(rl, state, level, ctx) {
  ui.section('DOGANA DI ' + level.to + ' - ' + level.policeLabel);
  const police = ctx.police;
  console.log(
    'Livello polizia di frontiera: ' +
      ui.hot('■'.repeat(police)) +
      ui.dim('□'.repeat(5 - police)) +
      ` (${police}/5)   Ricercato: ${ui.stars(state.wanted)}`
  );

  let bribeCut = 0;
  const bribeCost = level.bribeCost;
  if (state.cash >= bribeCost) {
    const a = await ui.ask(
      rl,
      ui.warn(`L'agente è... ricettibile. Mazzetta da ${bribeCost} €? (s/N) `)
    );
    if ((a || '').toLowerCase() === 's') {
      state.cash -= bribeCost;
      if (Math.random() < 0.18) {
        const fine = Math.round(700 * (state.sponsor.fine || 1));
        state.cash -= fine;
        state.wanted = Math.min(5, state.wanted + 1);
        console.log(
          ui.bad(
            `L'agente era onesto! Ti denuncia: -${bribeCost} € di mazzetta e -${fine} € di multa.`
          )
        );
      } else {
        bribeCut = level.bribeCut;
        console.log(ui.good(`Accettata. Rischio doganale ridotto di ${bribeCut} punti.`));
      }
    }
  }

  const riskOf = (mode) => {
    const add = { undervalue: 14, contraband: 24, black: 34 }[mode] || 0;
    return Math.min(95, police * 7 + state.wanted * 6 + add - bribeCut);
  };

  const halfFee = Math.round(ctx.fee / 2);
  const choice = await ui.menu(rl, 'COME DICHIARI IL CARICO?', [
    `Dichiarazione regolare — tassa ${ctx.fee} € — rischio 0%`,
    `Sottostima la fattura — tassa ${halfFee} € — rischio ~${riskOf('undervalue')}%`,
    `Contrabbando: ${level.smuggle.label} — +${level.smuggle.gain} € — rischio ~${riskOf('contraband')}%`,
    `Vendita al nero — tassa 0 €, +10% sul ricavo — rischio ~${riskOf('black')}%`,
  ]);
  const mode = ['honest', 'undervalue', 'contraband', 'black'][choice];

  let feePaid = ctx.fee;
  let illicit = 0;
  let revenue = ctx.revenue;
  if (mode === 'undervalue') {
    feePaid = halfFee;
    illicit = ctx.fee - halfFee;
  } else if (mode === 'contraband') {
    illicit = level.smuggle.gain;
  } else if (mode === 'black') {
    const premium = Math.round(revenue * 0.1);
    illicit = ctx.fee + premium;
    revenue += premium;
    feePaid = 0;
  }

  let caught = false;
  if (mode !== 'honest') {
    const risk = riskOf(mode);
    caught = Math.random() * 100 < risk;
    state.stats.illegal += 1;
    console.log(ui.dim(`\n... controllo ai raggi X (rischio ${risk}%) ...`));
    await ui.sleep(700);
  }

  const fuelCost = ctx.fuelCost;
  const airportFee = ctx.airportFee || 0;
  let net;
  let fine = 0;
  if (caught) {
    fine = Math.round((1000 + illicit * 2) * (state.sponsor.fine || 1));
    net = revenue - feePaid - fuelCost - airportFee - fine;
    state.wanted = Math.min(5, state.wanted + (mode === 'contraband' ? 2 : 1));
    state.stats.caught += 1;
    console.log(ui.bad(`\n*** SEQUESTRO E MULTA: -${fine} € ***`));
    console.log(ui.bad(`Fedinazione penale: ricercato ${ui.stars(state.wanted)}`));
    if (mode === 'contraband') console.log(ui.dim('Il carico extra viene confiscato.'));
  } else if (mode === 'honest') {
    net = revenue - feePaid - fuelCost - airportFee;
    state.wanted = Math.max(0, state.wanted - 1);
    console.log(ui.good('\nDogana superata senza intoppi. La reputazione cresce.'));
  } else {
    net = revenue - feePaid - fuelCost - airportFee + illicit;
    console.log(ui.warn(`\nSei passato... questa volta. Guadagno extra: +${illicit} €.`));
    console.log(ui.dim('Ogni passaggio a vuoto ti avvicina alla cella.'));
  }
  state.cash += net;

  console.log('\n' + ui.dim('── RIEPILOGO VOLO ─────────────────────────────'));
  console.log(`  Valore contratto .... ${ctx.value} €`);
  console.log(`  Condizione carico ... ${ctx.cond}% -> ${ui.bold(ctx.revenueBase + ' €')}`);
  console.log(`  Tassa doganale ...... -${feePaid} €` + ui.dim(` (x${ctx.quizMult.toFixed(2)} doc, x${ctx.landMult.toFixed(2)} atterraggio)`));
  if (airportFee) console.log(`  Diritti aeroporto ... -${airportFee} €  (${ctx.arrivalName})`);
  console.log(`  Carburante .......... -${fuelCost} €`);
  if (caught) console.log(ui.bad(`  Multa ................ -${fine} €`));
  else if (illicit > 0) console.log(ui.hot(`  Extra (nero) ........ +${illicit} €`));
  const sign = net >= 0 ? '+' : '';
  console.log(ui.bold(`  NETTO ............... ${sign}${net} €`));

  if (state.wanted >= 5) {
    state.ending = 'arrest';
    state.gameOver = true;
  }
  await ui.sleep(600);
}

async function playLevel(rl, state, level) {
  ui.splash(level, TOTAL, state.wanted);
  await ui.sleep(500);
  for (const line of level.briefing) {
    console.log('\n' + ui.info('> ' + line.replace('{SPONSOR}', state.sponsor.name)));
    await ui.sleep(450);
  }

  const cargoIdx = await ui.menu(
    rl,
    `\nCONTRATTO DI ${level.from} -> ${level.to}: scegli il carico`,
    level.cargo.map((c) => `${c.name} — ${c.value} €${c.fragile ? ui.dim(' (fragile)') : ''}`)
  );
  const cargo = level.cargo[cargoIdx];
  const market = 0.9 + Math.random() * 0.25;
  const value = contractValue(state.sponsor, cargo, market);
  console.log(
    ui.good(`\nContratto firmato: ${cargo.name} da consegnare a ${value} €.`)
  );
  if (state.wanted >= 3) {
    console.log(ui.warn('⚠ ALLERTA: la polizia di frontiera ti ha in vista. Controlli rafforzati.'));
  }
  await ui.sleep(500);

  const depIdx = await ui.menu(
    rl,
    `\nSCEGLI L'AEROPARTO DI PARTENZA DA ${level.from}`,
    level.dep.map(
      (d) =>
        `${d.name} — ${d.len} m — ${d.note} — vento x${d.windMult} — carburante x${d.fuelMult}`
    )
  );
  const dep = level.dep[depIdx];

  const flight = await fly({
    hull: state.hull,
    fragile: cargo.fragile,
    cargoWeight: Math.max(0, Math.min(1, (value - 3000) / 8000)),
    level,
    dep,
    chooseArrival: (list) =>
      ui.menu(rl, '\nSCEGLI L\'AEROPORTO DI ARRIVO A ' + level.to, list),
  });
  state.hull = flight.hull;

  if (flight.reason === 'hull' || flight.reason === 'fuel' || flight.reason === 'crash') {
    const cost = 1200;
    state.cash -= cost;
    state.hull = Math.max(state.hull, 30);
    state.stats.crash += 1;
    const titles = {
      hull: 'SCHIANTO!',
      fuel: 'RIMASTO SENZA CARBURANTE!',
      crash: 'ATTERRAGGIO CATASTROFICO!',
    };
    ui.clear();
    ui.box(
      [
        titles[flight.reason],
        '',
        `Il carico è perduto. Soccorso e rimozione: -${cost} €`,
        `Decollo: ${labelOf(flight.takeoff && flight.takeoff.quality)}`,
        `Atterraggio: ${labelOf(flight.landing && flight.landing.quality)}`,
        'Il contratto salta. La compagnia non è contenta.',
      ],
      31
    );
    await ui.sleep(1400);
    return;
  }

  if (flight.reason === 'cargo') {
    const fuelCost = Math.round(level.fuelCost * dep.fuelMult * (state.sponsor.fuel || 1));
    state.cash -= fuelCost;
    ui.clear();
    ui.box(
      [
        'CARICO DISTRUTTO',
        '',
        'Le intemperie hanno rovinato tutto: nessun ricavo.',
        `Costo carburante: -${fuelCost} €`,
        `Decollo: ${labelOf(flight.takeoff && flight.takeoff.quality)}`,
      ],
      33
    );
    await ui.sleep(1400);
    return;
  }

  const la = flight.landing || {};
  const cr = flight.cruise || {};
  ui.clear();
  ui.box(
    [
      `Volo ${level.from} → ${level.to} completato`,
      '',
      `  Decollo  ......... ${labelOf(flight.takeoff && flight.takeoff.quality)}`,
      `  Crociera ........ ${cr.hits || 0} colpi, ${cr.tanks || 0} taniche, ${cr.duration || 0} s`,
      `  Atterraggio ..... ${labelOf(la.quality)} (touchdown ${la.touchAt || 0} m, margine ${la.margin || 0} m)`,
      `  Integrità ${flight.hull}%  ·  Carico ${flight.cond}%`,
      `  Pista: ${(flight.arrival || dep).name}`,
    ],
    36
  );
  await ui.sleep(900);

  const mult = await quizPhase(rl, level);
  const landMult = landingMultiplier(la.quality);
  const police = Math.max(1, Math.min(5, level.police + ((flight.arrival && flight.arrival.police) || 0)));
  const airportFee = (flight.arrival && flight.arrival.fee) || 0;
  const fuelCost = Math.round(level.fuelCost * dep.fuelMult * (state.sponsor.fuel || 1));
  const fee = Math.round(value * level.feePct * mult * landMult) + airportFee;
  const revenueBase = Math.round((value * flight.cond) / 100);
  console.log(
    ui.dim(
      `Tassa di importazione: ${fee} € = ${Math.round(value * level.feePct * mult * landMult)} € (base ${value} € x ${(level.feePct * 100).toFixed(0)}% x ${mult.toFixed(2)} doc x ${landMult.toFixed(2)} atterraggio) + ${airportFee} € diritti`
    )
  );

  await customsPhase(rl, state, level, {
    value,
    fee,
    revenue: revenueBase,
    revenueBase,
    cond: flight.cond,
    police,
    fuelCost,
    airportFee,
    quizMult: mult,
    landMult,
    arrivalName: (flight.arrival || dep).name,
  });

  state.stats.ok += 1;
}

async function statusScreen(rl, state) {
  ui.clear();
  const repair = Math.round((100 - state.hull) * 10);
  let repairMsg;
  if (repair > 0 && state.cash >= repair) {
    state.cash -= repair;
    state.hull = 100;
    repairMsg = `Riparazione in hangar: -${repair} € (integrità 100%)`;
  } else if (repair > 0) {
    repairMsg = 'Riparazione rimandata: cassa troppo vuota.';
  } else {
    repairMsg = 'Aereo in perfette condizioni.';
  }
  ui.box(
    [
      `Pilota: ${state.name}`,
      `Sponsor: ${state.sponsor.name} — ${state.sponsor.tag}`,
      `Liquidità: ${ui.bold(state.cash + ' €')}`,
      `Integrità: ${state.hull}% ${ui.bar(state.hull)}`,
      `Ricercato: ${ui.stars(state.wanted)}`,
      `Livelli completati: ${state.done}/${TOTAL}`,
      '',
      repairMsg,
    ],
    36
  );
  await ui.ask(rl, '\nINVIO per preparare il prossimo volo... ');
}

function ending(state) {
  ui.clear();
  const s = state.stats;
  const lines = [
    '',
    `Pilota: ${state.name}    Sponsor: ${state.sponsor.name}`,
    `Livelli: ${s.ok} completati, ${s.crash} disastri`,
    `Illegalità: ${s.illegal} tentate, ${s.caught} fallite`,
    `Liquidità finale: ${state.cash} €`,
    '',
  ];

  if (state.ending === 'arrest') {
    ui.box(
      [
        '*** INTERPOL TI HA FERMATO ***',
        '',
        '5 stelle nella fedinazione: la cella ti aspetta.',
        'Il commissario ti consegna la lezione:',
        '"Le scorciatoie costano sempre caro,',
        ' prima o poi la fattura arriva."',
        '',
        ...lines,
      ],
      31
    );
  } else if (state.ending === 'bankrupt') {
    ui.box(
      [
        '*** BANCAROTTA ***',
        '',
        'Il conto in banca è in rosso.',
        'Il tuo main sponsor ti ritira il contratto.',
        'Approfitta della prova per rileggere',
        'i calcoli di IVA, dazi e cambi!',
        '',
        ...lines,
      ],
      33
    );
  } else {
    let rank = 'APPRENDISTA PILOTA';
    if (state.cash >= 35000) rank = 'LEGGENDA DEL CARGO';
    else if (state.cash >= 25000) rank = 'COMANDANTE VETERANO';
    else if (state.cash >= 15000) rank = 'PRONTO DI BORDO';
    ui.box(
      [
        '*** GIRO DEL MONDO COMPLETATO! ***',
        '',
        `Classifica: ${rank}`,
        'Tutte le dogane del pianeta sono dietro di te.',
        `Il board di ${state.sponsor.name} brinda al tuo bilancio.`,
        '',
        ...lines,
      ],
      32
    );
  }
  console.log(
    ui.dim(
      '\nCARGO PILOT v1.0 — prova tecnica per PLAY\n' +
        'Tema sponsor configurabile: modifica lib/data.js (SPONSORS).'
    )
  );
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  ui.bindRL(rl);

  ui.titleScreen();
  const name = await ui.ask(rl, '\nNOME PILOTA: ');
  const pilot = !name || name === '__EOF__' ? 'ANONIMO' : name.toUpperCase();

  const sponsorIdx = await ui.menu(
    rl,
    '\nSCEGLI IL TUO MAIN SPONSOR',
    SPONSORS.map((s) => `${s.name} — ${s.tag} — ${s.perk}`)
  );
  const sponsor = SPONSORS[sponsorIdx];

  const state = {
    name: pilot,
    sponsor,
    cash: sponsor.cash,
    hull: 100,
    wanted: 0,
    done: 0,
    gameOver: false,
    ending: null,
    stats: { ok: 0, crash: 0, illegal: 0, caught: 0 },
  };

  console.log(
    ui.good(
      `\nBenvenuto ${pilot}. Contratto firmato con ${sponsor.name}: ${sponsor.cash} € in cassa.`
    )
  );
  await ui.sleep(700);

  for (const level of LEVELS) {
    await playLevel(rl, state, level);
    if (state.gameOver) break;
    state.done += 1;
    if (state.cash < 0) {
      state.ending = 'bankrupt';
      state.gameOver = true;
      break;
    }
    if (level.n < TOTAL) await statusScreen(rl, state);
  }

  ending(state);
  await ui.ask(rl, '\nINVIO per uscire... ');
  rl.close();
}

main().catch((err) => {
  restoreTerm();
  console.error(err);
  process.exit(1);
});
