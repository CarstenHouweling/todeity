// The end-of-run share card: an image with the score, time, wave and everything Tode gathered, plus a text line
// for messages. Drawn on a canvas so it works offline and needs no server.

import { formatTime } from './Hud.js';

const WIDTH = 1200;
const HEIGHT = 630;
const EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const FONT = `system-ui, -apple-system, "Segoe UI", sans-serif`;

/**
 * `run`: { score, wave, level, kills, time, clear, victory, daily }; `build`: { form, ultimate, skills, brews }
 * where items are { icon, name, level? }. `backdrop`: a canvas with the last frame of the run (optional).
 */
export function drawShareCard(run, build, backdrop, url) {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const c = canvas.getContext('2d');

  // Background: the battlefield, darkened, with a tea-green wash.
  c.fillStyle = '#0d2614';
  c.fillRect(0, 0, WIDTH, HEIGHT);
  if (backdrop?.width) {
    const scale = Math.max(WIDTH / backdrop.width, HEIGHT / backdrop.height);
    const w = backdrop.width * scale;
    const h = backdrop.height * scale;
    c.drawImage(backdrop, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h);
  }
  const wash = c.createLinearGradient(0, 0, WIDTH, 0);
  wash.addColorStop(0, 'rgba(8, 26, 12, 0.92)');
  wash.addColorStop(0.5, 'rgba(8, 26, 12, 0.78)');
  wash.addColorStop(1, 'rgba(8, 26, 12, 0.9)');
  c.fillStyle = wash;
  c.fillRect(0, 0, WIDTH, HEIGHT);
  c.strokeStyle = run.victory ? '#ffd76a' : 'rgba(255, 255, 255, 0.25)';
  c.lineWidth = 6;
  c.strokeRect(3, 3, WIDTH - 6, HEIGHT - 6);

  // Left column: title, result, score, stats.
  const left = 60;
  c.textBaseline = 'alphabetic';
  c.shadowColor = 'rgba(0, 0, 0, 0.6)';
  c.shadowBlur = 8;
  c.fillStyle = '#e9ffd9';
  c.font = `900 64px ${FONT}`;
  c.fillText('TODEITY', left, 100);
  c.fillStyle = 'rgba(233, 255, 217, 0.8)';
  c.font = `700 22px ${FONT}`;
  c.fillText('RISE OF THE TEA GOD', left + 2, 132);

  c.fillStyle = run.victory ? '#ffd76a' : '#ffffff';
  c.font = `800 40px ${FONT}, ${EMOJI}`;
  c.fillText(run.victory ? '👑 Victory!' : `Reached wave ${run.wave}`, left, 215);
  c.fillStyle = 'rgba(255, 255, 255, 0.85)';
  c.font = `700 24px ${FONT}`;
  c.fillText(build.form, left, 252);

  c.fillStyle = 'rgba(255, 255, 255, 0.7)';
  c.font = `800 20px ${FONT}`;
  c.fillText('SCORE', left, 318);
  c.fillStyle = '#ffe680';
  c.font = `900 92px ${FONT}`;
  c.fillText(run.score.toLocaleString(), left, 400);

  const stats = [
    ['⏱', formatTime(run.time), 'played'],
    ['🌊', `Wave ${run.wave}`, ''],
    ['⭐', `Level ${run.level}`, ''],
    ['🐝', run.kills.toLocaleString(), 'bees'],
  ];
  stats.forEach(([icon, value, unit], i) => {
    const x = left + (i % 2) * 250;
    const y = 460 + Math.floor(i / 2) * 46;
    c.font = `30px ${EMOJI}`;
    c.fillText(icon, x, y);
    c.fillStyle = '#ffffff';
    c.font = `800 28px ${FONT}`;
    c.fillText(value, x + 44, y);
    if (unit) {
      const width = c.measureText(value).width;
      c.fillStyle = 'rgba(255, 255, 255, 0.7)';
      c.font = `600 20px ${FONT}`;
      c.fillText(unit, x + 52 + width, y);
    }
  });
  if (run.clear) {
    c.fillStyle = '#ffd76a';
    c.font = `800 22px ${FONT}, ${EMOJI}`;
    c.fillText(`🔥 Bee-zebub banished in ${formatTime(run.clear)}`, left, 568);
  }

  // Right column: the build.
  const right = 640;
  const columnWidth = WIDTH - right - 50;
  let y = 82;
  const heading = (text) => {
    c.fillStyle = 'rgba(255, 255, 255, 0.7)';
    c.font = `800 20px ${FONT}`;
    c.fillText(text, right, y);
    y += 14;
  };
  const icons = (items, size, maxRows) => {
    const cell = size + 14;
    const perRow = Math.floor(columnWidth / cell);
    const shown = items.slice(0, perRow * maxRows);
    shown.forEach((item, i) => {
      const x = right + (i % perRow) * cell;
      const top = y + Math.floor(i / perRow) * cell;
      c.fillStyle = 'rgba(255, 255, 255, 0.1)';
      roundRect(c, x, top, size, size, 12);
      c.fill();
      if (item.color) {
        c.fillStyle = item.color;
        c.fillRect(x + 6, top + size - 5, size - 12, 4);
      }
      c.shadowBlur = 0;
      c.font = `${Math.round(size * 0.62)}px ${EMOJI}`;
      c.textAlign = 'center';
      c.fillStyle = '#fff';
      c.fillText(item.icon, x + size / 2, top + size * 0.72);
      if (item.level > 1) {
        c.font = `900 ${Math.round(size * 0.3)}px ${FONT}`;
        c.fillStyle = '#ffe680';
        c.fillText(item.level, x + size - 9, top + size * 0.33);
      }
      c.textAlign = 'left';
      c.shadowBlur = 8;
    });
    const rows = Math.ceil(shown.length / perRow);
    if (items.length > shown.length) {
      c.fillStyle = 'rgba(255, 255, 255, 0.8)';
      c.font = `800 18px ${FONT}`;
      c.fillText(`+${items.length - shown.length} more`, right, y + rows * cell + 18);
      y += 26;
    }
    y += rows * cell + 22;
  };

  if (build.ultimate) {
    heading('ULTIMATE');
    y += 30;
    c.fillStyle = '#fff3c4';
    c.font = `800 28px ${FONT}, ${EMOJI}`;
    c.fillText(`${build.ultimate.icon} ${build.ultimate.name}`, right, y);
    y += 46;
  }
  if (build.skills.length) {
    heading('SKILLS');
    icons(build.skills, 60, 1);
  }
  heading('BREWS');
  if (build.brews.length) {
    icons(build.brews, 52, Math.max(1, Math.floor((HEIGHT - 70 - y) / 66)));
  } else {
    y += 30;
    c.fillStyle = 'rgba(255, 255, 255, 0.7)';
    c.font = `italic 600 22px ${FONT}`;
    c.fillText('None yet: a pure frog run!', right, y);
  }

  // Footer.
  c.shadowBlur = 0;
  c.textAlign = 'right';
  c.fillStyle = 'rgba(233, 255, 217, 0.85)';
  c.font = `700 20px ${FONT}, ${EMOJI}`;
  c.fillText(`${run.daily ? '📅 Daily Brew · ' : ''}${run.steep ? `🔥 Steep ${run.steep} · ` : ''}Can you beat it? 🐸☕ ${url.replace(/^https?:\/\//, '').replace(/\/$/, '')}`, WIDTH - 40, HEIGHT - 28);
  return canvas;
}

/** A short message to go with the card (or alone where images can't be shared). */
export function shareText(run, build, url) {
  const result = run.victory ? `banished Bee-zebub and became ${build.form}` : `reached wave ${run.wave} as ${build.form}`;
  const lines = [
    `🐸☕ I ${result} in Todeity: Rise of the Tea God!${run.daily ? ' (📅 Daily Brew)' : ''}${run.steep ? ` (🔥 Steep ${run.steep})` : ''}`,
    `🏆 ${run.score.toLocaleString()} points · ⏱ ${formatTime(run.time)} · ⭐ Level ${run.level} · 🐝 ${run.kills} bees`,
  ];
  if (build.ultimate) lines.push(`Ultimate: ${build.ultimate.icon} ${build.ultimate.name}`);
  if (build.skills.length) lines.push(`Skills: ${build.skills.map((s) => s.icon).join('')}`);
  if (build.brews.length) lines.push(`Brews: ${build.brews.map((b) => b.icon).join('')}`);
  if (build.charms?.length) lines.push(`Charms: ${build.charms.map((c) => `${c.icon}${c.count > 1 ? `×${c.count}` : ''}`).join(' ')}`);
  lines.push(`Can you beat me? ${url}`);
  return lines.join('\n');
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
