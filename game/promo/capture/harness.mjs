// A small control server around one headless Chrome page, so scenes can be set up and recorded with curl.
//   POST /reload  {meta?, settings?, width?, height?}     fresh page (localStorage seeded before the game loads)
//   POST /eval    {code}                                  evaluate an async function body in the page, JSON back
//   POST /shot    {path}                                  screenshot
//   POST /record  {dir, frames, each?, sub?, start?}      manual time: per frame run `each`, advance, screenshot
//   POST /auto    {on}                                    real-time pumping on/off
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const vtime = fs.readFileSync(path.join(here, 'vtime.js'), 'utf8');
const pilot = fs.readFileSync(path.join(here, 'pilot.js'), 'utf8');
const inject = () => ['overlay.js', 'lib.js'].map((f) => fs.readFileSync(path.join(here, f), 'utf8')).join('\n');
const URL_ = process.env.GAME_URL || 'http://localhost:5179/';

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
let context;
let page;
const logs = [];

async function reload({ meta = null, settings = null, width = 1280, height = 720, dsf = 1.5, query = '', extra = {}, raw = false } = {}) {
  if (context) await context.close();
  context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dsf });
  await context.addInitScript(vtime);
  await context.addInitScript(
    ({ meta, settings, extra }) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      if (meta) localStorage.setItem('tode-meta', JSON.stringify(meta));
      if (settings) localStorage.setItem('tode-settings', JSON.stringify(settings));
      for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    },
    { meta, settings, extra }
  );
  page = await context.newPage();
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && logs.push(m.text().slice(0, 300)));
  page.on('pageerror', (e) => logs.push('pageerror: ' + String(e).slice(0, 300)));
  await page.goto(URL_ + query);
  if (raw) {
    await page.waitForTimeout(4000);
    return { ok: true };
  }
  await page.waitForFunction(() => window.game && window.game.phase === 'title', null, { timeout: 60000 });
  await page.evaluate(pilot);
  await page.evaluate(inject());
  await page.evaluate(() => {
    game.autoPause = false;
    game.persist = false;
    game.holdLevelUps = true;
  });
  await page.waitForTimeout(1500);
  return { ok: true };
}

async function evaluate(code) {
  return page.evaluate(`(async () => { ${code} })()`);
}

async function record({ dir, frames, each = '', sub = 2, start = 0, quality = 92, clip = null, every = 1 }) {
  fs.mkdirSync(dir, { recursive: true });
  await page.evaluate(() => (window.__vt.auto = false));
  const fn = each ? `(n) => { ${each} }` : null;
  const t = Date.now();
  for (let i = 0; i < frames; i++) {
    const out = await page.evaluate(
      ({ src, sub, i }) => {
        const each = src ? (0, eval)(src) : null;
        let r;
        try {
          r = each && each(i);
        } catch (e) {
          r = 'each error: ' + e;
        }
        window.__pilot?.tick();
        for (let s = 0; s < sub; s++) window.__vt.advance(1000 / 30 / sub);
        window.__vt.syncAnimations();
        return r;
      },
      { src: fn, sub, i }
    );
    if (out) logs.push(`frame ${i}: ${JSON.stringify(out).slice(0, 200)}`);
    if (i % every === 0) await page.screenshot({ path: path.join(dir, `${String(start + i / every).padStart(4, '0')}.jpg`), type: 'jpeg', quality, ...(clip ? { clip } : {}) });
  }
  return { ok: true, ms: (Date.now() - t) / frames };
}

const server = http.createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  const args = body ? JSON.parse(body) : {};
  let result;
  try {
    if (req.url === '/reload') result = await reload(args);
    else if (req.url === '/eval') result = await evaluate(args.code);
    else if (req.url === '/shot') result = (await page.screenshot({ path: args.path, type: args.path.endsWith('png') ? 'png' : 'jpeg', ...(args.path.endsWith('png') ? {} : { quality: 92 }), ...(args.clip ? { clip: args.clip } : {}) }), { ok: true });
    else if (req.url === '/record') result = await record(args);
    else if (req.url === '/auto') result = await page.evaluate((on) => ((window.__vt.auto = on), on ? window.__vt.releaseAnimations() : 0, on), args.on);
    else if (req.url === '/logs') result = logs.splice(0);
    else if (req.url === '/quit') {
      res.end('bye');
      await browser.close();
      process.exit(0);
    }
    res.end(JSON.stringify(result ?? null, null, 1));
  } catch (e) {
    res.statusCode = 500;
    res.end(String(e.stack || e));
  }
});
server.listen(9330, () => console.log('harness on 9330'));
