// Music and sound effects for Linus Run, synthesized with WebAudio.
// No audio files: every note is an oscillator or a burst of noise.
//
// Theme: "Calçadão" — an original 16-bar loop in D major, in two arrangements:
//   original: chiptune at 140 BPM. 25% pulse lead, triangle bass,
//             12.5% pulse arpeggio, noise drums.
//   calm:     sunset version at 100 BPM. Soft triangle lead with vibrato,
//             warm seventh-chord pad, bossa-style bass, shaker and gentle kick.
// DEFAULT_ARRANGEMENT picks the one the game uses (calm). For the chiptune
// version, add ?music=original to the page address, or call
// LinusMusic.setArrangement('original').
// Notes are scheduled ahead on the audio clock (lookahead scheduler), so the
// timing does not drift with timers or frame rate.
(function (root) {
  'use strict';

  const DEFAULT_ARRANGEMENT = 'calm';
  const STEPS_PER_BAR = 16; // sixteenth notes
  const BARS = 16;
  const TOTAL_STEPS = STEPS_PER_BAR * BARS;
  const LOOKAHEAD = 0.12; // seconds of audio scheduled ahead
  const TICK_MS = 25; // how often the scheduler wakes up
  const MASTER = 0.25;
  const MUSIC_LEVEL = 0.7;

  // ---------------------------------------------------------------------------
  // Song data
  // ---------------------------------------------------------------------------
  const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, Bb: 10, B: 11 };
  function midi(name) {
    const m = /^([A-G](?:#|b)?)(\d)$/.exec(name);
    return 12 * (Number(m[2]) + 1) + NOTE[m[1]];
  }
  function hz(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  // Lead melody, one bar per line, eight eighth notes per bar.
  // '-' holds the previous note, '.' is a rest.
  const LEAD = [
    'A4 D5 F#5 -  E5 D5 A4 -', // D
    'C#5 E5 A5 -  G5 F#5 E5 -', // A
    'D5 F#5 B5 -  A5 F#5 D5 -', // Bm
    'G5 - F#5 E5  D5 - E5 -', // G
    'A4 D5 F#5 -  E5 D5 A4 -', // D
    'C#5 E5 A5 -  B5 A5 F#5 -', // A
    'G5 F#5 E5 D5  B4 D5 E5 -', // G
    'A5 - - -  . E5 F#5 G5', // A
    'A5 - B5 A5  G5 - E5 -', // G
    'F#5 - G5 F#5  E5 - C#5 -', // A
    'F#5 - A5 F#5  C#5 - F#5 -', // F#m
    'D5 - F#5 B5  A5 - F#5 -', // Bm
    'G5 - E5 G5  B5 - A5 G5', // Em
    'F#5 - E5 F#5  A5 - E5 -', // A
    'D5 F#5 A5 D6  A5 F#5 D5 -', // D
    'E5 - C#5 -  A4 - . .', // A
  ];

  // Chord per bar: bass root and the three chord tones for the arpeggio.
  const CHORDS = [
    ['D2', 'D4 F#4 A4'], ['A1', 'C#4 E4 A4'], ['B1', 'D4 F#4 B4'], ['G1', 'D4 G4 B4'],
    ['D2', 'D4 F#4 A4'], ['A1', 'C#4 E4 A4'], ['G1', 'D4 G4 B4'], ['A1', 'C#4 E4 A4'],
    ['G1', 'D4 G4 B4'], ['A1', 'C#4 E4 A4'], ['F#2', 'C#4 F#4 A4'], ['B1', 'D4 F#4 B4'],
    ['E2', 'E4 G4 B4'], ['A1', 'C#4 E4 A4'], ['D2', 'D4 F#4 A4'], ['A1', 'C#4 E4 A4'],
  ];

  // A song is an array: song[step] lists the events that start on that
  // sixteenth step.
  function emptySong() {
    return Array.from({ length: TOTAL_STEPS }, () => []);
  }

  // The melody is shared by both arrangements, so the tune stays the same.
  function addLead(song) {
    LEAD.forEach((line, bar) => {
      const toks = line.trim().split(/\s+/);
      let cur = null;
      toks.forEach((tok, i) => {
        const step = bar * STEPS_PER_BAR + i * 2;
        if (tok === '-') { if (cur) cur.len += 2; return; }
        if (tok === '.') { cur = null; return; }
        cur = { v: 'lead', m: midi(tok), len: 2 };
        song[step].push(cur);
      });
    });
  }

  function buildOriginal() {
    const song = emptySong();
    const add = (step, ev) => song[step].push(ev);
    addLead(song);

    CHORDS.forEach(([rootName, tones], bar) => {
      const r = midi(rootName);
      const base = bar * STEPS_PER_BAR;
      // Bouncy bass: root, octave, fifth.
      [[0, 0, 3], [4, 12, 2], [6, 7, 2], [8, 0, 3], [12, 12, 2], [14, 7, 2]].forEach(([s, iv, len]) => {
        add(base + s, { v: 'bass', m: r + iv, len });
      });
      // Arpeggio from bar 5 on (bars 1-4 stay light like an intro).
      if (bar >= 4) {
        const t = tones.split(' ').map(midi);
        const pat = [t[0], t[1], t[2], t[0] + 12];
        for (let s = 0; s < STEPS_PER_BAR; s++) add(base + s, { v: 'arp', m: pat[s % 4] + 12, len: 1 });
      }
      // Drums.
      const fill = bar === 7 || bar === 15;
      [0, 8].forEach((s) => add(base + s, { v: 'kick' }));
      if (bar % 2 === 1 && !fill) add(base + 10, { v: 'kick' });
      [4, 12].forEach((s) => add(base + s, { v: 'snare' }));
      if (fill) [13, 14, 15].forEach((s) => add(base + s, { v: 'snare', soft: true }));
      for (let s = 0; s < STEPS_PER_BAR; s += 2) {
        if (fill && s >= 12) continue;
        add(base + s, { v: 'hat', open: s === 14 });
      }
    });
    return song;
  }

  // Calm arrangement: warmer chord colours (sevenths and ninths) for the pad,
  // voiced around middle C so they sit under the melody.
  const CALM_PAD = [
    'F#3 A3 C#4 E4', 'G3 C#4 E4', 'A3 D4 F#4', 'F#3 B3 D4',
    'F#3 A3 C#4 E4', 'G3 C#4 E4', 'F#3 B3 D4', 'G3 C#4 E4',
    'F#3 B3 D4', 'G3 C#4 E4', 'E3 A3 C#4', 'A3 D4 F#4',
    'G3 B3 D4', 'G3 C#4 E4', 'F#3 A3 C#4 E4', 'G3 C#4 E4',
  ];
  // Bossa-style patterns, in sixteenth steps. The rim click alternates between
  // two bars, like a clave.
  const CALM_BASS = [[0, 0, 6], [6, 7, 2], [8, 0, 6], [14, 7, 2]]; // [step, interval, length]
  const CALM_RIM = [[0, 3, 6, 10, 13], [2, 6, 9, 12]];

  function buildCalm() {
    const song = emptySong();
    const add = (step, ev) => song[step].push(ev);
    addLead(song);

    CHORDS.forEach(([rootName], bar) => {
      const r = midi(rootName);
      const base = bar * STEPS_PER_BAR;
      CALM_BASS.forEach(([s, iv, len]) => add(base + s, { v: 'bass', m: r + iv, len }));
      add(base, { v: 'pad', ms: CALM_PAD[bar].split(' ').map(midi) });
      // Soft broken chord on the off-beats from bar 5, an octave above the pad.
      if (bar >= 4) {
        const t = CALM_PAD[bar].split(' ').map(midi);
        [2, 6, 10, 14].forEach((s, i) => add(base + s, { v: 'arp', m: t[(i + 1) % t.length] + 12, len: 3 }));
      }
      [0, 8].forEach((s) => add(base + s, { v: 'kick' }));
      CALM_RIM[bar % 2].forEach((s) => add(base + s, { v: 'rim' }));
      for (let s = 0; s < STEPS_PER_BAR; s++) add(base + s, { v: 'shaker', accent: s % 4 === 2 });
    });
    return song;
  }

  // ---------------------------------------------------------------------------
  // Synth voices (work on any BaseAudioContext, so the same code can render
  // offline for previews)
  // ---------------------------------------------------------------------------
  const waveCache = new WeakMap();
  function pulseWave(ctx, duty) {
    let m = waveCache.get(ctx);
    if (!m) { m = {}; waveCache.set(ctx, m); }
    if (!m[duty]) {
      const n = 48;
      const re = new Float32Array(n);
      const im = new Float32Array(n);
      for (let k = 1; k < n; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
      m[duty] = ctx.createPeriodicWave(re, im);
    }
    return m[duty];
  }

  const noiseCache = new WeakMap();
  function noiseBuffer(ctx) {
    let b = noiseCache.get(ctx);
    if (!b) {
      b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = b.getChannelData(0);
      let seed = 0x2f6b1c3d; // fixed seed so renders are repeatable
      for (let i = 0; i < d.length; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        d[i] = seed / 2147483648 - 1;
      }
      noiseCache.set(ctx, b);
    }
    return b;
  }

  // One enveloped oscillator note. Short attack and release avoid clicks.
  function tone(ctx, out, wave, freq, t, dur, vol, opt) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    if (wave === 'triangle' || wave === 'sine' || wave === 'square') o.type = wave;
    else o.setPeriodicWave(pulseWave(ctx, wave === 'pulse12' ? 0.125 : 0.25));
    o.frequency.setValueAtTime(freq, t);
    if (opt && opt.slideTo) o.frequency.exponentialRampToValueAtTime(opt.slideTo, t + dur);
    if (opt && opt.vibrato) {
      // vibrato: true, or { rate, depth (fraction of the pitch), delay (s) }.
      const v = opt.vibrato === true ? {} : opt.vibrato;
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = v.rate || 6;
      lg.gain.setValueAtTime(0, t);
      if (v.delay) lg.gain.setValueAtTime(0, t + Math.min(v.delay, dur * 0.5));
      lg.gain.linearRampToValueAtTime(freq * (v.depth || 0.012), t + dur * 0.6);
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.03);
    }
    const a = opt && opt.attack ? Math.min(opt.attack, dur * 0.4) : Math.min(0.006, dur * 0.2);
    const r = opt && opt.release ? Math.min(opt.release, dur * 0.5) : Math.min(0.03, dur * 0.35);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.setValueAtTime(vol, t + dur - r);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(ctx, out, t, dur, vol, type, freq, q) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuffer(ctx);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q || 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.01);
    s.connect(f).connect(g).connect(out);
    s.start(t, (t * 7.31) % 0.5);
    s.stop(t + dur + 0.02);
  }

  function kick(ctx, out, t, soft) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(soft ? 110 : 150, t);
    o.frequency.exponentialRampToValueAtTime(soft ? 45 : 42, t + 0.12);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(soft ? 0.32 : 0.55, t + (soft ? 0.006 : 0.003));
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    g.gain.linearRampToValueAtTime(0, t + 0.17);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.18);
    if (!soft) noise(ctx, out, t, 0.02, 0.12, 'lowpass', 2500);
  }

  function playOriginal(ctx, out, ev, t, stepDur) {
    switch (ev.v) {
      case 'lead': tone(ctx, out, 'pulse25', hz(ev.m), t, ev.len * stepDur * 0.88, 0.2); break;
      case 'bass': tone(ctx, out, 'triangle', hz(ev.m), t, ev.len * stepDur * 0.9, 0.42); break;
      case 'arp': tone(ctx, out, 'pulse12', hz(ev.m), t, stepDur * 0.8, 0.045); break;
      case 'kick': kick(ctx, out, t); break;
      case 'snare':
        noise(ctx, out, t, ev.soft ? 0.07 : 0.12, ev.soft ? 0.16 : 0.26, 'bandpass', 1900, 0.8);
        if (!ev.soft) tone(ctx, out, 'triangle', 190, t, 0.07, 0.18, { slideTo: 140 });
        break;
      case 'hat': noise(ctx, out, t, ev.open ? 0.09 : 0.03, ev.open ? 0.07 : 0.06, 'highpass', 7000); break;
    }
  }

  // Calm voices: slower attacks, longer releases and darker timbres.
  const CALM_VIBRATO = { rate: 4.5, depth: 0.007, delay: 0.12 };
  function playCalm(ctx, out, ev, t, stepDur) {
    const bar = stepDur * STEPS_PER_BAR;
    switch (ev.v) {
      case 'lead':
        tone(ctx, out, 'triangle', hz(ev.m), t, ev.len * stepDur * 0.97, 0.3,
          { attack: 0.035, release: 0.09, vibrato: ev.len >= 4 ? CALM_VIBRATO : null });
        break;
      case 'bass': tone(ctx, out, 'triangle', hz(ev.m), t, ev.len * stepDur * 0.92, 0.4, { attack: 0.012, release: 0.08 }); break;
      case 'pad':
        // Overlaps the next bar slightly so chord changes crossfade.
        for (const m of ev.ms) {
          tone(ctx, out, 'sine', hz(m), t, bar + 0.25, 0.06, { attack: 0.35, release: 0.6 });
          tone(ctx, out, 'triangle', hz(m) * 1.003, t, bar + 0.25, 0.025, { attack: 0.35, release: 0.6 });
        }
        break;
      case 'arp': tone(ctx, out, 'triangle', hz(ev.m), t, ev.len * stepDur, 0.05, { attack: 0.01, release: 0.2 }); break;
      case 'kick': kick(ctx, out, t, true); break;
      case 'rim': noise(ctx, out, t, 0.035, 0.07, 'bandpass', 1300, 2.5); break;
      case 'shaker': noise(ctx, out, t, ev.accent ? 0.05 : 0.03, ev.accent ? 0.035 : 0.018, 'bandpass', 5200, 1.2); break;
    }
  }

  const ARRANGEMENTS = {
    original: { bpm: 140, song: buildOriginal(), play: playOriginal },
    calm: { bpm: 100, song: buildCalm(), play: playCalm },
  };
  function pickArrangement() {
    const q = root.location && /[?&]music=(\w+)/.exec(root.location.search);
    return q && ARRANGEMENTS[q[1]] ? q[1] : DEFAULT_ARRANGEMENT;
  }
  let arrName = pickArrangement();
  let arr = ARRANGEMENTS[arrName];

  // Short phrases for jingles and effects: [delay, wave, note or Hz, dur, vol, opt].
  const JINGLES = {
    start: [[0, 'pulse25', 'D5', 0.07, 0.2], [0.07, 'pulse25', 'F#5', 0.07, 0.2], [0.14, 'pulse25', 'A5', 0.07, 0.2],
      [0.21, 'pulse25', 'D6', 0.2, 0.2], [0.21, 'triangle', 'D3', 0.2, 0.4]],
    jump: [[0, 'pulse25', 390, 0.1, 0.11, { slideTo: 700 }]],
    double: [[0, 'pulse25', 620, 0.09, 0.1, { slideTo: 1100 }]],
    treat: [[0, 'pulse25', 'A5', 0.055, 0.17], [0.055, 'pulse25', 'D6', 0.1, 0.17]],
    hit: [[0, 'square', 300, 0.28, 0.12, { slideTo: 80 }]],
    over: [[0.3, 'pulse25', 'A5', 0.14, 0.2], [0.46, 'pulse25', 'F#5', 0.14, 0.2], [0.62, 'pulse25', 'D5', 0.14, 0.2],
      [0.8, 'pulse25', 'E5', 0.16, 0.2], [0.98, 'pulse25', 'C#5', 0.5, 0.18, { slideTo: 554 * 0.94, vibrato: true }],
      [0.98, 'triangle', 'A2', 0.5, 0.4], [1.52, 'pulse25', 'D5', 0.16, 0.16], [1.52, 'triangle', 'D2', 0.2, 0.4]],
    record: [[0.3, 'pulse25', 'A4', 0.08, 0.2], [0.38, 'pulse25', 'D5', 0.08, 0.2], [0.46, 'pulse25', 'F#5', 0.08, 0.2],
      [0.54, 'pulse25', 'A5', 0.16, 0.2], [0.72, 'pulse25', 'F#5', 0.08, 0.2], [0.8, 'pulse25', 'A5', 0.08, 0.2],
      [0.88, 'pulse25', 'D6', 0.55, 0.2, { vibrato: true }], [0.88, 'pulse12', 'A5', 0.55, 0.08],
      [0.54, 'triangle', 'D3', 0.16, 0.4], [0.88, 'triangle', 'D2', 0.55, 0.42]],
    toggle: [[0, 'triangle', 'A5', 0.08, 0.3]],
  };

  function playJingle(ctx, out, name, t0) {
    for (const [d, wave, n, dur, vol, opt] of JINGLES[name]) {
      const f = typeof n === 'number' ? n : hz(midi(n));
      tone(ctx, out, wave, f, t0 + d, dur, vol, opt);
    }
    if (name === 'record' || name === 'start') {
      kick(ctx, out, t0 + (name === 'start' ? 0.21 : 0.88));
    }
  }

  // Master chain: buses -> master gain -> gentle limiter -> destination.
  function makeChain(ctx) {
    const master = ctx.createGain();
    master.gain.value = MASTER;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 4;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    const music = ctx.createGain();
    music.gain.value = MUSIC_LEVEL;
    const fx = ctx.createGain();
    music.connect(master);
    fx.connect(master);
    master.connect(limiter).connect(ctx.destination);
    return { master, limiter, music, fx };
  }

  // ---------------------------------------------------------------------------
  // Live player
  // ---------------------------------------------------------------------------
  let ctx = null;
  let chain = null;
  let enabled = true;
  let playing = false;
  let step = 0;
  let nextTime = 0;
  let tempo = 1;
  let timer = null;
  let suspendedByUs = false;

  function stepDur() {
    return 60 / (arr.bpm * tempo) / 4;
  }

  function tick() {
    timer = null;
    if (!playing || !ctx) return;
    // If the clock jumped (e.g. after a long stall), skip ahead instead of
    // firing a burst of late notes.
    if (nextTime < ctx.currentTime - 0.05) nextTime = ctx.currentTime + 0.02;
    while (nextTime < ctx.currentTime + LOOKAHEAD) {
      const d = stepDur();
      for (const ev of arr.song[step]) arr.play(ctx, chain.music, ev, nextTime, d);
      nextTime += d;
      step = (step + 1) % TOTAL_STEPS;
    }
    timer = setTimeout(tick, TICK_MS);
  }

  const Music = {
    // Call from a user gesture (tap, click or key) to satisfy autoplay rules.
    unlock() {
      if (!enabled) return;
      if (!ctx) {
        const AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        chain = makeChain(ctx);
      }
      if (ctx.state === 'suspended' && !suspendedByUs) ctx.resume();
    },

    setEnabled(on) {
      enabled = on;
      if (!ctx) return;
      const t = ctx.currentTime;
      chain.master.gain.cancelScheduledValues(t);
      chain.master.gain.setValueAtTime(chain.master.gain.value, t);
      chain.master.gain.linearRampToValueAtTime(on ? MASTER : 0, t + 0.05);
      if (!on) this.stop();
    },

    // Start the loop from the top, after an optional delay in seconds.
    play(delay) {
      if (!enabled || !ctx) return;
      const t = ctx.currentTime;
      chain.music.gain.cancelScheduledValues(t);
      chain.music.gain.setValueAtTime(MUSIC_LEVEL, t);
      step = 0;
      nextTime = t + (delay || 0.05);
      playing = true;
      if (!timer) tick();
    },

    // Stop the loop, fading out quickly so notes already queued do not ring on.
    stop() {
      playing = false;
      if (timer) { clearTimeout(timer); timer = null; }
      if (!ctx) return;
      const t = ctx.currentTime;
      chain.music.gain.cancelScheduledValues(t);
      chain.music.gain.setValueAtTime(chain.music.gain.value, t);
      chain.music.gain.linearRampToValueAtTime(0, t + 0.15);
    },

    get playing() { return playing; },
    get arrangement() { return arrName; },
    arrangements: Object.keys(ARRANGEMENTS),

    // Switch between 'original' and 'calm'. A playing loop restarts from the top.
    setArrangement(name) {
      if (!ARRANGEMENTS[name] || name === arrName) return;
      arrName = name;
      arr = ARRANGEMENTS[name];
      if (playing) this.play(0.1);
    },
    get ctxState() { return ctx ? ctx.state : 'none'; },

    // Pause everything (game paused or tab hidden). Idempotent, safe every frame.
    setPaused(p) {
      if (!ctx) return;
      if (p && ctx.state === 'running' && !suspendedByUs) {
        suspendedByUs = true;
        ctx.suspend();
      } else if (!p && suspendedByUs) {
        suspendedByUs = false;
        ctx.resume();
      }
    },

    // 1 = normal speed. Clamped to a subtle range.
    setTempo(scale) {
      tempo = Math.min(1.08, Math.max(1, scale));
    },

    sfx(name, delay) {
      if (!enabled || !ctx || !JINGLES[name]) return;
      playJingle(ctx, chain.fx, name, ctx.currentTime + 0.005 + (delay || 0));
    },

    // Extra output tap for recording tools (returns a MediaStream).
    captureStream() {
      if (!ctx) return null;
      const dest = ctx.createMediaStreamDestination();
      chain.limiter.connect(dest);
      return dest.stream;
    },

    // Render a loop offline (for previews). Resolves with an AudioBuffer.
    // name defaults to the current arrangement.
    renderLoop(seconds, fadeOut, name) {
      const a = ARRANGEMENTS[name] || arr;
      const sr = 44100;
      const OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
      const off = new OAC(2, Math.ceil(seconds * sr), sr);
      const c = makeChain(off);
      const d = 60 / a.bpm / 4;
      let t = 0.05;
      for (let i = 0; t < seconds; i++, t += d) {
        for (const ev of a.song[i % TOTAL_STEPS]) a.play(off, c.music, ev, t, d);
      }
      if (fadeOut) {
        c.master.gain.setValueAtTime(MASTER, seconds - fadeOut);
        c.master.gain.linearRampToValueAtTime(0, seconds - 0.02);
      }
      return off.startRendering();
    },

    get loopSeconds() { return (60 / arr.bpm / 4) * TOTAL_STEPS; },
  };

  root.LinusMusic = Music;
})(typeof window !== 'undefined' ? window : globalThis);
