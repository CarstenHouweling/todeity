// Sound effects synthesised with the Web Audio API: no audio files needed.
// Music (see Music.js) and effects have their own volume channels.

const SFX_VOLUME = 0.5;
const MUSIC_VOLUME = 0.32;
const VOICE_VOLUME = 1; // voices are tuned to come through clearly over the loudest song (see babble)

let context = null;
let sfxBus = null;
let musicBus = null;
let musicFilter = null;
let musicDuck = null; // dips the music while someone talks
let musicScene = null; // the music's level for where we are (quieter in a garden, see setMusicScene)
let sceneLevel = 1;
let voiceBus = null; // voices have their own level and a limiter, so they can be loud without distorting
let master = null;
const settings = { sfx: true, music: true };
const lastPlayed = new Map();
const unlockListeners = [];

try {
  Object.assign(settings, JSON.parse(localStorage.getItem('tode-sound') ?? '{}'));
} catch {
  // Storage can be blocked; sound just starts on.
}

function saveSettings() {
  try {
    localStorage.setItem('tode-sound', JSON.stringify(settings));
  } catch {
    // Ignore: the settings just won't be remembered.
  }
}

/** Browsers only allow audio after a user gesture, so call this from input handlers. */
export function unlockAudio() {
  if (!context) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    context = new AudioContext();
    master = context.createGain();
    master.connect(context.destination);

    sfxBus = context.createGain();
    sfxBus.gain.value = settings.sfx ? SFX_VOLUME : 0;
    sfxBus.connect(master);

    // Music runs through a filter so the pause menu can muffle it.
    musicFilter = context.createBiquadFilter();
    musicFilter.type = 'lowpass';
    musicFilter.frequency.value = 20000;
    musicBus = context.createGain();
    musicBus.gain.value = settings.music ? MUSIC_VOLUME : 0;
    musicDuck = context.createGain();
    musicScene = context.createGain();
    musicScene.gain.value = sceneLevel;
    musicBus.connect(musicFilter).connect(musicDuck).connect(musicScene).connect(master);

    voiceBus = context.createGain();
    voiceBus.gain.value = settings.sfx ? VOICE_VOLUME : 0;
    const limiter = context.createDynamicsCompressor();
    Object.entries({ threshold: -12, knee: 6, ratio: 8, attack: 0.003, release: 0.15 }).forEach(([key, value]) => (limiter[key].value = value));
    voiceBus.connect(limiter).connect(master);

    unlockListeners.forEach((listener) => listener());
  }
  if (context.state === 'suspended') context.resume();
}

/** Runs `listener` once audio is available (immediately if it already is). */
export function onAudioUnlocked(listener) {
  if (context) listener();
  else unlockListeners.push(listener);
}

export function audio() {
  return { context, musicBus };
}

export function soundSettings() {
  return { ...settings };
}

export function setSound(channel, on) {
  settings[channel] = on;
  saveSettings();
  if (!context) return;
  if (channel === 'sfx') {
    sfxBus.gain.value = on ? SFX_VOLUME : 0;
    voiceBus.gain.value = on ? VOICE_VOLUME : 0;
  }
  if (channel === 'music') musicBus.gain.setTargetAtTime(on ? MUSIC_VOLUME : 0, context.currentTime, 0.1);
}

/**
 * Dev: how loud the game is at the speakers. `meter()` returns a function giving the RMS of the last ~40 ms; call it
 * every frame while a sound plays and keep the highest (see DEVELOPMENT.md for the levels things are tuned to).
 */
export function meter() {
  if (!context) return () => 0;
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  const silent = context.createGain();
  silent.gain.value = 0;
  master.connect(analyser).connect(silent).connect(context.destination);
  const data = new Float32Array(analyser.fftSize);
  return () => {
    analyser.getFloatTimeDomainData(data);
    return Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length);
  };
}

/** Muffles the music, e.g. while paused. */
export function muffleMusic(muffled) {
  if (!context) return;
  musicFilter.frequency.setTargetAtTime(muffled ? 700 : 20000, context.currentTime, 0.15);
}

// --- Synth building blocks (also used by Music.js) ---------------------------

export function tone({ type = 'sine', frequency, to = frequency, duration, volume = 0.2, delay = 0, at, bus = sfxBus, attack = 0.008 }) {
  const start = at ?? context.currentTime + delay;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (to !== frequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(bus);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
  return oscillator;
}

/**
 * A sung or spoken syllable: a buzz through a vowel's two resonances (see the voices below), so even a deep one
 * comes through phone and laptop speakers. `vowel`: an index into VOWELS; `to`: the pitch at the end.
 */
function syllable({ pitch, to = pitch, vowel = 0, length = 0.15, volume = 0.5, delay = 0, type = 'sawtooth', breath = 0 }) {
  const at = context.currentTime + delay;
  const [f1, f2] = VOWELS[vowel];
  const lift = Math.max(1, pitch / 280);
  const mouth = context.createGain();
  const envelope = context.createGain();
  for (const [frequency, q, level] of [[f1 * lift, 5, 1], [f2 * lift, 7, 0.7]]) {
    const resonance = context.createBiquadFilter();
    resonance.type = 'bandpass';
    resonance.frequency.value = frequency;
    resonance.Q.value = q;
    const amount = context.createGain();
    amount.gain.value = level;
    mouth.connect(resonance).connect(amount).connect(envelope);
  }
  envelope.gain.setValueAtTime(0.0001, at);
  envelope.gain.exponentialRampToValueAtTime(volume, at + Math.min(0.03, length * 0.2));
  envelope.gain.setValueAtTime(volume, at + length * 0.6);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + length);
  envelope.connect(sfxBus);
  const oscillator = context.createOscillator();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(pitch, at);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + length);
  oscillator.connect(mouth);
  oscillator.start(at);
  oscillator.stop(at + length + 0.02);
  // An "h" in front (a laugh's breath).
  if (breath) noise({ duration: 0.06, volume: breath, filter: 'highpass', frequency: 1800, delay: Math.max(0, delay - 0.03) });
}

let noiseBuffer = null;
export function noise({ duration, volume = 0.2, filter = 'bandpass', frequency = 1000, to = frequency, q = 1, delay = 0, at, bus = sfxBus }) {
  if (!noiseBuffer) {
    noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const start = at ?? context.currentTime + delay;
  const source = context.createBufferSource();
  source.buffer = noiseBuffer;
  const biquad = context.createBiquadFilter();
  biquad.type = filter;
  biquad.Q.value = q;
  biquad.frequency.setValueAtTime(frequency, start);
  if (to !== frequency) biquad.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);
  const gain = context.createGain();
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(biquad).connect(gain).connect(bus);
  source.start(start, Math.random() * 0.5);
  source.stop(start + duration + 0.02);
}

const notes = (frequencies, { type = 'triangle', step = 0.09, duration = 0.18, volume = 0.18 } = {}) =>
  frequencies.forEach((frequency, i) => tone({ type, frequency, duration, volume, delay: i * step }));

const vary = (value, amount = 0.08) => value * (1 + (Math.random() * 2 - 1) * amount);

const SOUNDS = {
  spit: () => tone({ frequency: vary(820), to: 380, duration: 0.07, volume: 0.07 }),
  hit: () => {
    noise({ duration: 0.06, volume: 0.12, frequency: 2400, q: 2 });
    tone({ type: 'square', frequency: vary(260), to: 140, duration: 0.06, volume: 0.04 });
  },
  pop: () => {
    tone({ type: 'triangle', frequency: vary(420), to: 980, duration: 0.11, volume: 0.13 });
    noise({ duration: 0.12, volume: 0.08, frequency: 3000, to: 900 });
  },
  splash: () => {
    noise({ duration: 0.45, volume: 0.35, filter: 'lowpass', frequency: 2600, to: 250 });
    tone({ frequency: 220, to: 70, duration: 0.3, volume: 0.12 });
  },
  dash: () => noise({ duration: 0.18, volume: 0.16, frequency: 700, to: 2400, q: 1.5 }),
  hurt: () => {
    tone({ type: 'square', frequency: 330, to: 110, duration: 0.25, volume: 0.08 });
    noise({ duration: 0.15, volume: 0.12, filter: 'lowpass', frequency: 1200 });
  },
  shield: () => notes([1200, 900, 1500], { type: 'sine', step: 0.04, duration: 0.15, volume: 0.1 }),
  sting: () => tone({ type: 'sawtooth', frequency: vary(1300), to: 800, duration: 0.06, volume: 0.025 }),
  tick: () => tone({ type: 'triangle', frequency: vary(1500, 0.1), to: 1100, duration: 0.035, volume: 0.06 }),
  graze: () => tone({ type: 'sine', frequency: vary(2300, 0.05), to: 3100, duration: 0.05, volume: 0.035 }),
  leafStorm: () => {
    notes([660, 880, 1175, 1568], { type: 'sine', step: 0.05, duration: 0.22, volume: 0.09 });
    noise({ duration: 0.5, volume: 0.06, filter: 'highpass', frequency: 4000, to: 7000 });
  },
  zap: () => {
    noise({ duration: 0.12, volume: 0.12, filter: 'highpass', frequency: 3000 });
    tone({ type: 'square', frequency: vary(1800), to: 300, duration: 0.1, volume: 0.04 });
  },
  thunder: () => {
    noise({ duration: 1.4, volume: 0.45, filter: 'lowpass', frequency: 900, to: 60 });
    noise({ duration: 0.15, volume: 0.25, filter: 'highpass', frequency: 2500 });
  },
  boom: () => {
    tone({ frequency: 120, to: 30, duration: 0.7, volume: 0.35 });
    noise({ duration: 0.9, volume: 0.35, filter: 'lowpass', frequency: 1500, to: 80 });
  },
  burn: () => noise({ duration: 0.12, volume: 0.04, frequency: 900, q: 0.7 }),
  charge: () => tone({ type: 'sawtooth', frequency: 90, to: 160, duration: 0.8, volume: 0.06 }),
  beamCharge: () => {
    tone({ type: 'sawtooth', frequency: 110, to: 880, duration: 0.7, volume: 0.08 });
    noise({ duration: 0.7, volume: 0.1, frequency: 400, to: 4000, q: 4 });
  },
  beam: () => {
    tone({ type: 'sawtooth', frequency: 70, duration: 1.6, volume: 0.12 });
    noise({ duration: 1.6, volume: 0.22, filter: 'lowpass', frequency: 1800 });
  },
  whistle: () => tone({ type: 'sine', frequency: 1800, to: 300, duration: 0.9, volume: 0.08 }),
  nova: () => noise({ duration: 0.35, volume: 0.15, frequency: 500, to: 3000, q: 3 }),
  heal: () => notes([660, 990], { type: 'sine', step: 0.07, volume: 0.1 }),
  revive: () => notes([392, 523, 659, 784, 1047, 1319], { type: 'sine', step: 0.07, duration: 0.5, volume: 0.15 }),
  ultimateReady: () => notes([880, 1320], { type: 'triangle', step: 0.08, volume: 0.12 }),
  waveStart: () => notes([392, 523, 659], { step: 0.11, volume: 0.13 }),
  waveClear: () => notes([523, 659, 784, 1047], { step: 0.08, volume: 0.14 }),
  pick: () => notes([784, 1175], { type: 'sine', step: 0.06, volume: 0.14 }),
  legendary: () => notes([523, 784, 1047, 1568, 2093], { type: 'sine', step: 0.06, duration: 0.5, volume: 0.13 }),
  ascend: () => {
    notes([220, 330, 440, 554, 659, 880], { type: 'sawtooth', step: 0.12, duration: 0.9, volume: 0.07 });
    noise({ duration: 1.5, volume: 0.2, frequency: 300, to: 6000, q: 2 });
  },
  boss: () => notes([196, 185, 175, 147], { type: 'sawtooth', step: 0.16, duration: 0.3, volume: 0.07 }),
  victory: () => notes([523, 659, 784, 1047, 784, 1047], { step: 0.1, duration: 0.22, volume: 0.15 }),
  gameOver: () => notes([392, 330, 262, 196], { step: 0.18, duration: 0.35, volume: 0.13 }),
  click: () => tone({ frequency: 660, duration: 0.05, volume: 0.06 }),
  streak: () => {
    notes([659, 880, 1319], { type: 'square', step: 0.05, duration: 0.2, volume: 0.06 });
    noise({ duration: 0.3, volume: 0.12, filter: 'highpass', frequency: 3000 });
  },
  roar: () => {
    tone({ type: 'sawtooth', frequency: 70, to: 140, duration: 1.1, volume: 0.15 });
    noise({ duration: 1.2, volume: 0.3, filter: 'lowpass', frequency: 700, to: 200 });
  },
  // The garden (v0.26): emotes and trinkets that answer a boop. Tuned with `meter()` against the effects players
  // know (pick ~0.05, legendary ~0.06 RMS at full sound): everything sits in the 300–3,000 Hz that small speakers play.
  chime: () => notes([vary(1568, 0.02), 2093, 2637, 3136].sort(() => Math.random() - 0.5), { type: 'sine', step: 0.09, duration: 0.7, volume: 0.11 }),
  quack: () => {
    syllable({ pitch: 440, to: 330, vowel: 5, length: 0.13, volume: 0.9 });
    syllable({ pitch: 420, to: 300, vowel: 5, length: 0.16, volume: 0.9, delay: 0.17 });
  },
  boing: () => tone({ type: 'sine', frequency: 220, to: 880, duration: 0.3, volume: 0.16 }),
  launch: () => {
    tone({ type: 'sine', frequency: 700, to: 2600, duration: 0.85, volume: 0.09 });
    noise({ duration: 0.8, volume: 0.07, filter: 'highpass', frequency: 2500 });
  },
  crackle: () => {
    noise({ duration: 0.4, volume: 0.65, filter: 'lowpass', frequency: 1600, to: 300 });
    tone({ type: 'triangle', frequency: 320, to: 110, duration: 0.25, volume: 0.12 });
    for (let i = 0; i < 8; i++) noise({ duration: 0.035, volume: 0.14, frequency: 2500 + Math.random() * 2500, q: 2, delay: 0.2 + Math.random() * 0.6 });
  },
  popper: () => {
    noise({ duration: 0.16, volume: 0.6, frequency: 1600, to: 600, q: 0.8 });
    notes([784, 988, 1175, 1568], { type: 'triangle', step: 0.06, volume: 0.12 });
  },
  // "Ha ha ha ha!": breathy "ah"s falling in pitch, then a wheeze.
  laugh: () => {
    const base = vary(360, 0.1);
    for (let i = 0; i < 6; i++) syllable({ pitch: base * (1 - i * 0.05), to: base * (0.92 - i * 0.05), vowel: i % 3 === 2 ? 5 : 0, length: 0.11, volume: 0.75, delay: i * 0.14, breath: 0.05 });
    syllable({ pitch: base * 1.3, to: base * 0.9, vowel: 2, length: 0.35, volume: 0.45, delay: 0.92 });
  },
  // A snore: a rattling "aw" breathing in, a soft "pfff" out.
  snore: () => {
    syllable({ pitch: 95, to: 120, vowel: 3, length: 1, volume: 0.55 });
    noise({ duration: 1, volume: 0.06, frequency: 600, to: 900, q: 1.5 });
    noise({ duration: 0.6, volume: 0.08, filter: 'highpass', frequency: 1800, delay: 1.1 });
  },
  fanfare: () => notes([392, 523, 659, 784, 659, 784, 1047], { type: 'triangle', step: 0.1, duration: 0.25, volume: 0.15 }),
  clap: () => {
    noise({ duration: 0.06, volume: 0.3, frequency: 1800, q: 1.2 });
    notes([1047, 1568], { type: 'sine', step: 0.06, volume: 0.12 });
  },
  // Powering up: a rising roar ("aaaAAAH") over rushing wind and a rumble.
  powerUp: () => {
    syllable({ pitch: 120, to: 330, vowel: 0, length: 1.55, volume: 0.6 });
    syllable({ pitch: 180, to: 495, vowel: 3, length: 1.55, volume: 0.35 });
    noise({ duration: 1.5, volume: 0.14, frequency: 400, to: 3200, q: 1.5 });
    tone({ type: 'triangle', frequency: 220, to: 440, duration: 1.5, volume: 0.06 });
  },
  // The sonic boom when the form bursts out.
  sonicBoom: () => {
    noise({ duration: 0.9, volume: 0.75, filter: 'lowpass', frequency: 2600, to: 150 });
    tone({ type: 'sawtooth', frequency: 260, to: 70, duration: 0.6, volume: 0.12 });
    notes([523, 784, 1047, 1568], { type: 'sine', step: 0.05, duration: 0.6, volume: 0.1 });
  },
  // Love: two soft heartbeats and a rising "aww".
  love: () => {
    for (const at of [0, 0.22]) tone({ type: 'triangle', frequency: 330, to: 180, duration: 0.12, volume: 0.14, delay: at });
    notes([659, 784, 988], { type: 'sine', step: 0.12, duration: 0.4, volume: 0.1 });
  },
};

// Dance: a little groove, one eighth note per call (`step` counts on), two bars long. Kick on the beats, a snare
// on 2 and 4, a hi-hat in between, a walking bass and a plucked hook.
const GROOVE_BASS = [220, 0, 220, 262, 196, 0, 196, 247, 175, 0, 175, 220, 196, 0, 247, 294];
const GROOVE_HOOK = [880, 0, 0, 784, 0, 659, 0, 0, 698, 0, 0, 659, 0, 587, 659, 0];
export function groove(step) {
  if (!context || !settings.sfx || context.state !== 'running') return;
  duckMusicFor(0.5); // the groove is the music while someone dances
  const i = step % 16;
  if (i % 2 === 0) {
    tone({ type: 'sine', frequency: 180, to: 60, duration: 0.16, volume: 0.22 });
    noise({ duration: 0.02, volume: 0.12, frequency: 3500, q: 1 }); // the kick's click (small speakers lose the thump)
  }
  if (i % 4 === 2) noise({ duration: 0.12, volume: 0.16, frequency: 1800, q: 0.9 });
  if (i % 2 === 1) noise({ duration: 0.03, volume: 0.05, filter: 'highpass', frequency: 7000 });
  if (GROOVE_BASS[i]) tone({ type: 'triangle', frequency: GROOVE_BASS[i], duration: 0.2, volume: 0.12 });
  if (GROOVE_HOOK[i]) tone({ type: 'square', frequency: GROOVE_HOOK[i], duration: 0.12, volume: 0.025 });
}

// Minimum seconds between two plays of the same sound, so big fights don't get too loud.
const THROTTLE = { hit: 0.03, pop: 0.04, sting: 0.05, spit: 0.04, zap: 0.04, burn: 0.08, thunder: 0.3, boom: 0.1 };

export function play(name) {
  if (!context || !settings.sfx || context.state !== 'running') return;
  const now = context.currentTime;
  if (now - (lastPlayed.get(name) ?? -1) < (THROTTLE[name] ?? 0)) return;
  lastPlayed.set(name, now);
  SOUNDS[name]?.();
}

// --- Voices ---------------------------------------------------------------------
// Characters "talk" in a babble of short synthesized syllables while their line is typed out, each pitched to the
// speaker: no recorded voices needed. Every syllable is a vowel: the voice's buzz shaped by the two resonances of
// a mouth (F1, F2). Those sit at 300–2,300 Hz whatever the pitch, so even deep voices come through phone and tablet
// speakers, which barely play anything under 200 Hz. They go to their own bus (`voiceBus`), loud enough to be
// heard over a boss theme, and the music dips while anyone talks.
let voiceNodes = [];
// [F1, F2] in Hz for "ah", "eh", "ee", "aw", "oo", "ae".
const VOWELS = [[750, 1200], [500, 1850], [330, 2250], [520, 950], [380, 1050], [620, 1650]];
const VOICE_GAIN = 6; // make-up gain: the narrow vowel filters only let a few harmonics through
const WAVE_GAIN = { triangle: 2 }; // a triangle's overtones are faint, so less of it gets through the vowels
const MUSIC_DUCK = 0.3; // the music's level while someone talks

let duckFrom = 0;
let duckTo = 0;

/**
 * Dips the music for `seconds` from `start` (context time), so a line can be heard over a boss theme. Lines that
 * are scheduled together (a Duo exchange) share one dip from the first to the last.
 */
function duckMusic(start, seconds) {
  const now = context.currentTime;
  const pending = duckTo > now;
  duckFrom = pending ? Math.max(now, Math.min(duckFrom, start)) : start;
  duckTo = pending ? Math.max(duckTo, start + seconds) : start + seconds;
  const { gain } = musicDuck;
  gain.cancelScheduledValues(now);
  gain.setTargetAtTime(MUSIC_DUCK, duckFrom, 0.08);
  gain.setTargetAtTime(1, duckTo, 0.4);
}

/**
 * The music's level for the place we're in: 1 on the title screen and in a run, lower in a garden, where the emotes'
 * and boops' sounds are the show (the garden theme drowned them out).
 */
export function setMusicScene(level) {
  if (level === sceneLevel) return;
  sceneLevel = level;
  if (musicScene) musicScene.gain.setTargetAtTime(level, context.currentTime, 0.3);
}

/** Dips the music for `seconds` from now (an emote or a boop playing in a garden). */
export function duckMusicFor(seconds) {
  if (context && settings.music) duckMusic(context.currentTime, seconds);
}

/** Stops every babble that is still scheduled (a menu closed before the line was done). */
export function hush() {
  if (!context) return;
  for (const node of voiceNodes) {
    try {
      node.stop();
    } catch {
      // Already stopped.
    }
  }
  voiceNodes = [];
  duckTo = 0;
  musicDuck.gain.cancelScheduledValues(context.currentTime);
  musicDuck.gain.setTargetAtTime(1, context.currentTime, 0.2);
}

/**
 * Babbles `text` in a `voice` ({ pitch, type, rate: syllables per second, wobble: pitch variation, loud, volume,
 * layer: a second voice at `pitch × layer` for a growl or a choir }), starting after `delay` seconds and lasting as
 * long as typing it out at `charsPerSecond`.
 */
export function babble(voice, text, delay = 0, charsPerSecond = 45) {
  if (!context || !settings.sfx || context.state !== 'running' || !voice || !text) return;
  const duration = Math.min(4, text.length / charsPerSecond);
  const count = Math.max(2, Math.round(duration * voice.rate));
  const step = duration / count;
  const start = context.currentTime + delay;
  const shouting = voice.loud && text === text.toUpperCase();
  const volume = (voice.volume ?? (voice.loud ? 0.14 : 0.11)) * (shouting ? 1.3 : 1) * VOICE_GAIN * (WAVE_GAIN[voice.type] ?? 1);
  voiceNodes = voiceNodes.filter((node) => node.endsAt > context.currentTime);
  duckMusic(start, duration);
  for (let i = 0; i < count; i++) {
    if (Math.random() < 0.08) continue; // little pauses between "words"
    const at = start + i * step + Math.random() * step * 0.1;
    const length = step * (0.75 + Math.random() * 0.2);
    // Questions go up at the end, everything else drops a little.
    const ending = i >= count - 2 ? (text.trim().endsWith('?') ? 1.25 : 0.85) : 1;
    const pitch = voice.pitch * ending * (1 + (Math.random() * 2 - 1) * voice.wobble);
    const glide = 0.9 + Math.random() * 0.25;
    // The mouth: two vowel resonances (a little higher for small, high voices).
    const [f1, f2] = VOWELS[Math.floor(Math.random() * VOWELS.length)];
    const lift = Math.max(1, pitch / 280);
    const mouth = context.createGain();
    const envelope = context.createGain();
    for (const [frequency, q, level] of [[f1 * lift, 5, 1], [f2 * lift, 7, 0.7]]) {
      const resonance = context.createBiquadFilter();
      resonance.type = 'bandpass';
      resonance.frequency.value = frequency;
      resonance.Q.value = q;
      const amount = context.createGain();
      amount.gain.value = level;
      mouth.connect(resonance).connect(amount).connect(envelope);
    }
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(volume, at + 0.02);
    envelope.gain.setValueAtTime(volume, at + length * 0.6);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + length);
    envelope.connect(voiceBus);
    for (const factor of voice.layer ? [1, voice.layer] : [1]) {
      const oscillator = context.createOscillator();
      oscillator.type = voice.type;
      oscillator.frequency.setValueAtTime(pitch * factor, at);
      oscillator.frequency.exponentialRampToValueAtTime(pitch * factor * glide, at + length);
      oscillator.connect(mouth);
      oscillator.start(at);
      oscillator.stop(at + length + 0.02);
      oscillator.endsAt = at + length + 0.02;
      voiceNodes.push(oscillator);
    }
  }
}
