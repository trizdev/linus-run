// Linus Run: an endless runner on the Balneario Camboriu beach promenade.
// Plain JS + canvas. All art is drawn in code; no external assets.
(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const soundBtn = document.getElementById('sound');

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  const BEST_KEY = 'linusRun.best';
  const SOUND_KEY = 'linusRun.sound';

  const GRAVITY = 2300;
  const JUMP_V = 660;
  const DOUBLE_V = 560;
  const HOLD_TIME = 0.14;      // how long holding the button softens gravity
  const HOLD_GRAVITY = 0.6;
  const START_SPEED = 260;
  const MAX_SPEED = 520;
  const ACCEL = 6;             // speed gained per second of running
  const TREAT_POINTS = 25;

  const TILE_W = 960;
  const TILE_H = 200;

  const view = { w: 640, h: 360, k: 2, g: 298, speedScale: 1 };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ }
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const game = {
    state: 'title',            // 'title' | 'play' | 'over'
    paused: false,
    time: 0,
    runTime: 0,
    speed: 90,
    worldX: 0,
    dist: 0,
    treats: 0,
    score: 0,
    best: parseInt(storageGet(BEST_KEY) || '0', 10) || 0,
    newBest: false,
    overTime: 0,
    nextSpawn: 0,
    obstacles: [],
    items: [],
    particles: [],
    popups: [],
    sound: storageGet(SOUND_KEY) !== 'off', // on unless muted before
    shake: 0,
  };

  const player = {
    x: 90, y: 0, vy: 0,
    onGround: true, jumps: 0,
    holding: false, holdT: 0, buffer: 0,
    anim: 0, dustT: 0, squash: 0,
  };

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------
  // The world is drawn into a small art buffer (1 art pixel = 2 logical units)
  // and scaled up by a whole number with smoothing off, so pixels stay crisp.
  const pix = document.createElement('canvas');
  let pc = pix.getContext('2d');
  const art = { w: 320, h: 180, q: 4 };
  const TILE_AW = TILE_W / 2;
  const TILE_AH = TILE_H / 2;
  let skylineTile = null;
  let hillTile = null;
  let skyCanvas = null;

  function resize() {
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const devW = Math.round(cssW * dpr);
    const devH = Math.round(cssH * dpr);
    // Whole device pixels per art pixel; the short side keeps at least 150 art pixels.
    art.q = Math.max(1, Math.floor(Math.min(devW, devH) / 150));
    art.w = Math.ceil(devW / art.q);
    art.h = Math.ceil(devH / art.q);
    view.k = art.q / 2;
    view.w = art.w * 2;
    view.h = art.h * 2;
    // On tall portrait screens, lift the ground so the action sits mid-screen.
    view.g = 2 * Math.round(Math.min(view.h - 50, view.h * 0.5 + 150) / 2);
    view.speedScale = clamp(view.w / 520, 0.8, 1);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = devW;
    canvas.height = devH;
    pix.width = art.w;
    pix.height = art.h;
    pc = pix.getContext('2d');
    player.x = 2 * Math.round(clamp(view.w * 0.16, 62, 120) / 2);
    if (!hillTile) buildTiles();
    buildSky();
  }

  // ---------------------------------------------------------------------------
  // Pixel helpers and sprites
  // ---------------------------------------------------------------------------
  const ax = (v) => Math.round(v / 2);           // logical units -> art pixels
  const SPR = {};

  function newCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function makeSprite(grid, pal) {
    const w = Math.max(...grid.map((r) => r.length));
    const c = newCanvas(w, grid.length);
    const g = c.getContext('2d');
    grid.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.') continue;
        g.fillStyle = pal[ch];
        g.fillRect(x, y, 1, 1);
      }
    });
    return c;
  }

  // Sprite made from a test function: f(x, y) returns a color or null.
  function plotSprite(w, h, f) {
    const c = newCanvas(w, h);
    const g = c.getContext('2d');
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const col = f(x, y);
        if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
      }
    }
    return c;
  }

  function buildSprites() {
    const P = window.PixelArt;
    for (const k of Object.keys(P.LINUS)) SPR['linus_' + k] = makeSprite(P.LINUS[k], P.PAL);
    for (const k of Object.keys(P.OBJ)) SPR[k] = makeSprite(P.OBJ[k], P.OBJ_PAL);

    // Clouds: a few overlapping pixel circles with a shaded underside.
    [1, 0.8, 0.65].forEach((s, i) => {
      const blobs = [[7, 9, 7 * s], [15, 6, 8.5 * s], [24, 9, 6.5 * s]].map(([x, y, r]) => [x * s + 2, y * s + 3, r]);
      const w = Math.ceil(34 * s + 6), h = Math.ceil(20 * s + 4);
      const base = Math.round(14 * s + 3);
      SPR['cloud' + i] = plotSprite(w, h, (x, y) => {
        const inside = blobs.some(([bx, by, r]) => (x - bx) ** 2 + (y - by) ** 2 <= r * r) ||
          (x >= blobs[0][0] && x <= blobs[2][0] && y >= blobs[0][1] && y <= base);
        if (!inside || y > base) return null;
        return y >= base - 1 ? '#dbe8f4' : '#ffffff';
      });
    });

    // Garden bush.
    SPR.bush = plotSprite(18, 9, (x, y) => {
      const a = (x - 6) ** 2 + (y - 8) ** 2 <= 30;
      const b = (x - 12) ** 2 + (y - 8) ** 2 <= 36;
      if (!a && !b) return null;
      const edge = !((x - 6) ** 2 + (y - 7) ** 2 <= 22 || (x - 12) ** 2 + (y - 7) ** 2 <= 28);
      if (edge) return '#2f6b34';
      return (x + y) % 5 === 0 ? '#62a854' : '#4f9142';
    });
  }

  // Pre-render the distant skyline and hills into art-resolution tiles.
  function buildTiles() {
    hillTile = plotSprite(TILE_AW, TILE_AH, (x, y) => {
      const a = (x / TILE_AW) * Math.PI * 2;
      const top = Math.round(Math.min(TILE_AH - 10, TILE_AH - 31 - 19 * Math.sin(a) - 8 * Math.sin(a * 3 + 1) - 4 * Math.sin(a * 7 + 2)));
      if (y < top) return null;
      if (y === top) return '#aecbb5';
      return (x * 7 + y * 3) % 23 === 0 ? '#86ad94' : '#93b8a0';
    });

    skylineTile = newCanvas(TILE_AW, TILE_AH);
    const c = skylineTile.getContext('2d');
    const r = mulberry32(11);
    const rows = [
      { colors: [['#b4c3d8', '#a3b3cb'], ['#a9bbd3', '#98abc6'], ['#bfcadb', '#adb9cd']], minH: 28, maxH: 64, win: '#e6ecf3' },
      { colors: [['#97aac4', '#8799b4'], ['#8ea2bf', '#7e92af'], ['#a2b2c9', '#91a1b9']], minH: 14, maxH: 41, win: '#f3ecd6' },
    ];
    rows.forEach((row, ri) => {
      let x = ri ? 3 : 0;
      while (x < TILE_AW) {
        let bw = 8 + Math.floor(r() * 13);
        let bh = Math.round(row.minH + r() * (row.maxH - row.minH));
        if (x + bw > TILE_AW - 7) bw = TILE_AW - x;
        // Signature twin towers in the back row.
        const twin = ri === 0 && x > 190 && x < 215;
        if (twin) { bw = 9; bh = 76; }
        const col = row.colors[(r() * row.colors.length) | 0];
        drawBuilding(c, x, bw, bh, col, row.win, r);
        if (twin) {
          drawBuilding(c, x + 13, 9, 73, row.colors[0], row.win, r);
          c.fillStyle = row.colors[0][1];
          c.fillRect(x + 4, TILE_AH - bh - 7, 1, 7);
          c.fillRect(x + 17, TILE_AH - 73 - 6, 1, 6);
          x += 13;
        }
        x += bw + (r() < 0.35 ? Math.floor(r() * 4) : 0);
      }
    });
  }

  function drawBuilding(c, x, w, h, col, win, r) {
    const top = TILE_AH - h;
    c.fillStyle = col[0];
    c.fillRect(x, top, w, h);
    c.fillStyle = col[1];
    const side = Math.max(1, Math.round(w * 0.38));
    c.fillRect(x + w - side, top, side, h);
    if (r() < 0.4) c.fillRect(x + Math.round(w * 0.3), top - 2, Math.max(2, Math.round(w * 0.4)), 2);
    if (r() < 0.25) c.fillRect(x + Math.round(w * 0.5), top - 5, 1, 5);
    c.fillStyle = win;
    for (let wy = top + 3; wy < TILE_AH - 3; wy += 4) {
      for (let wx = x + 2; wx < x + w - 2; wx += 3) {
        if (r() < 0.5) c.fillRect(wx, wy, 1, 2);
      }
    }
  }

  // Sky bands with a dithered seam between each pair, plus the sun.
  const SKY = ['#4f9fe0', '#62ace6', '#78b9eb', '#90c7ef', '#aad5f2', '#c9e2ef', '#ffe2b8'];

  function buildSky() {
    const H = ax(view.g - 98) + 2;
    skyCanvas = newCanvas(art.w, H);
    const c = skyCanvas.getContext('2d');
    const n = SKY.length;
    const stops = SKY.map((_, i) => Math.round((H * (i === n - 1 ? 0.93 : i * 0.8 / (n - 2)))));
    for (let i = 0; i < n; i++) {
      const y0 = stops[i];
      const y1 = i + 1 < n ? stops[i + 1] : H;
      c.fillStyle = SKY[i];
      c.fillRect(0, y0, art.w, y1 - y0);
      if (i > 0) {
        // checkerboard seam
        c.fillStyle = SKY[i];
        for (let x = 0; x < art.w; x += 2) c.fillRect(x, y0 - 1, 1, 1);
        c.fillStyle = SKY[i - 1];
        for (let x = 1; x < art.w; x += 2) c.fillRect(x, y0, 1, 1);
      }
    }
    // sun with a dithered halo
    const sx = Math.round(art.w * 0.8), sy = Math.round(H - 2 - 70);
    for (let y = -16; y <= 16; y++) {
      for (let x = -16; x <= 16; x++) {
        const d = x * x + y * y;
        let col = null;
        if (d <= 81) col = '#fff6d6';
        else if (d <= 121) col = '#ffeeb0';
        else if (d <= 196 && (x + y) % 2 === 0) col = '#ffeeb0';
        else if (d <= 256 && (x + y) % 4 === 0) col = '#fff1c4';
        if (col) { c.fillStyle = col; c.fillRect(sx + x, sy + y, 1, 1); }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Audio (see music.js). The AudioContext starts on the first tap or key.
  // ---------------------------------------------------------------------------
  const Music = window.LinusMusic;

  function ensureAudio() {
    if (game.sound) Music.unlock();
  }

  const sfx = {
    jump: () => Music.sfx('jump'),
    double: () => Music.sfx('double'),
    treat: () => Music.sfx('treat'),
    hit: () => Music.sfx('hit'),
    start: () => Music.sfx('start'),
  };

  const ICON_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7"/><path d="M18.5 6a8.5 8.5 0 0 1 0 12"/></svg>';
  const ICON_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5"/></svg>';

  function updateSoundButton() {
    soundBtn.innerHTML = game.sound ? ICON_ON : ICON_OFF;
    soundBtn.setAttribute('aria-label', game.sound ? 'Desativar som' : 'Ativar som');
    soundBtn.setAttribute('aria-pressed', String(game.sound));
  }

  function toggleSound() {
    game.sound = !game.sound;
    storageSet(SOUND_KEY, game.sound ? 'on' : 'off');
    Music.setEnabled(game.sound);
    ensureAudio();
    updateSoundButton();
    if (game.sound) {
      Music.sfx('toggle');
      if (game.state === 'play' && !Music.playing) Music.play(0.1);
    }
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------
  function press() {
    ensureAudio();
    if (game.paused) { game.paused = false; return; }
    if (game.state === 'title') { startRun(); return; }
    if (game.state === 'over') {
      if (game.time - game.overTime > 0.7) startRun();
      return;
    }
    tryJump();
  }

  function release() {
    player.holding = false;
  }

  const JUMP_KEYS = ['Space', 'ArrowUp', 'KeyW'];

  window.addEventListener('keydown', (e) => {
    if (JUMP_KEYS.includes(e.code)) {
      e.preventDefault();
      if (!e.repeat) press();
    } else if (e.code === 'KeyM') {
      toggleSound();
    } else if ((e.code === 'KeyP' || e.code === 'Escape') && game.state === 'play') {
      game.paused = !game.paused;
    } else if (e.code === 'Enter' && game.state !== 'play') {
      press();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (JUMP_KEYS.includes(e.code)) release();
  });
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    press();
  });
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  soundBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSound();
    soundBtn.blur();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state === 'play') game.paused = true;
    lastTime = performance.now();
  });
  window.addEventListener('blur', () => {
    if (game.state === 'play') game.paused = true;
  });
  window.addEventListener('resize', resize);

  // ---------------------------------------------------------------------------
  // Game flow
  // ---------------------------------------------------------------------------
  function startRun() {
    game.state = 'play';
    game.runTime = 0;
    game.speed = START_SPEED;
    game.dist = 0;
    game.treats = 0;
    game.score = 0;
    game.newBest = false;
    game.obstacles.length = 0;
    game.items.length = 0;
    game.popups.length = 0;
    game.nextSpawn = 260;
    Object.assign(player, { y: 0, vy: 0, onGround: true, jumps: 0, holding: false, holdT: 0, buffer: 0 });
    sfx.start();
    Music.setTempo(1);
    Music.play(0.5); // loop starts right after the start sting
  }

  function gameOver() {
    game.state = 'over';
    game.overTime = game.time;
    game.shake = 0.3;
    player.vy = -380;
    player.onGround = false;
    player.holding = false;
    if (game.score > game.best) {
      game.best = game.score;
      game.newBest = true;
      storageSet(BEST_KEY, String(game.best));
    }
    Music.stop();
    sfx.hit();
    Music.sfx(game.newBest ? 'record' : 'over');
    burst(player.x + 24, view.g - 44, 14, ['#ffffff', '#ffd23f', '#e9edf5']);
  }

  function tryJump() {
    if (player.onGround) {
      player.vy = -JUMP_V;
      player.onGround = false;
      player.jumps = 1;
      player.holding = true;
      player.holdT = 0;
      sfx.jump();
      puff(player.x - 4, view.g, 5);
    } else if (player.jumps < 2) {
      player.vy = -DOUBLE_V;
      player.jumps = 2;
      player.holding = true;
      player.holdT = 0;
      sfx.double();
      puff(player.x, view.g + player.y, 6, '#ffffff');
    } else {
      player.buffer = 0.12;
    }
  }

  // ---------------------------------------------------------------------------
  // Obstacles and treats
  // ---------------------------------------------------------------------------
  // Each obstacle type: width, hit boxes [x, y, w, h] relative to (left, ground),
  // extra speed toward the player, and whether it flies at head height.
  const TYPES = {
    castle:   { w: 34, boxes: [[3, -27, 28, 27]], vx: 0 },
    capybara: { w: 56, boxes: [[6, -24, 46, 22]], vx: 0 },
    skate:    { w: 44, boxes: [[2, -13, 40, 11]], vx: 50 },
    pigeon:   { w: 24, boxes: [[3, -19, 18, 17]], vx: 18 },
    flyer:    { w: 28, boxes: [[3, -100, 22, 12]], vx: 60, flying: true },
  };

  function spawnObstacle() {
    const t = game.runTime;
    const pool = ['castle', 'capybara', 'skate', 'pigeon'];
    if (t > 6) pool.push('flyer');
    if (t > 18) pool.push('flyer');
    const last = game.obstacles[game.obstacles.length - 1];
    let type = pick(pool);
    if (last && last.flying && type === 'flyer') type = 'castle';
    const def = TYPES[type];
    const ob = { type, x: view.w + 30, w: def.w, boxes: def.boxes, vx: def.vx, flying: !!def.flying, phase: Math.random() * 6 };
    game.obstacles.push(ob);

    const minGap = 230 + game.speed * 0.55 + (ob.flying ? 60 : 0);
    const gap = rand(minGap, minGap * 2.0);
    game.nextSpawn = gap;

    if (Math.random() < 0.7) spawnTreats(ob.x + ob.w + gap * 0.45);
  }

  function spawnTreats(x) {
    const pattern = pick(['low', 'low', 'mid', 'arc']);
    if (pattern === 'low') addTreat(x, -18);
    else if (pattern === 'mid') addTreat(x, -72);
    else [-46, -86, -46].forEach((y, i) => addTreat(x + (i - 1) * 28, y));
  }

  function addTreat(x, y) {
    game.items.push({ x, y, phase: Math.random() * 6, taken: false });
  }

  function playerBox() {
    // Covers the body and head of the 48x40 sprite, a little inside the outline
    // (tail tip and nose tip stay out so near misses feel fair).
    return { x: player.x - 22, y: view.g + player.y - 70, w: 62, h: 66 };
  }

  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ---------------------------------------------------------------------------
  // Particles
  // ---------------------------------------------------------------------------
  function puff(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      game.particles.push({
        x: x + rand(-4, 4), y: y - rand(0, 4), vx: rand(-60, -10), vy: rand(-50, -10),
        life: rand(0.3, 0.5), max: 0.5, size: rand(2, 4), color: color || '#e7dcc6', grav: 0,
      });
    }
  }

  function burst(x, y, n, colors) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const v = rand(60, 170);
      game.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40,
        life: rand(0.4, 0.7), max: 0.7, size: rand(1.8, 3.4), color: pick(colors), grav: 300, star: true,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------
  function update(dt) {
    game.time += dt;
    if (game.shake > 0) game.shake = Math.max(0, game.shake - dt);

    if (game.state === 'title') {
      game.speed = 90;
    } else if (game.state === 'play') {
      game.runTime += dt;
      game.speed = Math.min(MAX_SPEED, START_SPEED + ACCEL * game.runTime) * view.speedScale;
      game.dist += game.speed * dt;
      game.score = Math.floor(game.dist / 12) + game.treats * TREAT_POINTS;
    } else {
      game.speed = Math.max(0, game.speed - 900 * dt);
    }
    game.worldX += game.speed * dt;

    updatePlayer(dt);

    if (game.state === 'play') {
      game.nextSpawn -= game.speed * dt;
      if (game.nextSpawn <= 0) spawnObstacle();
    }

    const moving = game.state !== 'title';
    for (const o of game.obstacles) {
      if (moving) o.x -= (game.speed + (game.state === 'play' ? o.vx : 0)) * dt;
      o.phase += dt;
    }
    game.obstacles = game.obstacles.filter((o) => o.x + o.w > -60);
    game.obstacles.sort((a, b) => a.x - b.x);

    for (const it of game.items) {
      if (moving) it.x -= game.speed * dt;
      it.phase += dt;
    }

    if (game.state === 'play') {
      const pb = playerBox();
      for (const o of game.obstacles) {
        for (const b of o.boxes) {
          const box = { x: o.x + b[0], y: view.g + b[1], w: b[2], h: b[3] };
          if (overlap(pb, box)) { gameOver(); break; }
        }
        if (game.state !== 'play') break;
      }
      const grab = { x: pb.x - 6, y: pb.y - 8, w: pb.w + 12, h: pb.h + 12 };
      for (const it of game.items) {
        if (it.taken) continue;
        const ib = { x: it.x - 10, y: view.g + it.y - 6, w: 20, h: 12 };
        if (overlap(grab, ib)) {
          it.taken = true;
          game.treats++;
          sfx.treat();
          burst(it.x, view.g + it.y, 10, ['#ffd23f', '#ffffff', '#f4d9a6']);
          game.popups.push({ x: it.x, y: view.g + it.y - 10, text: '+' + TREAT_POINTS, life: 0.8 });
        }
      }
    }
    game.items = game.items.filter((it) => !it.taken && it.x > -40);

    for (const p of game.particles) {
      p.life -= dt;
      p.x += p.vx * dt - (moving ? game.speed * dt * 0.3 : 0);
      p.y += p.vy * dt;
      p.vy += p.grav * dt;
    }
    game.particles = game.particles.filter((p) => p.life > 0);

    for (const p of game.popups) {
      p.life -= dt;
      p.y -= 40 * dt;
      p.x -= game.speed * dt * 0.5;
    }
    game.popups = game.popups.filter((p) => p.life > 0);
  }

  function updatePlayer(dt) {
    let g = GRAVITY;
    if (player.holding && player.vy < 0 && player.holdT < HOLD_TIME) {
      g *= HOLD_GRAVITY;
      player.holdT += dt;
    }
    if (!player.onGround) {
      player.vy += g * dt;
      player.y += player.vy * dt;
      if (player.y >= 0) {
        player.y = 0;
        player.vy = 0;
        player.onGround = true;
        player.jumps = 0;
        player.squash = 0.12;
        if (game.state !== 'over') puff(player.x, view.g, 4);
        if (player.buffer > 0 && game.state === 'play') { player.buffer = 0; tryJump(); }
      }
    }
    player.buffer = Math.max(0, player.buffer - dt);
    player.squash = Math.max(0, player.squash - dt);
    if (game.state !== 'over') player.anim += dt * (8 + game.speed / 40);

    if (player.onGround && game.state === 'play') {
      player.dustT -= dt;
      if (player.dustT <= 0) {
        player.dustT = 0.09;
        puff(player.x - 10, view.g, 1);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Drawing: Linus (pixel sprite, see sprites.js)
  // ---------------------------------------------------------------------------
  function rect(x, y, w, h, color) {
    pc.fillStyle = color;
    pc.fillRect(x, y, w, h);
  }

  function linusFrame() {
    if (game.state === 'over') return 'dizzy';
    if (!player.onGround) return player.vy < 0 ? 'jumpUp' : 'jumpDown';
    return 'run' + (Math.floor(player.anim * 0.8) % 4);
  }

  // Frame is 48x40 art px; its paws touch the bottom row.
  function drawLinus() {
    const x = ax(player.x) - 22;
    const ground = ax(view.g);
    const y = ax(view.g + player.y) - 40;
    const air = clamp(-player.y / 140, 0, 1);
    const sw = Math.round(30 - 12 * air);
    const sx = ax(player.x) + 3 - (sw >> 1);
    rect(sx + 1, ground - 1, sw - 2, 2, '#d9d1c1');
    rect(sx, ground, sw, 1, '#d9d1c1');
    pc.drawImage(SPR['linus_' + linusFrame()], x, y);
  }

  function drawDizzy() {
    const cx = ax(player.x) + 12;
    const cy = ax(view.g + player.y) - 42;
    for (let i = 0; i < 3; i++) {
      const a = game.time * 5 + (i * Math.PI * 2) / 3;
      pc.drawImage(SPR.star, cx + Math.round(Math.cos(a) * 11) - 2, cy + Math.round(Math.sin(a) * 2) - 2);
    }
  }

  // ---------------------------------------------------------------------------
  // Drawing: obstacles and treats
  // ---------------------------------------------------------------------------
  function drawObstacle(o) {
    const x = ax(o.x);
    const G = ax(view.g);
    const flap = Math.floor(o.phase * 8) % 2;
    if (!o.flying) {
      const w = Math.round(o.w / 2);
      rect(x, G - 1, w, 2, '#d9d1c1');
    }
    if (o.type === 'castle') pc.drawImage(SPR.castle, x, G - 15);
    else if (o.type === 'capybara') {
      // Calm capybara with an orange on its head; it blinks now and then.
      const blink = (o.phase * 1.3) % 3 > 2.85 ? 1 : 0;
      pc.drawImage(SPR['capy' + blink], x, G - 17);
    }
    else if (o.type === 'skate') pc.drawImage(SPR['skate' + (Math.floor(o.phase * 14) % 2)], x, G - 8);
    else if (o.type === 'pigeon') pc.drawImage(SPR['pigeon' + flap], x, G - 10);
    else if (o.type === 'flyer') pc.drawImage(SPR['flyer' + flap], x, ax(view.g - 102));
  }

  function drawTreat(it) {
    const cx = ax(it.x);
    const cy = ax(view.g + it.y) + (Math.sin(it.phase * 4) > 0.3 ? -1 : 0);
    pc.drawImage(SPR.bone, cx - 6, cy - 3);
    // twinkle
    const t = (it.phase * 3) % 2;
    if (t < 0.5) {
      const tx = cx + 5, ty = cy - 5;
      rect(tx, ty - 1, 1, 3, '#fff3a6');
      rect(tx - 1, ty, 3, 1, '#fff3a6');
    }
  }

  // ---------------------------------------------------------------------------
  // Drawing: scenery (all in art pixels)
  // ---------------------------------------------------------------------------
  function drawBackground() {
    const W = art.w;
    const G = ax(view.g);
    const H = ax(view.g - 98);
    const wx = game.worldX;

    pc.drawImage(skyCanvas, 0, 0);

    // clouds
    const cOff = Math.round(wx * 0.02) % 350;
    for (let i = -1; i < Math.ceil(W / 350) + 1; i++) {
      const base = i * 350 - cOff;
      pc.drawImage(SPR.cloud0, base + 38, H - 95);
      pc.drawImage(SPR.cloud1, base + 178, H - 69);
      pc.drawImage(SPR.cloud2, base + 278, H - 104);
    }

    // hills and skyline tiles
    tileLayer(hillTile, 0.03, H - TILE_AH + 4);
    tileLayer(skylineTile, 0.06, H - TILE_AH + 1);

    // sea in three bands with scrolling glints
    const seaB = ax(view.g - 54);
    const seaH = seaB - H;
    const third = Math.max(1, Math.round(seaH / 3));
    rect(0, H, W, third, '#3f9fc4');
    rect(0, H + third, W, third, '#4fb0cf');
    rect(0, H + third * 2, W, seaH - third * 2, '#62c1d8');
    for (let x = 0; x < W; x += 2) rect(x, H + third, 1, 1, '#3f9fc4');
    for (let x = 1; x < W; x += 2) rect(x, H + third * 2, 1, 1, '#4fb0cf');
    const sOff = Math.round(wx * 0.125) % 45;
    for (let row = 0; row < 4; row++) {
      const yy = H + 3 + row * 5;
      if (yy >= seaB - 2) break;
      for (let x = -45 + ((row * 19) % 45) - sOff; x < W + 45; x += 45) rect(x, yy, 5 + row * 2, 1, '#d8f1f8');
    }
    // stepped foam line
    const fOff = Math.round(wx * 0.175);
    const foamTop = ax(view.g - 56);
    for (let x = 0; x < W; x += 2) {
      const s = Math.sin((x + fOff) * 0.32 + game.time * 2);
      const top = foamTop + (s > 0.4 ? -1 : s < -0.4 ? 1 : 0);
      rect(x, top, 2, G - 26 - top, '#ffffff');
      if (s > 0.8) rect(x, top - 1, 1, 1, '#d8f1f8');
    }

    // sand
    rect(0, G - 26, W, 12, '#f1dcab');
    rect(0, G - 26, W, 1, '#e7cf98');
    const dOff = Math.round(wx * 0.25) % 25;
    for (let x = -dOff; x < W + 25; x += 25) {
      rect(x + 3, G - 23, 1, 1, '#c9a76a');
      rect(x + 12, G - 19, 1, 1, '#c9a76a');
      rect(x + 20, G - 21, 1, 1, '#d8bd85');
    }

    // palm trees on the sand
    const spacing = 125;
    const pOff = wx * 0.25;
    const first = Math.floor(pOff / spacing) - 1;
    for (let i = first; i < first + Math.ceil(W / spacing) + 3; i++) {
      const hash = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
      const px = Math.round(i * spacing - pOff + hash * 45);
      palm(px, G - 18, Math.round(50 + hash * 20), Math.round((hash - 0.5) * 15));
    }

    // promenade: curb + wave mosaic pavement
    rect(0, G - 16, W, 3, '#d6cfc0');
    rect(0, G - 13, W, 1, '#b8b0a0');
    rect(0, G - 12, W, art.h - G + 12, '#f2ede2');
    for (let row = 0; row < 6; row++) {
      const yy = G - 7 + row * 8;
      if (yy > art.h + 4) break;
      for (let x = 0; x < W; x++) {
        const y = yy + Math.round(Math.sin(((x * 2 + wx) / 60) * Math.PI * 2) * 2.2);
        rect(x, y, 1, 2, '#a7abb3');
      }
    }

    // On tall screens, show the garden strip and the avenue below the promenade.
    if (view.h - view.g > 90) {
      const y0 = ax(view.g + 40);
      rect(0, y0, W, 3, '#cfc8b8');
      rect(0, y0 + 3, W, 8, '#6aa956');
      const bOff = Math.round(wx * 0.5) % 23;
      for (let x = -bOff - 23; x < W + 23; x += 23) {
        pc.drawImage(SPR.bush, x + 1, y0 + 1);
        rect(x + 17, y0 + 6, 1, 1, '#ffd23f');
        rect(x + 19, y0 + 8, 1, 1, '#ffffff');
      }
      rect(0, y0 + 10, W, 2, '#cfc8b8');
      rect(0, y0 + 12, W, art.h - y0 - 12, '#4b4f58');
      const lOff = Math.round(wx * 0.575) % 30;
      for (let ly = y0 + 30; ly < art.h - 10; ly += 35) {
        for (let x = -lOff - 30; x < W + 30; x += 30) rect(x, ly, 15, 1, '#e4e6ea');
      }
    }
  }

  function tileLayer(tile, factor, y) {
    if (!tile) return;
    const off = Math.round(game.worldX * factor) % TILE_AW;
    for (let x = -off; x < art.w; x += TILE_AW) pc.drawImage(tile, x, y);
  }

  // Pixel palm: segmented trunk on a curve, fronds as tapering pixel strokes.
  function palm(x, y, h, lean) {
    if (x < -60 || x > art.w + 60) return;
    const topX = x + lean, topY = y - h;
    const midX = x + lean * 0.1, midY = y - h * 0.5;
    const steps = Math.ceil(h / 2);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = Math.round((1 - t) * (1 - t) * x + 2 * (1 - t) * t * midX + t * t * topX);
      const py = Math.round((1 - t) * (1 - t) * y + 2 * (1 - t) * t * midY + t * t * topY);
      rect(px - 1, py, 3, 2, (i >> 1) % 2 ? '#8a6a45' : '#74563a');
      rect(px + 1, py, 1, 2, '#634a30');
    }
    const sway = Math.round(Math.sin(game.time * 1.3 + x * 0.02) * 1.5);
    const angles = [-2.9, -2.4, -1.9, -1.25, -0.7, -0.2, 0.25];
    angles.forEach((a, i) => {
      const len = 17 + (i % 3) * 3;
      const col = i % 2 ? '#2f7d45' : '#3d9455';
      for (let s = 0; s <= len; s++) {
        const t = s / len;
        const fx = Math.round(topX + Math.cos(a) * len * t);
        const fy = Math.round(topY + Math.sin(a) * len * 0.6 * t - 6 * Math.sin(t * Math.PI) + 7 * t * t + (t > 0.5 ? sway * t : 0));
        const thick = t < 0.35 ? 3 : t < 0.8 ? 2 : 1;
        rect(fx, fy, 1, thick, col);
        if (t > 0.15 && t < 0.9) rect(fx, fy + thick, 1, 1, s % 2 ? '#25633a' : col);
        if (s % 3 === 0 && t < 0.6) rect(fx, fy - 1, 1, 1, '#5cad6a');
      }
    });
    rect(topX - 2, topY + 1, 2, 2, '#6b4b2a');
    rect(topX + 1, topY + 2, 2, 2, '#6b4b2a');
    rect(topX - 1, topY + 3, 2, 2, '#5a3e22');
  }

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Drawing: UI
  // ---------------------------------------------------------------------------
  function text(str, x, y, size, color, align, weight, strokeColor, maxWidth) {
    ctx.font = `${weight || 800} ${size}px ${FONT}`;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    if (strokeColor) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(2, size * 0.18);
      ctx.strokeStyle = strokeColor;
      ctx.strokeText(str, x, y, maxWidth);
    }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y, maxWidth);
  }

  // Square pixel-style box with a notched frame (2 logical units = 1 art pixel).
  function panel(cx, cy, w, h) {
    const x = 2 * Math.round((cx - w / 2) / 2), y = 2 * Math.round((cy - h / 2) / 2);
    w = 2 * Math.round(w / 2); h = 2 * Math.round(h / 2);
    ctx.fillStyle = '#1b2a44';
    ctx.fillRect(x + 4, y, w - 8, h);
    ctx.fillRect(x, y + 4, w, h - 8);
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    ctx.fillStyle = '#f4f1e6';
    ctx.fillRect(x + 4, y + 2, w - 8, h - 4);
    ctx.fillRect(x + 2, y + 4, w - 4, h - 8);
    ctx.fillStyle = 'rgba(30,58,104,0.94)';
    ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(x + 6, y + 6, w - 12, 4);
  }

  function drawHud() {
    const x = 14;
    text(String(game.score), x, 24, 24, '#ffffff', 'left', 900, 'rgba(16,38,66,0.75)');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(SPR.bone, x - 2, 44, 24, 14);
    text('× ' + game.treats, x + 22, 51, 15, '#ffffff', 'left', 800, 'rgba(16,38,66,0.75)');
    text('Recorde ' + game.best, x, 72, 12, '#ffffff', 'left', 700, 'rgba(16,38,66,0.75)');
  }

  function drawTitle() {
    const cx = view.w / 2;
    const cy = Math.min(view.h * 0.3, view.g - 160);
    const pw = Math.min(view.w - 28, 380);
    panel(cx, cy + 6, pw, 156);
    text('Linus Run', cx, cy - 40, 46, '#ffffff', 'center', 900, '#2b66c9');
    text('Corra pelo calçadão de Balneário Camboriú', cx, cy, pw < 360 ? 12.5 : 14, '#e9f3ff', 'center', 700, null, pw - 24);
    ctx.save();
    ctx.translate(cx, cy + 32);
    const pulse = 1 + 0.05 * Math.sin(game.time * 4);
    ctx.scale(pulse, pulse);
    text('toque para começar', 0, 0, 20, '#ffd23f', 'center', 900, 'rgba(16,38,66,0.8)');
    ctx.restore();
    if (pw < 360) {
      text('Pule: toque, clique, Espaço ou ↑', cx, cy + 56, 10.5, '#cfe0f5', 'center', 600);
      text('segure para pular mais alto', cx, cy + 70, 10.5, '#cfe0f5', 'center', 600);
    } else {
      text('Pule: toque, clique, Espaço ou ↑  ·  segure para pular mais alto', cx, cy + 62, 11, '#cfe0f5', 'center', 600);
    }
    const onRoad = view.h - view.g > 90;
    text('feito por Linus Ltd', cx, view.h - 10, 10, onRoad ? 'rgba(255,255,255,0.8)' : 'rgba(40,46,58,0.75)', 'center', 700);
  }

  function drawGameOver() {
    const cx = view.w / 2;
    const cy = Math.min(view.h * 0.42, view.g - 125);
    const appear = clamp((game.time - game.overTime) / 0.25, 0, 1);
    ctx.save();
    ctx.globalAlpha = appear;
    ctx.translate(cx, cy);
    ctx.scale(0.9 + 0.1 * appear, 0.9 + 0.1 * appear);
    const pw = Math.min(view.w - 28, 300);
    panel(0, 0, pw, 150);
    text('Fim de jogo!', 0, -50, 30, '#ffffff', 'center', 900, '#2b66c9');
    text(String(game.score), 0, -16, 32, '#ffd23f', 'center', 900);
    text('pontos', 0, 6, 12, '#cfe0f5', 'center', 700);
    text('Petiscos: ' + game.treats + '   ·   Recorde: ' + game.best, 0, 27, 13, '#ffffff', 'center', 700);
    if (game.newBest) {
      const pulse = 1 + 0.06 * Math.sin(game.time * 8);
      ctx.save(); ctx.translate(pw / 2 - 46, -72); ctx.rotate(0.18); ctx.scale(pulse, pulse);
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(-36, -11, 72, 22);
      ctx.fillRect(-38, -9, 76, 18);
      text('Novo recorde!', 0, 0.5, 11, '#5a3a00', 'center', 900);
      ctx.restore();
    }
    if (game.time - game.overTime > 0.7) {
      ctx.globalAlpha = appear;
      text('toque para jogar de novo', 0, 53, 16, '#ffd23f', 'center', 900, 'rgba(16,38,66,0.8)');
    }
    ctx.restore();
  }

  function drawPause() {
    ctx.fillStyle = 'rgba(10,20,40,0.45)';
    ctx.fillRect(0, 0, view.w, view.h);
    const cx = view.w / 2, cy = view.h * 0.4;
    panel(cx, cy, Math.min(view.w - 28, 280), 96);
    text('Pausado', cx, cy - 16, 28, '#ffffff', 'center', 900);
    text('toque para continuar', cx, cy + 20, 15, '#ffd23f', 'center', 800);
  }

  function drawParticles() {
    for (const p of game.particles) {
      // pixel art has no fading: particles flicker out instead
      if (p.life < p.max * 0.3 && Math.floor(p.life * 30) % 2) continue;
      const size = Math.max(1, Math.round(p.size / 2));
      rect(ax(p.x) - (size >> 1), ax(p.y) - (size >> 1), size, size, p.color);
    }
  }

  function drawPopups() {
    for (const p of game.popups) {
      ctx.globalAlpha = clamp(p.life / 0.4, 0, 1);
      text(p.text, p.x, p.y, 16, '#ffd23f', 'center', 900, 'rgba(16,38,66,0.8)');
    }
    ctx.globalAlpha = 1;
  }

  function render() {
    // World: art pixels into the small buffer.
    pc.setTransform(1, 0, 0, 1, 0, 0);
    pc.imageSmoothingEnabled = false;
    pc.fillStyle = '#f2ede2';
    pc.fillRect(0, 0, art.w, art.h);
    if (game.shake > 0) {
      const m = game.shake * 4;
      pc.setTransform(1, 0, 0, 1, Math.round(rand(-m, m)), Math.round(rand(-m, m)));
    }
    drawBackground();
    for (const it of game.items) drawTreat(it);
    for (const o of game.obstacles) drawObstacle(o);
    drawLinus();
    if (game.state === 'over') drawDizzy();
    drawParticles();

    // Scale the buffer up by a whole number, nearest neighbour.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pix, 0, 0, art.w * art.q, art.h * art.q);

    // UI on top in logical units.
    ctx.setTransform(view.k, 0, 0, view.k, 0, 0);
    drawPopups();
    if (game.state === 'title') drawTitle();
    else drawHud();
    if (game.state === 'over') drawGameOver();
    if (game.paused) drawPause();
  }

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------
  let lastTime = performance.now();

  function frame(now) {
    const dt = clamp((now - lastTime) / 1000, 0, 1 / 20);
    lastTime = now;
    if (!game.paused && !document.hidden) update(dt);
    Music.setPaused(game.paused || document.hidden);
    if (game.state === 'play') Music.setTempo(1 + 0.06 * Math.min(1, (ACCEL * game.runTime) / (MAX_SPEED - START_SPEED)));
    render();
    requestAnimationFrame(frame);
  }

  buildSprites();
  resize();
  updateSoundButton();
  requestAnimationFrame(frame);
})();
