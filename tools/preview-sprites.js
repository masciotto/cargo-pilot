'use strict';
// Anteprime sprite: node tools/preview-sprites.js   (PLAIN=1 = senza colori)
const { Frame } = require('../lib/render');
const S = require('../lib/sprites');

if (process.env.PLAIN) {
  const orig = Frame.prototype.set;
  Frame.prototype.set = function (x, y, ch, fg, bg) {
    orig.call(this, x, y, ch, 0, 0);
  };
}

const f = new Frame(80, 46);
f.clear(0);
let y = 0;
const label = (t) => {
  f.text(0, y, t, 226);
  y += 1;
};

label('PLANE_SIDE (+ tail, windows, prop 4 fotogrammi)');
S.drawSprite(f, S.PLANE_SIDE, 2, y, {});
S.drawSprite(f, S.PLANE_SIDE_TAIL, 2, y, {});
S.drawSprite(f, S.PLANE_SIDE_WINDOWS, 2, y, {});
const p0 = S.PROP_FRAMES[0];
for (const r of p0.rows) f.set(2 + p0.x, y + r, p0.ch, 244);
S.PROP_FRAMES.forEach((p, i) => {
  f.text(2 + 29 + i * 4, y + 2, '[' + p.rows.map(() => p.ch).join('') + ']', 244);
});
y += 7;

label('REAR_PLANE bank -1 / 0 / +1');
for (const b of [-1, 0, 1]) {
  const spr = S.REAR_PLANE[b];
  const x0 = 2 + (b + 1) * 16;
  S.drawSprite(f, spr, x0, y, {});
  for (const l of S.rearNavLights(b)) f.set(x0 + l.x, y + l.y, '■', l.fg);
}
y += 7;

label('CLOUDS big / mid / far');
S.drawSprite(f, S.CLOUD_BIG, 2, y, {});
S.drawSprite(f, S.CLOUD_MID, 32, y, {});
S.drawSprite(f, S.CLOUD_FAR, 54, y, {});
y += 7;
label('STORM / BIRDS / FUEL / WIND');
S.drawSprite(f, S.CLOUD_STORM, 2, y, {});
S.drawSprite(f, S.BIRD_FLOCK, 32, y, {});
S.drawSprite(f, S.FUEL_TANK, 42, y, {});
S.drawSprite(f, S.WIND_GUST, 50, y, {});
y += 7;

label('MOUNTAINS h=4,5,6 (allineate al terreno)');
S.MOUNTAINS.forEach((m, i) => S.drawSprite(f, m, 4 + i * 14, y + (6 - m.rows.length), {}));
y += 8;

label('TERRAIN');
for (const [name, t] of Object.entries(S.TERRAIN)) {
  f.text(2, y, name.padEnd(8), 226);
  f.fill(12, y, 14, 1, ' ', 0, t.surface);
  f.fill(12, y + 1, 14, 1, ' ', 0, t.deep);
  y += 2;
}

label('SCENA CRUISE -> stampata sotto come frame a parte');
const sc = new Frame(74, 13);
sc.clear(24);
const skyCh = process.env.PLAIN ? '.' : ' ';
const gndCh = process.env.PLAIN ? '~' : ' ';
for (let r = 0; r < 6; r++) sc.fill(0, r, 74, 1, skyCh, 0, 18 + r * 2);
sc.fill(0, 6, 74, 5, skyCh, 0, 31);
sc.fill(0, 11, 74, 1, gndCh, 0, 28);
sc.fill(0, 12, 74, 1, gndCh, 0, 22);
S.drawSprite(sc, S.CLOUD_MID, 40, 2, {});
S.drawSprite(sc, S.CLOUD_FAR, 8, 1, {});
S.drawSprite(sc, S.CLOUD_BIG, 52, 6, {});
S.drawSprite(sc, S.MOUNTAINS[2], 20, 6, {});
S.drawSprite(sc, S.PLANE_SIDE, 8, 4, {});
S.drawSprite(sc, S.PLANE_SIDE_TAIL, 8, 4, {});
S.drawSprite(sc, S.PLANE_SIDE_WINDOWS, 8, 4, {});
for (const r of S.PROP_FRAMES[0].rows) sc.set(8 + 25, 4 + r, S.PROP_FRAMES[0].ch, 244);

process.stdout.write(f.toString() + '\n---\n' + sc.toString() + '\n');
