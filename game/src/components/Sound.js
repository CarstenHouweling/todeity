// Sound effects synthesised with the Web Audio API: no audio files needed.
// Music (see Music.js) and effects have their own volume channels.

const SFX_VOLUME = 0.5;
const MUSIC_VOLUME = 0.32;

let context = null;
let sfxBus = null;
let musicBus = null;
let musicFilter = null;
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
    const master = context.createGain();
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
    musicBus.connect(musicFilter).connect(master);

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
  if (channel === 'sfx') sfxBus.gain.value = on ? SFX_VOLUME : 0;
  if (channel === 'music') musicBus.gain.setTargetAtTime(on ? MUSIC_VOLUME : 0, context.currentTime, 0.1);
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
};

// Minimum seconds between two plays of the same sound, so big fights don't get too loud.
const THROTTLE = { hit: 0.03, pop: 0.04, sting: 0.05, spit: 0.04, zap: 0.04, burn: 0.08, thunder: 0.3, boom: 0.1 };

export function play(name) {
  if (!context || !settings.sfx || context.state !== 'running') return;
  const now = context.currentTime;
  if (now - (lastPlayed.get(name) ?? -1) < (THROTTLE[name] ?? 0)) return;
  lastPlayed.set(name, now);
  SOUNDS[name]?.();
}
