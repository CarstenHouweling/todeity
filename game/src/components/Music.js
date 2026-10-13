// Procedural soundtrack: synthesised in the browser, layered by intensity.
//   0 calm  → pad, plucks and a soft melody (title screen, between waves)
//   1       → + kick, hats, bass
//   2       → + snare, driving bass, arpeggio
//   3       → + heroic lead melody, tom fills, crashes
//   4       → + choir, double-time hats (god tier, final waves)
import { audio, noise, onAudioUnlocked, tone } from './Sound.js';

const midi = (note) => 440 * 2 ** ((note - 69) / 12);

/** Melody as [step, note, length] per bar → a 64-step lookup. */
function melody(bars) {
  const steps = new Array(64).fill(null);
  bars.forEach((notes, bar) => notes.forEach(([step, note, length]) => (steps[bar * 16 + step] = { note, length })));
  return steps;
}

// i – VI – III – VII in A minor: the classic "epic" progression.
const HEROIC_CHORDS = [
  [57, 60, 64],
  [53, 57, 60],
  [48, 52, 55],
  [55, 59, 62],
];

const SONGS = {
  garden: {
    bpm: 96,
    chords: HEROIC_CHORDS,
    bass: [45, 41, 36, 43],
    melody: melody([
      [[0, 76, 4], [6, 74, 2], [8, 72, 6]],
      [[0, 72, 4], [6, 69, 2], [8, 65, 6]],
      [[0, 67, 4], [6, 72, 2], [8, 76, 6]],
      [[0, 74, 4], [6, 71, 2], [8, 67, 6]],
    ]),
  },
  battle: {
    bpm: 128,
    chords: HEROIC_CHORDS,
    bass: [45, 41, 36, 43],
    melody: melody([
      [[0, 69, 3], [3, 72, 3], [6, 76, 2], [8, 74, 2], [10, 72, 2], [12, 69, 4]],
      [[0, 72, 3], [3, 69, 3], [6, 65, 2], [8, 67, 2], [10, 69, 6]],
      [[0, 76, 3], [3, 79, 3], [6, 76, 2], [8, 74, 2], [10, 72, 2], [12, 74, 2], [14, 76, 2]],
      [[0, 74, 3], [3, 71, 3], [6, 67, 2], [8, 69, 2], [10, 71, 2], [12, 74, 4]],
    ]),
  },
  boss: {
    bpm: 140,
    // i – iv – VI – V: darker, with the tension of the major V.
    chords: [
      [57, 60, 64],
      [50, 53, 57],
      [53, 57, 60],
      [52, 56, 59],
    ],
    bass: [45, 38, 41, 40],
    melody: melody([
      [[0, 69, 2], [2, 69, 2], [4, 72, 2], [6, 71, 2], [8, 69, 4], [12, 64, 4]],
      [[0, 74, 2], [2, 74, 2], [4, 77, 2], [6, 76, 2], [8, 74, 4], [12, 69, 4]],
      [[0, 72, 2], [2, 74, 2], [4, 76, 2], [6, 77, 2], [8, 79, 4], [12, 77, 4]],
      [[0, 76, 4], [4, 75, 2], [6, 76, 2], [8, 80, 4], [12, 76, 4]],
    ]),
  },
};

const BASS_STEPS = { 1: [0, 8], 2: [0, 3, 6, 8, 11, 14] };
const KICK_STEPS = { 1: [0, 8], 3: [0, 6, 8, 11] };

// --- Instruments ---------------------------------------------------------------

function voice({ type, frequency, at, duration, volume, attack = 0.01, release = 0.12, cutoff, detune = 0, vibrato = 0 }) {
  const { context, musicBus } = audio();
  const oscillator = context.createOscillator();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  oscillator.detune.value = detune;
  let node = oscillator;

  if (vibrato) {
    const lfo = context.createOscillator();
    const depth = context.createGain();
    lfo.frequency.value = 5.5;
    depth.gain.value = frequency * vibrato;
    lfo.connect(depth).connect(oscillator.frequency);
    lfo.start(at);
    lfo.stop(at + duration + release + 0.05);
  }
  if (cutoff) {
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    node.connect(filter);
    node = filter;
  }

  const gain = context.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(volume, at + attack);
  gain.gain.setValueAtTime(volume, at + Math.max(attack, duration));
  gain.gain.linearRampToValueAtTime(0, at + duration + release);
  node.connect(gain).connect(musicBus);
  oscillator.start(at);
  oscillator.stop(at + duration + release + 0.05);
}

const bus = () => audio().musicBus;

const instruments = {
  kick: (at) => tone({ frequency: 150, to: 40, duration: 0.32, volume: 0.55, at, bus: bus(), attack: 0.003 }),
  snare: (at) => {
    noise({ duration: 0.18, volume: 0.28, frequency: 1800, q: 0.8, at, bus: bus() });
    tone({ type: 'triangle', frequency: 220, to: 160, duration: 0.1, volume: 0.12, at, bus: bus() });
  },
  hat: (at, accent) =>
    noise({ duration: accent ? 0.09 : 0.04, volume: accent ? 0.08 : 0.05, filter: 'highpass', frequency: 7000, at, bus: bus() }),
  tom: (at, frequency) => tone({ frequency, to: frequency * 0.6, duration: 0.3, volume: 0.3, at, bus: bus() }),
  crash: (at) => noise({ duration: 1.6, volume: 0.12, filter: 'highpass', frequency: 5000, at, bus: bus() }),
  bass: (at, note, duration) => {
    voice({ type: 'sawtooth', frequency: midi(note), at, duration, volume: 0.09, cutoff: 600, release: 0.05 });
    voice({ type: 'sine', frequency: midi(note - 12), at, duration, volume: 0.16, release: 0.05 });
  },
  pad: (at, chord, duration, brightness) =>
    chord.forEach((note) =>
      [-8, 8].forEach((detune) =>
        voice({ type: 'sawtooth', frequency: midi(note), detune, at, duration, volume: 0.022, attack: 0.5, release: 0.6, cutoff: brightness })
      )
    ),
  choir: (at, chord, duration) =>
    chord.forEach((note) =>
      voice({ type: 'sine', frequency: midi(note + 12), at, duration, volume: 0.035, attack: 0.6, release: 0.8, vibrato: 0.006 })
    ),
  pluck: (at, note, volume = 0.07) =>
    voice({ type: 'triangle', frequency: midi(note), at, duration: 0.05, volume, release: 0.35 }),
  arp: (at, note) => voice({ type: 'square', frequency: midi(note), at, duration: 0.05, volume: 0.025, release: 0.08, cutoff: 2500 }),
  lead: (at, note, duration) => {
    voice({ type: 'sawtooth', frequency: midi(note), at, duration, volume: 0.045, attack: 0.03, release: 0.2, cutoff: 3200, vibrato: 0.004 });
    voice({ type: 'triangle', frequency: midi(note + 12), at, duration, volume: 0.03, attack: 0.03, release: 0.2 });
  },
};

// --- Sequencer -------------------------------------------------------------------

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
      this.playStep(song, this.step, this.nextTime, 60 / song.bpm / 4);
      this.nextTime += 60 / song.bpm / 4;
      this.step = (this.step + 1) % 64;
    }
  }

  playStep(song, step, at, stepTime) {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const chord = song.chords[bar];
    const level = this.song === 'garden' ? 0 : Math.max(this.intensity, this.song === 'boss' ? 3 : 1);

    if (s === 0) {
      instruments.pad(at, chord, stepTime * 16, level >= 3 ? 2400 : 1300);
      if (level >= 4) instruments.choir(at, chord, stepTime * 16);
      if (level >= 3 && (bar === 0 || bar === 2)) instruments.crash(at);
    }

    if (level === 0) {
      // Calm: gentle plucked arpeggio and the melody on plucks.
      if (s % 4 === 0) instruments.pluck(at, chord[(s / 4) % 3] + 12, 0.045);
      const note = song.melody[step];
      if (note) instruments.pluck(at, note.note, 0.08);
      return;
    }

    // Drums
    const kicks = level >= 3 ? KICK_STEPS[3] : KICK_STEPS[1];
    if (kicks.includes(s)) instruments.kick(at);
    if (level >= 2 && (s === 4 || s === 12)) instruments.snare(at);
    if (level >= 4 || s % 2 === 0) instruments.hat(at, s % 4 === 2);
    if (level >= 3 && bar === 3 && s >= 12) instruments.tom(at, [220, 180, 150, 120][s - 12]);

    // Bass
    const bassSteps = level >= 2 ? BASS_STEPS[2] : BASS_STEPS[1];
    if (bassSteps.includes(s)) instruments.bass(at, song.bass[bar] + (s === 14 ? 12 : 0), stepTime * 1.6);

    // Arpeggio: chord tones climbing over two octaves.
    if (level >= 2) instruments.arp(at, chord[s % 3] + 12 + (Math.floor(s / 3) % 2) * 12);

    // Lead melody
    const note = song.melody[step];
    if (level >= 3 && note) instruments.lead(at, note.note, stepTime * note.length * 0.9);
  }
}

export const music = new MusicPlayer();
