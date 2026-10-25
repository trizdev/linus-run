# Linus Run

A small endless runner starring Linus, a white Maltese, running along the beach
promenade of Balneário Camboriú. Everything is drawn in code on a canvas: no
images, no external files, no network requests.

## Art style

The game uses 16-bit style pixel art. Linus and the props are hand-placed pixel
maps (one string per row, one character per palette color) in `sprites.js`.
Linus is a 48x40 sprite drawn in side profile, facing right, so his head and
body match. He has a round fluffy skull, a short snout with a big black nose, a
large glossy eye, a peach-orange tear stain running from the eye to the muzzle,
soft floppy ears with cream tips, an open happy mouth with a pink tongue, a
compact white coat, short legs, a curled feathery tail and a navy bandana with a
white trim and dots. He has four run frames (ears and tail bounce), jump up,
jump down and a dizzy frame. He is drawn at the same pixel scale as the world.

The world is drawn into a low-resolution buffer (about 320x180 on a 720p screen)
and scaled up by a whole number with smoothing off, so every pixel stays crisp.
Text and the HUD are drawn at full resolution on top so they stay readable.

## How to play

- **Jump:** tap, click, `Space` or `↑` (also `W`).
- **Higher jump:** hold the button a little longer.
- **Double jump:** press again while in the air.
- Jump over sand castles, umbrella bases, skateboards and walking pigeons.
- Do **not** jump into the flying pigeons: stay low and run underneath.
- Grab the treats (bones) for +25 points each.
- `M` or the speaker button toggles sound and music (on by default; the
  choice is remembered). `P` or `Esc` pauses.
- The game pauses on its own when the tab is hidden.

Your best score is saved in the browser (localStorage).

## Music

The theme, "Calçadão", is an original loop synthesized live with the Web
Audio API in `music.js`. There are no audio files and nothing is loaded from
the network. It comes in two arrangements: the calm one plays by default, and
the original chiptune one is still available.

### Original arrangement

Open `index.html?music=original`, or call
`LinusMusic.setArrangement('original')` in the console.

- 140 BPM in D major, 16 bars (about 27 s) that loop seamlessly.
- Chords: `D A Bm G | D A G A | G A F#m Bm | Em A D A`.
- Voices: a 25% pulse lead, a triangle bass (root, octave, fifth), a soft
  12.5% pulse arpeggio from bar 5, and noise drums (sine-sweep kick,
  filtered-noise snare and hats, small fills at bars 8 and 16).

### Calm arrangement

The default arrangement of the same tune, for a sunset-at-the-beach mood
(`DEFAULT_ARRANGEMENT` in `music.js`).

- 100 BPM, same melody and chords, loop of about 38 s.
- Soft triangle lead with a slower attack and gentle delayed vibrato on the
  long notes.
- Warm pad of seventh and ninth chords that crossfade between bars, plus a
  soft off-beat broken chord from bar 5.
- Bossa-style bass (dotted root, then the fifth on the off-beat) and a soft
  rim click in a two-bar clave pattern.
- Drums are only a quiet shaker and a gentle kick, with no fills.

It plays by default. `index.html?music=calm` also selects it explicitly.

### Shared by both

- Notes are queued with a lookahead scheduler on the audio clock (a 25 ms
  timer looks 120 ms ahead), so the tempo never drifts with the frame rate.
- The tempo rises up to 6% as the run speeds up.
- Jingles in key: start sting, jump and double-jump chirps, treat blip,
  a sad-but-cute game-over phrase and a "Novo recorde!" fanfare.
- Every note has short attack and release ramps (no clicks). The master gain
  is 0.25 into a limiter, so nothing clips.
- Browsers block sound until the first tap, click or key, so the audio starts
  with the first input. Music pauses with the game or when the tab is hidden.

## How to play locally

There is no build step and nothing to install. Clone the repo and open
`index.html` in a browser, or serve the folder with any static server, for
example:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Files

- `index.html`: page shell and sound button
- `style.css`: full-screen canvas layout
- `sprites.js`: pixel maps and palettes for Linus, obstacles and treats
- `music.js`: synthesized theme, scheduler and sound effects
- `game.js`: game loop, physics, drawing and input
