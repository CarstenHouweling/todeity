// node banners.mjs <dir with ascend.jpg, summon.jpg, bullets.jpg, lineup.png> '[["name.png", w, h, "full"|"header", dsf?]]'
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const dir = process.argv[2];
const jobs = JSON.parse(process.argv[3]);
fs.mkdirSync(`${dir}/out`, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
for (const [name, w, h, mode, dsf = 1] of jobs) {
  const page = await browser.newPage({ viewport: { width: w / dsf, height: h / dsf }, deviceScaleFactor: dsf });
  await page.goto(`${new URL('banner.html', import.meta.url)}?w=${w / dsf}&h=${h / dsf}&mode=${mode}&dir=${encodeURIComponent(dir)}`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${dir}/out/${name}`, ...(name.endsWith('jpg') ? { type: 'jpeg', quality: 90 } : {}) });
  await page.close();
}
await browser.close();
