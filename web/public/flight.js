'use strict';

/* Renderer Canvas per le fasi di volo (CP_WEB=1).
   Riceve stato JSON dal server via WS e disegna su un canvas sovrapposto
   al terminale. I menu restano su xterm. */

const Flight = (() => {
  const canvas = document.getElementById('flight-canvas');
  const wrap = document.getElementById('term-wrap');
  const ctx = canvas.getContext('2d', { alpha: false });

  let active = false;
  let state = null;
  let raf = 0;
  let dpr = 1;
  let W = 0;
  let H = 0;

  function resize() {
    dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const r = wrap.getBoundingClientRect();
    W = Math.max(320, Math.floor(r.width - 16));
    H = Math.max(200, Math.floor(r.height - 8));
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function show() {
    if (active) return;
    active = true;
    lastT = 0;
    parts.length = 0;
    fxBanner = null;
    canvas.style.display = 'block';
    document.getElementById('terminal').style.visibility = 'hidden';
    resize();
    loop();
  }

  function hide() {
    if (!active) return;
    active = false;
    state = null;
    cancelAnimationFrame(raf);
    canvas.style.display = 'none';
    document.getElementById('terminal').style.visibility = 'visible';
  }

  function update(s) {
    const prev = state;
    state = s;
    show();
    detectEvents(prev, s);
  }

  /* ---------- effetti cinematografici ---------- */

  const parts = [];
  let fxBanner = null;
  let smokeT = 0;
  let vign = null;

  function planePos(s) {
    if (s.phase === 'cruise') {
      const sc = W / (s.sceneW || 160);
      const x = (s.planeX != null ? (s.planeX / (s.sceneW || 160)) * W : W * 0.08) + planeW(s) * 0.5;
      const y = s.planeY != null && s.sceneH ? (s.planeY / s.sceneH) * H : H * 0.4;
      return { x, y };
    }
    if (s.phase === 'landing') {
      return { x: W * 0.5, y: H * 0.5 + (s.alt || 0) * 0.4 };
    }
    return { x: W * 0.5, y: H * 0.55 - (s.alt || 0) * (H * 0.04) };
  }

  function planeW(s) {
    return Math.min(W * (s.phase === 'cruise' ? 0.32 : 0.3), 280);
  }

  function spawn(x, y, n, o) {
    for (let i = 0; i < n; i++) {
      const a =
        o.angle != null ? o.angle + (Math.random() - 0.5) * (o.spread || Math.PI * 2) : Math.random() * Math.PI * 2;
      const sp = (o.speed || 60) * (0.4 + Math.random() * 0.9);
      parts.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        age: 0,
        life: (o.life || 0.6) * (0.6 + Math.random() * 0.7),
        size: (o.size || 3) * (0.6 + Math.random() * 0.8),
        col: o.col || '#ffd866',
        grav: o.grav || 0,
        drag: o.drag == null ? 0.88 : o.drag,
        kind: o.kind || 'spark',
      });
    }
    while (parts.length > 240) parts.shift();
  }

  function stepParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age >= p.life) {
        parts.splice(i, 1);
        continue;
      }
      p.vy += p.grav * dt;
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  function drawParts() {
    for (const p of parts) {
      const k = Math.max(0, 1 - p.age / p.life);
      ctx.globalAlpha = p.kind === 'smoke' ? k * 0.55 : k;
      ctx.fillStyle = p.col;
      if (p.kind === 'smoke') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.6 - k * 0.6), 0, Math.PI * 2);
        ctx.fill();
      } else {
        const s2 = p.size * (0.5 + k * 0.8);
        ctx.fillRect(p.x - s2 / 2, p.y - s2 / 2, s2, s2);
      }
    }
    ctx.globalAlpha = 1;
  }

  function detectEvents(prev, s) {
    if (!prev || !s) return;
    const p = planePos(s);

    // colpi: scintille (+ fumo se ha fatto male)
    if (typeof s.hits === 'number' && s.hits > (prev.hits || 0)) {
      const dmg = typeof s.hull === 'number' && s.hull < (prev.hull == null ? s.hull : prev.hull);
      spawn(p.x, p.y, dmg ? 26 : 14, {
        col: dmg ? '#ff8b6b' : '#ffe08a',
        speed: dmg ? 200 : 130,
        life: 0.55,
        size: 3.4,
        grav: 190,
        drag: 0.85,
      });
      if (dmg) {
        spawn(p.x, p.y, 8, { col: '#5a6470', speed: 55, life: 1.1, size: 9, grav: -26, drag: 0.9, kind: 'smoke' });
      }
    }

    // tocco a terra: nube di polvere + flash di scintille
    if (s.phase === 'landing' && prev.phase === 'landing' && prev.runPhase === 'approach' && s.runPhase === 'roll') {
      const gy = Math.min(H - 26, H * 0.66);
      spawn(p.x, gy, 34, { col: '#d9d0b4', speed: 160, life: 0.9, size: 6, grav: 70, drag: 0.87, kind: 'smoke' });
      spawn(p.x, gy, 16, { col: '#fff3c4', speed: 190, life: 0.45, size: 3, grav: 160 });
    }

    // rotazione: fumo delle ruote
    if (s.phase === 'takeoff' && prev.phase === 'takeoff' && prev.runPhase === 'roll' && s.runPhase === 'rotate') {
      spawn(p.x, H * 0.66, 24, { col: '#dcd6c4', speed: 130, life: 0.75, size: 6, grav: 45, drag: 0.9, kind: 'smoke' });
      spawn(p.x, H * 0.66, 10, { col: '#ffe9a8', speed: 150, life: 0.4, size: 2.6, grav: 120 });
    }
  }

  function stepPassive(dt, s) {
    if (!s) return;
    // fumo dalla fusoliera se l'integrità è bassa
    if (typeof s.hull === 'number' && s.hull < 45) {
      smokeT -= dt;
      if (smokeT <= 0) {
        smokeT = 0.09;
        const p = planePos(s);
        spawn(p.x - planeW(s) * 0.3, p.y, 1, {
          col: s.hull < 25 ? '#3a3f47' : '#6a707a',
          speed: 34,
          life: 1.3,
          size: 7,
          grav: -14,
          drag: 0.94,
          kind: 'smoke',
        });
      }
    } else {
      smokeT = 0;
    }
    stepParts(dt);
  }

  function applyShake(s) {
    const mag = s.shake > 0 ? Math.min(11, 3 + s.shake * 12) : 0;
    if (mag <= 0) return;
    const dx = (Math.random() - 0.5) * mag;
    const dy = (Math.random() - 0.5) * mag;
    const m = mag + 2;
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(canvas, -m + dx, -m + dy, W + 2 * m, H + 2 * m);
    ctx.restore();
  }

  function vignette() {
    if (!vign || vign.w !== W || vign.h !== H) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.78);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.4)');
      vign = { g, w: W, h: H };
    }
    ctx.fillStyle = vign.g;
    ctx.fillRect(0, 0, W, H);
  }

  function speedLines(alpha, cx, cy) {
    if (alpha <= 0.02) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,' + Math.min(0.55, alpha) + ')';
    ctx.lineWidth = 2;
    const n = 14;
    const t = performance.now() / 1000;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + t * 0.6;
      const r0 = Math.min(W, H) * (0.26 + ((i * 37) % 10) / 44);
      const r1 = r0 + 42 + ((i * 53) % 60);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBanner(s, now) {
    const b = s.banner;
    if (!b || !(s.bannerT > 0)) {
      fxBanner = null;
      return;
    }
    if (!fxBanner || fxBanner.text !== b.text) {
      fxBanner = { text: b.text, born: now };
    }
    const age = (now - fxBanner.born) / 1000;
    const k = Math.min(1, age / 0.32);
    const ease = 1 - Math.pow(1 - k, 3);
    const fade = Math.min(1, s.bannerT / 0.35);
    const scale = 0.72 + 0.28 * ease;
    const fs = Math.max(20, Math.min(40, W * 0.085));
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(W / 2, H * 0.33);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 ' + fs + 'px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(b.text, 3, 4);
    ctx.fillStyle = b.color || '#ffd866';
    ctx.fillText(b.text, 0, 0);
    if (b.sub) {
      ctx.font = '600 ' + Math.max(11, Math.round(fs * 0.4)) + 'px ui-monospace, Menlo, monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillText(b.sub, 0, fs * 0.75);
    }
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  function letterbox(s) {
    if (!(s.slow > 0)) return;
    const bar = Math.round(H * 0.07);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, bar);
    ctx.fillRect(0, H - bar, W, bar);
  }

  /* ---------- disegno ---------- */

  function clear() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
  }

  function skyGrad(hz, top, mid, bot) {
    const g = ctx.createLinearGradient(0, 0, 0, hz);
    g.addColorStop(0, top);
    g.addColorStop(0.55, mid);
    g.addColorStop(1, bot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, hz);
  }

  function groundGrad(y0, y1, c0, c1) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, c0);
    g.addColorStop(1, c1);
    ctx.fillStyle = g;
    ctx.fillRect(0, y0, W, y1 - y0);
  }

  function sun(cx, cy, r) {
    const g = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r * 2.2);
    g.addColorStop(0, 'rgba(255,245,200,0.95)');
    g.addColorStop(0.25, 'rgba(255,230,150,0.55)');
    g.addColorStop(1, 'rgba(255,220,120,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff4c8';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function cloud(x, y, w, h, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#e8f0fa';
    const blobs = [
      [0, 0, w * 0.35],
      [w * 0.28, -h * 0.15, w * 0.32],
      [w * 0.55, 0, w * 0.38],
      [w * 0.2, h * 0.1, w * 0.28],
      [w * 0.5, h * 0.12, w * 0.3],
    ];
    for (const [bx, by, br] of blobs) {
      ctx.beginPath();
      ctx.ellipse(x + bx, y + by, br, br * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function runwayPerspective(hz, opts) {
    // opts: { d (distanza soglia m), x0 (offset laterale), camH, traveled, critical, flash }
    const d = Math.max(1, opts.d || 100);
    const camH = opts.camH || 5.5;
    const x0 = opts.x0 || 0;
    const f = H * 0.55; // focale approssimata in px
    const scale = f / (d * 0.018 + 40);

    const topY = hz + 4;
    const botY = H;
    const topHalf = Math.max(8, scale * 14);
    const botHalf = Math.max(40, scale * 90);

    // fusso pista
    const cx = W * 0.5 - x0 * scale * 0.35;
    ctx.beginPath();
    ctx.moveTo(cx - topHalf, topY);
    ctx.lineTo(cx + topHalf, topY);
    ctx.lineTo(cx + botHalf, botY);
    ctx.lineTo(cx - botHalf, botY);
    ctx.closePath();
    const pg = ctx.createLinearGradient(0, topY, 0, botY);
    pg.addColorStop(0, '#5a5e66');
    pg.addColorStop(1, '#3a3e46');
    ctx.fillStyle = pg;
    ctx.fill();

    // bordi
    ctx.strokeStyle = '#e8e8e8';
    ctx.lineWidth = 2;
    ctx.stroke();

    // asse tratteggiato
    const dashes = 8;
    for (let i = 0; i < dashes; i++) {
      const t0 = i / dashes;
      const t1 = (i + 0.45) / dashes;
      const y0 = topY + (botY - topY) * t0 * t0;
      const y1 = topY + (botY - topY) * t1 * t1;
      const hw0 = topHalf + (botHalf - topHalf) * t0 * t0;
      const hw1 = topHalf + (botHalf - topHalf) * t1 * t1;
      ctx.fillStyle = i % 2 === 0 ? '#f0f0f0' : '#ffd866';
      ctx.fillRect(cx - hw0 * 0.06, y0, hw0 * 0.12, Math.max(2, y1 - y0));
      void hw1;
    }

    // marker fine pista
    if (opts.critical) {
      ctx.fillStyle = opts.flash ? '#ef233c' : '#ffd866';
      ctx.fillRect(cx - topHalf, topY - 4, topHalf * 2, 4);
    }
  }

  /* Aereo di lato (crociera) — vettoriale liscio */
  function sidePlane(x, y, w, bank, propPhase) {
    const u = w / 36; // unità dal design 36x11
    ctx.save();
    ctx.translate(x + w * 0.5, y + 5.5 * u);
    ctx.rotate(bank * 0.12);
    ctx.translate(-w * 0.5, -5.5 * u);

    // sagoma ombra
    ctx.fillStyle = 'rgba(10,20,30,0.35)';
    ctx.beginPath();
    ctx.ellipse(w * 0.48, 6.2 * u, w * 0.42, 2.2 * u, 0, 0, Math.PI * 2);
    ctx.fill();

    // fusoliera
    const fg = ctx.createLinearGradient(0, 3 * u, 0, 8 * u);
    fg.addColorStop(0, '#f4f7fb');
    fg.addColorStop(0.45, '#dce4ee');
    fg.addColorStop(1, '#9aabb8');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(1 * u, 5.2 * u); // coda
    ctx.quadraticCurveTo(4 * u, 3.2 * u, 12 * u, 3.4 * u);
    ctx.quadraticCurveTo(22 * u, 3.2 * u, 30 * u, 4.6 * u);
    ctx.quadraticCurveTo(34.5 * u, 5.2 * u, 35 * u, 5.6 * u);
    ctx.quadraticCurveTo(34 * u, 6.4 * u, 28 * u, 6.6 * u);
    ctx.quadraticCurveTo(14 * u, 7.2 * u, 4 * u, 6.6 * u);
    ctx.quadraticCurveTo(1.5 * u, 6.2 * u, 1 * u, 5.2 * u);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#5a6a78';
    ctx.lineWidth = Math.max(1, u * 0.35);
    ctx.stroke();

    // fascia livrea
    ctx.fillStyle = '#1a6fb5';
    ctx.beginPath();
    ctx.moveTo(3 * u, 5.6 * u);
    ctx.quadraticCurveTo(16 * u, 6.0 * u, 32 * u, 5.5 * u);
    ctx.lineTo(32 * u, 6.1 * u);
    ctx.quadraticCurveTo(16 * u, 6.6 * u, 3 * u, 6.0 * u);
    ctx.closePath();
    ctx.fill();

    // coda verticale
    ctx.fillStyle = '#1a6fb5';
    ctx.beginPath();
    ctx.moveTo(1.5 * u, 5.2 * u);
    ctx.lineTo(5 * u, 0.5 * u);
    ctx.lineTo(8 * u, 0.5 * u);
    ctx.lineTo(8.5 * u, 4.8 * u);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#5a6a78';
    ctx.stroke();

    // piano di coda orizzontale
    ctx.fillStyle = '#c5d0dc';
    ctx.beginPath();
    ctx.moveTo(1 * u, 5.0 * u);
    ctx.lineTo(7 * u, 4.2 * u);
    ctx.lineTo(9 * u, 4.6 * u);
    ctx.lineTo(3 * u, 5.6 * u);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ala principale (freccia, vista di lato → sottile)
    ctx.fillStyle = '#b8c4d0';
    ctx.beginPath();
    ctx.moveTo(14 * u, 6.2 * u);
    ctx.lineTo(26 * u, 6.0 * u);
    ctx.lineTo(28 * u, 7.2 * u);
    ctx.lineTo(16 * u, 8.0 * u);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // motore sotto ala
    ctx.fillStyle = '#e8eef4';
    ctx.beginPath();
    ctx.ellipse(22 * u, 7.6 * u, 3.2 * u, 1.4 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // elica
    const pr = 1.8 * u;
    const a = propPhase * Math.PI * 2;
    ctx.strokeStyle = '#7a8a98';
    ctx.lineWidth = Math.max(1, u * 0.4);
    ctx.beginPath();
    ctx.moveTo(24.5 * u + Math.cos(a) * pr, 7.6 * u + Math.sin(a) * pr);
    ctx.lineTo(24.5 * u - Math.cos(a) * pr, 7.6 * u - Math.sin(a) * pr);
    ctx.stroke();

    // finestrini
    ctx.fillStyle = '#3a5a78';
    for (let i = 0; i < 10; i++) {
      ctx.beginPath();
      ctx.arc((10 + i * 1.7) * u, 4.6 * u, 0.45 * u, 0, Math.PI * 2);
      ctx.fill();
    }

    // cockpit
    ctx.fillStyle = '#2a4a68';
    ctx.beginPath();
    ctx.ellipse(30.5 * u, 4.8 * u, 1.6 * u, 0.9 * u, -0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /* Aereo di dorso (decollo/atterraggio) */
  function rearPlane(cx, y, w, bank, pitch) {
    const u = w / 22;
    ctx.save();
    ctx.translate(cx, y);
    ctx.rotate(bank * 0.18);
    ctx.rotate(pitch * 0.04);

    // fusoliera
    const fg = ctx.createLinearGradient(-4 * u, 0, 4 * u, 0);
    fg.addColorStop(0, '#8a9aaa');
    fg.addColorStop(0.5, '#e8eef4');
    fg.addColorStop(1, '#8a9aaa');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.ellipse(0, 0, 3.2 * u, 9 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4a5a68';
    ctx.lineWidth = Math.max(1, u * 0.3);
    ctx.stroke();

    // ali
    ctx.fillStyle = '#c5d0dc';
    ctx.beginPath();
    ctx.moveTo(-2 * u, -1 * u);
    ctx.lineTo(-14 * u, 3 * u);
    ctx.lineTo(-14 * u, 5 * u);
    ctx.lineTo(-2 * u, 3.5 * u);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(2 * u, -1 * u);
    ctx.lineTo(14 * u, 3 * u);
    ctx.lineTo(14 * u, 5 * u);
    ctx.lineTo(2 * u, 3.5 * u);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // motori
    ctx.fillStyle = '#e0e6ee';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(s * 7 * u, 3.5 * u, 1.8 * u, 2.6 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // coda verticale
    ctx.fillStyle = '#1a6fb5';
    ctx.beginPath();
    ctx.moveTo(-0.8 * u, -4 * u);
    ctx.lineTo(-1.5 * u, -11 * u);
    ctx.lineTo(1.5 * u, -11 * u);
    ctx.lineTo(0.8 * u, -4 * u);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // piano di coda
    ctx.fillStyle = '#b8c4d0';
    ctx.beginPath();
    ctx.moveTo(-6 * u, -7 * u);
    ctx.lineTo(6 * u, -7 * u);
    ctx.lineTo(6 * u, -5.5 * u);
    ctx.lineTo(-6 * u, -5.5 * u);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // carrello
    if (pitch < 8) {
      ctx.strokeStyle = '#2a2a2a';
      ctx.lineWidth = Math.max(1, u * 0.35);
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 3 * u, 7 * u);
        ctx.lineTo(s * 5 * u, 11 * u);
        ctx.stroke();
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.arc(s * 5 * u, 11.5 * u, 1.1 * u, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  function hudBar(x, y, w, h, frac, color) {
    ctx.fillStyle = 'rgba(8,14,22,0.75)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color || '#7fd787';
    ctx.fillRect(x + 1, y + 1, (w - 2) * Math.max(0, Math.min(1, frac)), h - 2);
    ctx.strokeStyle = '#3a4657';
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  function hudText(s) {
    // pannello superiore
    const pad = 8;
    ctx.fillStyle = 'rgba(8,14,22,0.82)';
    ctx.fillRect(0, 0, W, 44);
    ctx.fillStyle = '#ffd866';
    ctx.font = '600 13px ui-monospace, Menlo, Consolas, monospace';
    ctx.textBaseline = 'top';
    ctx.fillText(s.title || '', pad, 6);

    if (s.hull != null) {
      hudBar(pad, 24, 70, 10, s.hull / 100, s.hull < 30 ? '#ef233c' : '#7fd787');
      ctx.fillStyle = '#a0a8b4';
      ctx.font = '10px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillText('SCEL ' + Math.round(s.hull) + '%', pad + 76, 24);
    }
    if (s.fuel != null) {
      hudBar(pad + 140, 24, 70, 10, s.fuel / 100, s.fuel < 25 ? '#ef233c' : '#66b3ff');
      ctx.fillStyle = '#a0a8b4';
      ctx.fillText('CARB ' + Math.round(s.fuel) + '%', pad + 216, 24);
    }
    if (s.cond != null) {
      hudBar(pad + 280, 24, 70, 10, s.cond / 100, s.cond < 40 ? '#f4a261' : '#c9a0ff');
      ctx.fillStyle = '#a0a8b4';
      ctx.fillText('CARICO ' + Math.round(s.cond) + '%', pad + 356, 24);
    }
    if (s.extra) {
      ctx.fillStyle = '#8a93a2';
      ctx.font = '11px ui-monospace, Menlo, Consolas, monospace';
      const tw = ctx.measureText(s.extra).width;
      ctx.fillText(s.extra, W - tw - pad, 6);
    }

    // pannello inferiore
    const botH = 36;
    ctx.fillStyle = 'rgba(8,14,22,0.82)';
    ctx.fillRect(0, H - botH, W, botH);
    ctx.fillStyle = '#9fd7ff';
    ctx.font = '12px ui-monospace, Menlo, Consolas, monospace';
    const hud = s.hud || s.hudA || s.hudB || '';
    ctx.fillText(hud.slice(0, 110), pad, H - botH + 6);

    if (s.msg1) {
      ctx.fillStyle = s.flash > 0 ? '#ff7b72' : '#ffd866';
      ctx.font = '12px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillText(String(s.msg1).slice(0, 100), pad, H - botH + 20);
    } else if (s.msg2) {
      ctx.fillStyle = '#8a93a2';
      ctx.font = '11px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillText(String(s.msg2).slice(0, 100), pad, H - botH + 20);
    }
  }

  function drawTakeoff(s) {
    clear();
    const hz = Math.round(H * 0.42) + (s.pitch || 0) * (H * 0.008);
    skyGrad(hz, '#1a3050', '#3a70b0', '#8ec0f0');
    sun(W * 0.78, hz * 0.35, 18);
    groundGrad(hz, H, '#3d6b3a', '#1e3a1c');

    // vento strie
    const t = (s.t || 0);
    const dir = (s.wind || 0) >= 0 ? 1 : -1;
    ctx.strokeStyle = 'rgba(180,220,255,0.35)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      const x = ((i * 90 + t * 40 * dir) % (W + 80) + W + 80) % (W + 80) - 40;
      const y = 55 + (i % 4) * 28;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 28 * dir, y);
      ctx.stroke();
    }

    runwayPerspective(hz, {
      d: Math.max(20, (s.runwayLen || 3000) - (s.traveled || 0)),
      x0: s.x || 0,
      camH: 5.5,
      critical: (s.runwayLen || 3000) - (s.traveled || 0) < 170,
      flash: s.flash > 0,
    });

    const pw = Math.min(W * 0.28, 220);
    const px = W * 0.5 - pw * 0.5;
    const py = H * 0.52 - (s.alt || 0) * (H * 0.04) + (s.pitch || 0) * 2;
    rearPlane(px + pw * 0.5, py, pw, s.bank || 0, s.pitch || 0);

    // linee di velocità: si accendono avvicinandosi a Vr
    if (s.v && s.vr) speedLines(Math.max(0, (s.v / s.vr - 0.7) * 1.3), W * 0.5, hz);

    if (s.flash > 0) {
      ctx.fillStyle = s.flash > 0.2 ? 'rgba(239,35,60,0.22)' : 'rgba(244,162,97,0.15)';
      ctx.fillRect(0, 0, W, H);
    }
    hudText(s);
  }

  function drawLanding(s) {
    clear();
    const hz = Math.round(H * 0.38);
    skyGrad(hz, '#12283f', '#3a6a9a', '#a0c8e8');
    sun(W * 0.2, hz * 0.3, 14);
    groundGrad(hz, H, '#3a6838', '#1a3018');

    const d = Math.max(1, s.d || 50);
    runwayPerspective(hz, {
      d: d + (s.runwayLen || 0) * 0.15,
      x0: s.x || 0,
      camH: 4 + (s.alt || 0) * 0.3,
      critical: d < 180,
      flash: s.flash > 0 && d < 180,
    });

    // luci di avvicinamento
    if (d < 700 && s.runPhase === 'approach') {
      ctx.fillStyle = '#ffd866';
      const rabbit = Math.floor((s.t || 0) * 7) % 5;
      for (let i = 0; i < 8; i++) {
        const yy = hz + 8 + i * ((H - hz - 40) / 8);
        const xx = W * 0.5 + Math.sin(i * 0.4) * (s.x || 0) * 2;
        const on = (i + rabbit) % 5 === 0;
        ctx.globalAlpha = on ? 1 : 0.35;
        ctx.beginPath();
        ctx.arc(xx, yy, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    const pw = Math.min(W * 0.3, 240);
    const py = H * 0.48 + (s.pitchVis || 0) * 2 - Math.min(40, (s.alt || 0) * 0.5);
    rearPlane(W * 0.5, py, pw, s.bank || 0, s.pitchVis || 0);

    if (s.flash > 0) {
      ctx.fillStyle = s.flash > 0.2 ? 'rgba(239,35,60,0.2)' : 'rgba(244,162,97,0.12)';
      ctx.fillRect(0, 0, W, H);
    }
    hudText(s);
  }

  function drawCruise(s) {
    clear();
    const hz = Math.round(H * (s.hz != null && s.sceneH ? s.hz / s.sceneH : 0.38));
    skyGrad(hz, '#0f2848', '#2a60a0', '#8ec4f0');
    sun(W * 0.72, hz * 0.28, 20);

    // nuvole
    const clouds = s.clouds || [];
    for (const c of clouds) {
      const scale = W / (s.sceneW || 160);
      const x = (c.x || 0) * scale;
      const y = (c.y || 0) * (H / (s.sceneH || 30));
      if (x < -80 || x > W + 40) continue;
      const alpha = c.layer === 0 ? 0.45 : c.layer === 1 ? 0.65 : 0.85;
      cloud(x, y, Math.max(40, (c.w || 12) * scale * 1.4), Math.max(16, (c.h || 4) * scale), alpha);
    }

    // terreno
    groundGrad(hz, H, '#3d7a48', '#1a3a22');
    // campi scorrevoli
    const t = s.t || 0;
    const scroll = (t * 40) % 80;
    ctx.fillStyle = 'rgba(90,140,70,0.55)';
    for (let i = -1; i < W / 80 + 1; i++) {
      const x = i * 80 - scroll;
      ctx.fillRect(x, hz + 10, 50, H - hz - 10);
    }
    ctx.fillStyle = 'rgba(40,70,50,0.4)';
    for (let i = -1; i < W / 60 + 1; i++) {
      const x = i * 60 - scroll * 1.6;
      ctx.fillRect(x + 30, hz + 40, 28, H - hz - 40);
    }
    // strada
    ctx.fillStyle = 'rgba(90,90,100,0.7)';
    ctx.fillRect(0, H * 0.72, W, 6);
    ctx.fillStyle = 'rgba(220,220,120,0.5)';
    for (let x = -scroll * 2; x < W; x += 36) ctx.fillRect(x, H * 0.72 + 2, 16, 2);

    // orizzonte
    ctx.fillStyle = 'rgba(200,220,240,0.5)';
    ctx.fillRect(0, hz - 1, W, 2);

    // decor (montagne/colli)
    const decor = s.decor || [];
    const sc = W / (s.sceneW || 160);
    for (const d of decor) {
      const x = (d.x || 0) * sc;
      if (x < -40 || x > W + 40) continue;
      const base = (d.y || hz) * (H / (s.sceneH || 30));
      if (d.kind === 'mount') {
        const mh = (d.h || 6) * sc * 1.5;
        ctx.fillStyle = d.far ? '#5a6a7a' : '#7a8894';
        ctx.beginPath();
        ctx.moveTo(x - mh * 0.7, base);
        ctx.lineTo(x, base - mh);
        ctx.lineTo(x + mh * 0.7, base);
        ctx.closePath();
        ctx.fill();
        if (!d.far) {
          ctx.fillStyle = '#d8e4f0';
          ctx.beginPath();
          ctx.moveTo(x - mh * 0.2, base - mh * 0.7);
          ctx.lineTo(x, base - mh);
          ctx.lineTo(x + mh * 0.2, base - mh * 0.7);
          ctx.closePath();
          ctx.fill();
        }
      } else {
        ctx.fillStyle = d.far ? '#4a6a48' : '#2d4a2a';
        ctx.fillRect(x - 2, base - (d.h || 4) * sc, 4, (d.h || 4) * sc);
      }
    }

    // ostacoli
    for (const o of s.obstacles || []) {
      const x = (o.x || 0) * sc;
      const y = (o.y || 0) * (H / (s.sceneH || 30));
      if (x < -50 || x > W + 50) continue;
      const w = (o.w || 8) * sc;
      const h = (o.h || 4) * sc;
      if (o.type === 'mount') {
        ctx.fillStyle = '#6a7888';
        ctx.beginPath();
        ctx.moveTo(x - w * 0.6, y + h);
        ctx.lineTo(x, y);
        ctx.lineTo(x + w * 0.6, y + h);
        ctx.closePath();
        ctx.fill();
      } else if (o.type === 'storm') {
        ctx.fillStyle = 'rgba(60,60,80,0.85)';
        ctx.beginPath();
        ctx.ellipse(x, y + h * 0.4, w * 0.7, h * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        if (Math.floor((s.t || 0) * 8) % 3 === 0) {
          ctx.fillStyle = '#ffd166';
          ctx.beginPath();
          ctx.moveTo(x, y + h * 0.5);
          ctx.lineTo(x - 4, y + h);
          ctx.lineTo(x + 4, y + h * 0.7);
          ctx.closePath();
          ctx.fill();
        }
      } else if (o.type === 'tower') {
        ctx.fillStyle = '#8a9098';
        ctx.fillRect(x - 2, y, 4, h);
        ctx.fillStyle = '#c04040';
        ctx.fillRect(x - 3, y - 3, 6, 3);
      } else if (o.type === 'balloon') {
        ctx.fillStyle = '#e85040';
        ctx.beginPath();
        ctx.ellipse(x, y + 4, w * 0.35, h * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#aaa';
        ctx.beginPath();
        ctx.moveTo(x, y + h * 0.8);
        ctx.lineTo(x, y + h);
        ctx.stroke();
      } else if (o.type === 'gust') {
        // Scarica di vento: tre onde ciano con punta.
        ctx.save();
        ctx.strokeStyle = 'rgba(160,235,255,0.92)';
        ctx.fillStyle = 'rgba(160,235,255,0.92)';
        ctx.lineWidth = Math.max(2, h * 0.18);
        ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
          const yy = y + h * (0.22 + i * 0.3);
          ctx.beginPath();
          ctx.moveTo(x - w * 0.5, yy);
          ctx.bezierCurveTo(x - w * 0.15, yy - h * 0.2, x + w * 0.1, yy + h * 0.2, x + w * 0.3, yy);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x + w * 0.52, yy);
          ctx.lineTo(x + w * 0.26, yy - h * 0.16);
          ctx.lineTo(x + w * 0.26, yy + h * 0.16);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      } else if (o.type === 'chute') {
        // Paracadutista: cupola + funicelli + sagoma.
        const cx = x;
        const topY = y + h * 0.18;
        ctx.fillStyle = '#ff9f45';
        ctx.beginPath();
        ctx.ellipse(cx, topY, w * 0.45, h * 0.2, 0, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f4f7fb';
        ctx.beginPath();
        ctx.ellipse(cx, topY, w * 0.15, h * 0.2, 0, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#d9762b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.45, topY);
        ctx.lineTo(cx + w * 0.45, topY);
        ctx.stroke();
        const bodyY = y + h * 0.66;
        ctx.strokeStyle = 'rgba(225,235,245,0.9)';
        ctx.lineWidth = 1;
        for (const k of [-0.4, -0.14, 0.14, 0.4]) {
          ctx.beginPath();
          ctx.moveTo(cx + w * k, topY);
          ctx.lineTo(cx, bodyY - h * 0.14);
          ctx.stroke();
        }
        ctx.fillStyle = '#dfe7ef';
        ctx.beginPath();
        ctx.ellipse(cx, bodyY, w * 0.11, h * 0.15, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#2a3441';
        ctx.lineWidth = Math.max(1.5, w * 0.06);
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.05, bodyY + h * 0.1);
        ctx.lineTo(cx - w * 0.08, bodyY + h * 0.24);
        ctx.moveTo(cx + w * 0.05, bodyY + h * 0.1);
        ctx.lineTo(cx + w * 0.08, bodyY + h * 0.24);
        ctx.stroke();
      } else if (o.type !== 'tank') {
        // bird / default
        ctx.strokeStyle = '#2a2a2a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, w * 0.3, Math.PI * 1.1, Math.PI * 1.9);
        ctx.arc(x + w * 0.4, y, w * 0.3, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      }
      if (o.type === 'tank') {
        ctx.fillStyle = 'rgba(46,204,113,0.85)';
        ctx.beginPath();
        ctx.arc(x, y + h * 0.4, Math.min(w, h) * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // trail
    const trail = s.trail || [];
    for (let i = 0; i < trail.length; i++) {
      const p = trail[i];
      const a = 1 - i / Math.max(1, trail.length);
      ctx.strokeStyle = `rgba(220,235,255,${a * 0.7})`;
      ctx.lineWidth = 2 + a * 3;
      const px = (p.x || 0) * sc;
      const py = (p.y || 0) * (H / (s.sceneH || 30));
      if (i > 0) {
        const q = trail[i - 1];
        ctx.beginPath();
        ctx.moveTo((q.x || 0) * sc, (q.y || 0) * (H / (s.sceneH || 30)));
        ctx.lineTo(px, py);
        ctx.stroke();
      }
    }

    // aereo
    const shake = s.shake > 0 ? (Math.random() < 0.5 ? -2 : 2) : 0;
    const planeW = Math.min(W * 0.32, 280);
    const planeX = (s.planeX != null ? (s.planeX / (s.sceneW || 160)) * W : W * 0.08);
    const planeY = (s.planeY != null && s.sceneH
      ? (s.planeY / s.sceneH) * H
      : H * 0.4) + shake;
    sidePlane(planeX, planeY, planeW, 0, ((s.propI || 0) % 6) / 6);

    if (s.flash > 0) {
      ctx.fillStyle = s.flash > 0.2 ? 'rgba(239,35,60,0.25)' : 'rgba(244,162,97,0.15)';
      ctx.fillRect(0, 0, W, H);
    }
    hudText(s);
  }

  function draw(now) {
    if (!state) return;
    const s = state;
    if (s.phase === 'takeoff') drawTakeoff(s);
    else if (s.phase === 'landing') drawLanding(s);
    else if (s.phase === 'cruise') drawCruise(s);
    else clear();

    drawParts();
    applyShake(s);
    vignette();
    drawBanner(s, now);
    letterbox(s);
  }

  let lastT = 0;
  function loop(ts) {
    if (!active) return;
    const now = ts || performance.now();
    const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0.016;
    lastT = now;
    stepPassive(dt, state);
    draw(now);
    raf = requestAnimationFrame(loop);
  }

  window.addEventListener('resize', () => {
    if (active) resize();
  });

  canvas.style.display = 'none';
  return { update, hide, isActive: () => active };
})();
