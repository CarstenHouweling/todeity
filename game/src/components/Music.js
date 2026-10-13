// Procedural "orchestral" soundtrack, synthesised in the browser and layered by intensity:
//   0 calm  → soft strings, harp arpeggios and a plucked melody (title screen, between waves)
//   1       → + taiko drums, shakers, sub bass, string ostinato
//   2       → + snare, driving bass, 16th-note strings, brass stabs
//   3       → + horn melody, choir, crashes, drum fills, cymbal swells
//   4       → + melody harmony, double-time percussion (god tier, final waves, bosses)
// Everything runs through a compressor and a reverb "hall" for size.
import { audio, noise, onAudioUnlocked, tone } from './Sound.js';

const midi = (note) => 440 * 2 ** ((note - 69) / 12);

/** Melody as [step, note, length] per bar → a 64-step lookup. */
function melody(bars) {
  const steps = new Array(64).fill(null);
  bars.forEach((notes, bar) => notes.forEach(([step, note, length]) => (steps[bar * 16 + step] = { note, length })));
  return steps;
}

// i – VI – III – VII in A minor: the classic heroic progression.
const HEROIC_CHORDS = [
  [57, 60, 64],
  [53, 57, 60],
  [48, 52, 55],
  [55, 59, 62],
];
const HEROIC_ROOTS = [45, 41, 36, 43];

const SONGS = {
  garden: {
    bpm: 92,
    chords: HEROIC_CHORDS,
    roots: HEROIC_ROOTS,
    melody: melody([
      [[0, 76, 4], [6, 74, 2], [8, 72, 6]],
      [[0, 72, 4], [6, 69, 2], [8, 65, 6]],
      [[0, 67, 4], [6, 72, 2], [8, 76, 6]],
      [[0, 74, 4], [6, 71, 2], [8, 67, 6]],
    ]),
  },
  battle: {
    bpm: 132,
    chords: HEROIC_CHORDS,
    roots: HEROIC_ROOTS,
    melody: melody([
      [[0, 69, 3], [3, 72, 3], [6, 76, 2], [8, 74, 2], [10, 72, 2], [12, 69, 4]],
      [[0, 72, 3], [3, 69, 3], [6, 65, 2], [8, 67, 2], [10, 69, 6]],
      [[0, 76, 3], [3, 79, 3], [6, 76, 2], [8, 74, 2], [10, 72, 2], [12, 74, 2], [14, 76, 2]],
      [[0, 74, 3], [3, 71, 3], [6, 67, 2], [8, 69, 2], [10, 71, 2], [12, 74, 4]],
    ]),
  },
  boss: {
    bpm: 140,
    boss: true,
    // i – VI – iv – V: dark, with the tension of the major V.
    chords: [
      [57, 60, 64],
      [53, 57, 60],
      [50, 53, 57],
      [52, 56, 59],
    ],
    roots: [45, 41, 38, 40],
    melody: melody([
      [[0, 69, 2], [2, 69, 2], [4, 72, 2], [6, 71, 2], [8, 69, 4], [12, 64, 4]],
      [[0, 72, 2], [2, 72, 2], [4, 77, 2], [6, 76, 2], [8, 72, 4], [12, 69, 4]],
      [[0, 74, 2], [2, 74, 2], [4, 77, 2], [6, 76, 2], [8, 74, 4], [12, 69, 4]],
      [[0, 76, 4], [4, 75, 2], [6, 76, 2], [8, 80, 4], [12, 76, 4]],
    ]),
  },
  // God of Tea: VI – VII – i – III, soaring and triumphant.
  divine: {
    bpm: 140,
    chords: [
      [53, 57, 60],
      [55, 59, 62],
      [57, 60, 64],
      [48, 52, 55],
    ],
    roots: [41, 43, 45, 36],
    melody: melody([
      [[0, 72, 4], [4, 74, 2], [6, 76, 2], [8, 77, 6], [14, 76, 2]],
      [[0, 74, 4], [4, 71, 2], [6, 74, 2], [8, 79, 8]],
      [[0, 76, 3], [3, 77, 3], [6, 79, 2], [8, 81, 6], [14, 79, 2]],
      [[0, 79, 4], [4, 76, 4], [8, 72, 8]],
    ]),
  },
};

// A minor scale, for harmonising the melody a third below.
const SCALE = new Set([9, 11, 0, 2, 4, 5, 7]);
function thirdBelow(note) {
  for (const interval of [3, 4]) if (SCALE.has((note - interval + 120) % 12)) return note - interval;
  return note - 3;
}

// --- Signal chain: everything → compressor, plus a reverb send ---------------------

let chain = null;

function hallImpulse(context, seconds, decay) {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
  }
  return buffer;
}

function setupChain() {
  const { context, musicBus } = audio();
  const input = context.createGain();
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -20;
  compressor.knee.value = 12;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.005;
  compressor.release.value = 0.25;
  const makeUp = context.createGain();
  makeUp.gain.value = 1.6;
  const reverb = context.createConvolver();
  reverb.buffer = hallImpulse(context, 2.8, 2.4);
  const send = context.createGain();
  send.gain.value = 0.35;

  input.connect(compressor);
  input.connect(send).connect(reverb).connect(compressor);
  compressor.connect(makeUp).connect(musicBus);
  chain = { input };
}

function voice({
  type,
  frequency,
  at,
  duration,
  volume,
  attack = 0.01,
  release = 0.12,
  cutoff,
  cutoffPeak, // filter envelope: opens to this right after the attack (brass "blare")
  q = 0.7,
  detune = 0,
  vibrato = 0,
  pan = 0,
}) {
  const { context } = audio();
  const end = at + duration + release;
  const oscillator = context.createOscillator();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  oscillator.detune.value = detune;
  let node = oscillator;

  if (vibrato) {
    const lfo = context.createOscillator();
    const depth = context.createGain();
    lfo.frequency.value = 5.2;
    depth.gain.setValueAtTime(0, at);
    depth.gain.linearRampToValueAtTime(frequency * vibrato, at + Math.min(0.4, duration));
    lfo.connect(depth).connect(oscillator.frequency);
    lfo.start(at);
    lfo.stop(end + 0.05);
  }
  if (cutoff) {
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = q;
    filter.frequency.setValueAtTime(cutoff, at);
    if (cutoffPeak) {
      filter.frequency.exponentialRampToValueAtTime(cutoffPeak, at + attack + 0.06);
      filter.frequency.exponentialRampToValueAtTime(cutoff * 1.4, at + Math.max(attack + 0.1, duration));
    }
    node.connect(filter);
    node = filter;
  }

  const gain = context.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(volume, at + attack);
  gain.gain.setValueAtTime(volume, at + Math.max(attack, duration));
  gain.gain.linearRampToValueAtTime(0, end);
  node.connect(gain);
  let out = gain;
  if (pan) {
    const panner = context.createStereoPanner();
    panner.pan.value = pan;
    gain.connect(panner);
    out = panner;
  }
  out.connect(chain.input);
  oscillator.start(at);
  oscillator.stop(end + 0.05);
}

/** Reverse-cymbal swell that rises into the next phrase. */
function swell(at, duration) {
  const { context } = audio();
  const length = Math.floor(context.sampleRate * duration);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const source = context.createBufferSource();
  source.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(400, at);
  filter.frequency.exponentialRampToValueAtTime(7000, at + duration);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.18, at + duration);
  gain.gain.linearRampToValueAtTime(0, at + duration + 0.02);
  source.connect(filter).connect(gain).connect(chain.input);
  source.start(at);
  source.stop(at + duration + 0.05);
}

const into = () => chain.input;

const instruments = {
  taiko: (at, pitch = 1) => {
    tone({ frequency: 120 * pitch, to: 45 * pitch, duration: 0.55, volume: 0.75, at, bus: into(), attack: 0.002 });
    noise({ duration: 0.12, volume: 0.35, filter: 'lowpass', frequency: 500, at, bus: into() });
  },
  snare: (at) => {
    noise({ duration: 0.25, volume: 0.32, frequency: 1900, q: 0.7, at, bus: into() });
    tone({ type: 'triangle', frequency: 210, to: 150, duration: 0.12, volume: 0.14, at, bus: into() });
  },
  shaker: (at, accent) =>
    noise({ duration: 0.05, volume: accent ? 0.07 : 0.045, filter: 'highpass', frequency: 6500, at, bus: into() }),
  crash: (at) => noise({ duration: 2.2, volume: 0.13, filter: 'highpass', frequency: 4000, at, bus: into() }),
  timpani: (at, note) => {
    tone({ frequency: midi(note), to: midi(note) * 0.97, duration: 0.7, volume: 0.32, at, bus: into(), attack: 0.004 });
    noise({ duration: 0.08, volume: 0.15, filter: 'lowpass', frequency: 300, at, bus: into() });
  },
  subBass: (at, note, duration) => voice({ type: 'sine', frequency: midi(note - 12), at, duration, volume: 0.3, release: 0.15 }),
  bass: (at, note, duration) =>
    voice({ type: 'sawtooth', frequency: midi(note), at, duration, volume: 0.1, cutoff: 450, cutoffPeak: 1200, release: 0.06 }),
  strings: (at, note, duration, volume = 0.04) =>
    [-0.45, 0.45].forEach((pan, i) =>
      voice({ type: 'sawtooth', frequency: midi(note), detune: i ? 7 : -7, at, duration, volume, attack: 0.008, release: 0.07, cutoff: 2400, pan })
    ),
  sustain: (at, chord, duration, volume = 0.02) =>
    chord.forEach((note, n) =>
      [-8, 8].forEach((detune) =>
        voice({ type: 'sawtooth', frequency: midi(note), detune, at, duration, volume, attack: 0.7, release: 0.9, cutoff: 1300, pan: (n - 1) * 0.4 })
      )
    ),
  brass: (at, chord, duration) =>
    [chord[0] - 12, ...chord].forEach((note, n) =>
      voice({ type: 'sawtooth', frequency: midi(note), at, duration, volume: 0.055, attack: 0.03, release: 0.15, cutoff: 350, cutoffPeak: 2800, q: 1.2, pan: (n - 1.5) * 0.25 })
    ),
  horn: (at, note, duration, volume = 0.075) => {
    voice({ type: 'sawtooth', frequency: midi(note), at, duration, volume, attack: 0.04, release: 0.25, cutoff: 900, cutoffPeak: 3200, vibrato: 0.005 });
    voice({ type: 'sawtooth', frequency: midi(note), detune: 6, at, duration, volume: volume * 0.6, attack: 0.04, release: 0.25, cutoff: 900, cutoffPeak: 3000, vibrato: 0.005 });
    voice({ type: 'triangle', frequency: midi(note + 12), at, duration, volume: volume * 0.35, attack: 0.05, release: 0.25 });
  },
  choir: (at, chord, duration) =>
    chord.forEach((note, n) =>
      [-10, 10].forEach((detune) =>
        voice({ type: 'triangle', frequency: midi(note + 12), detune, at, duration, volume: 0.03, attack: 0.6, release: 1.1, cutoff: 1800, vibrato: 0.007, pan: (n - 1) * 0.5 })
      )
    ),
  harp: (at, note, volume = 0.07) =>
    voice({ type: 'triangle', frequency: midi(note), at, duration: 0.04, volume, release: 0.6, pan: (Math.random() - 0.5) * 0.6 }),
};

// --- Sequencer ---------------------------------------------------------------------

const LOOKAHEAD = 0.12; // seconds of music scheduled ahead of time

class MusicPlayer {
  constructor() {
    this.song = 'garden';
    this.nextSong = 'garden';
    this.intensity = 0;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
  }

  start() {
    onAudioUnlocked(() => {
      if (this.timer) return;
      setupChain();
      this.nextTime = audio().context.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 25);
    });
  }

  /** Switches song on the next bar, so changes land on the beat. */
  play(song, intensity) {
    this.nextSong = song;
    this.intensity = intensity;
  }

  schedule() {
    const { context } = audio();
    // After the tab was in the background, skip ahead instead of playing a burst of notes.
    if (this.nextTime < context.currentTime - 0.2) this.nextTime = context.currentTime + 0.05;

    while (this.nextTime < context.currentTime + LOOKAHEAD) {
      if (this.step % 16 === 0) this.song = this.nextSong;
      const song = SONGS[this.song];
      const stepTime = 60 / song.bpm / 4;
      this.playStep(song, this.step, this.nextTime, stepTime);
      this.nextTime += stepTime;
      this.step = (this.step + 1) % 64;
    }
  }

  playStep(song, step, at, stepTime) {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const chord = song.chords[bar];
    const root = song.roots[bar];
    const barTime = stepTime * 16;
    const level = this.song === 'garden' ? 0 : Math.max(this.intensity, song.boss || this.song === 'divine' ? 4 : 1);
    const note = song.melody[step];

    if (level === 0) {
      // Calm: soft strings, harp arpeggio and the melody on harp.
      if (s === 0) instruments.sustain(at, chord, barTime, 0.032);
      if (s % 2 === 0) instruments.harp(at, chord[(s / 2) % 3] + (s >= 8 ? 24 : 12), 0.065);
      if (note) instruments.harp(at, note.note, 0.13);
      return;
    }

    // Percussion
    const taikoSteps = song.boss ? [0, 3, 6, 8, 10, 11, 14] : level >= 3 ? [0, 6, 8, 11, 14] : [0, 8];
    if (taikoSteps.includes(s)) instruments.taiko(at, s === 0 ? 0.9 : 1);
    if (level >= 2 && (s === 4 || s === 12)) instruments.snare(at);
    if (s % 2 === 0 || level >= 4) instruments.shaker(at, s % 4 === 0);
    if (level >= 3 && bar === 3 && s >= 12) {
      if (level >= 4) instruments.snare(at);
      instruments.taiko(at, [1.6, 1.4, 1.2, 1.05][s - 12]);
    }
    if (level >= 3 && s === 0 && (bar === 0 || bar === 2)) instruments.crash(at);
    if (level >= 3 && bar === 3 && s === 8) swell(at, stepTime * 8);
    if (level >= 4 && bar === 1 && s >= 12) instruments.timpani(at, root);

    // Bass
    if (s === 0) instruments.subBass(at, root, barTime * 0.95);
    if (level >= 2 && [0, 3, 6, 8, 11, 14].includes(s)) instruments.bass(at, root + (s === 14 ? 12 : 0), stepTime * 1.5);

    // String ostinato: root and fifth, the driving "da-da-da" of epic scores.
    const pattern = [0, 0, 2, 0, 0, 2, 0, 1];
    if (level >= 2 || s % 2 === 0) {
      instruments.strings(at, chord[pattern[s % 8]] + 12, stepTime * 0.8, level >= 3 ? 0.045 : 0.035);
    }

    // Brass stabs and sustained chords
    if (level >= 2 && s === 0) instruments.brass(at, chord, stepTime * 3);
    if (level >= 3 && (s === 6 || s === 10)) instruments.brass(at, chord, stepTime * 1.2);
    if (level >= 2 && s === 0) instruments.sustain(at, chord, barTime, 0.014);
    if (level >= 3 && s === 0) instruments.choir(at, chord, barTime);

    // The horn melody, harmonised a third below at full intensity.
    if (level >= 3 && note) {
      instruments.horn(at, note.note, stepTime * note.length * 0.92);
      if (level >= 4) instruments.horn(at, thirdBelow(note.note), stepTime * note.length * 0.92, 0.045);
    }
  }
}

export const music = new MusicPlayer();
