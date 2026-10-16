// Renders the trailer soundtrack offline from the game's own sequencer (Music.js), section by section.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const SECTIONS = JSON.parse(process.argv[2] || '[["garden",0,2],["battle",2,4],["battle",3,8],["divine",4,4],["boss",4,8],["garden",0,4]]');
const out = process.argv[3] || 'trailer.wav';
const RATE = 44100;
const SECONDS = 70;

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('console', (m) => console.log('page:', m.text()));
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto((process.env.GAME_URL || 'http://localhost:5179/') + 'src/components/Music.js');
const result = await page.evaluate(
  async ({ SECTIONS, RATE, SECONDS }) => {
    const length = RATE * SECONDS;
    class FakeContext extends OfflineAudioContext {
      constructor() {
        super(2, length, RATE);
        this.fake = 0;
      }
      get currentTime() {
        return this.fake;
      }
      resume() {
        return Promise.resolve();
      }
    }
    window.AudioContext = FakeContext;
    const S = await import('/src/components/Sound.js');
    const M = await import('/src/components/Music.js');
    S.unlockAudio();
    const { context } = S.audio();
    const m = M.music;
    m.start();
    clearInterval(m.timer);
    const starts = [];
    let steps = 0;
    for (let i = 0; i < SECTIONS.length; i++) {
      const [song, intensity, bars] = SECTIONS[i];
      m.play(song, intensity);
      let done = 0;
      while (done < bars * 16) {
        const before = m.step;
        if (done === 0 && starts.length === i) starts.push(m.nextTime);
        context.fake += 0.004;
        m.schedule();
        if (m.step !== before) done++, steps++;
      }
    }
    const end = m.nextTime;
    const buffer = await context.startRendering();
    // 16-bit WAV
    const ch = [buffer.getChannelData(0), buffer.getChannelData(1)];
    const n = buffer.length;
    const data = new DataView(new ArrayBuffer(44 + n * 4));
    const str = (o, s) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF'); data.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
    data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 2, true);
    data.setUint32(24, RATE, true); data.setUint32(28, RATE * 4, true); data.setUint16(32, 4, true); data.setUint16(34, 16, true);
    str(36, 'data'); data.setUint32(40, n * 4, true);
    let peak = 0;
    for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) peak = Math.max(peak, Math.abs(ch[c][i]));
    const gain = peak > 0 ? 0.89 / peak : 1;
    for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) data.setInt16(44 + i * 4 + c * 2, Math.max(-1, Math.min(1, ch[c][i] * gain)) * 32767, true);
    const bytes = new Uint8Array(data.buffer);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { b64: btoa(bin), starts, end, peak, gain };
  },
  { SECTIONS, RATE, SECONDS }
);
fs.writeFileSync(out, Buffer.from(result.b64, 'base64'));
console.log(JSON.stringify({ starts: result.starts, end: result.end, peak: result.peak, gain: result.gain }));
await browser.close();
