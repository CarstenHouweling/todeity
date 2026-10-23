/**
 * Seasonal themes: the garden dresses up for the four seasons and for celebrations (SeasonDecor.js), the title
 * screen follows, the calm music changes, and celebrations bring wearables and a garden song. No three.js here (the
 * server imports this file for the seasonal unlocks).
 *
 * Every day of the year has a theme: one of the four seasons (northern hemisphere, by the equinoxes and solstices),
 * or a celebration on top of it, which wins (the first that matches, so short celebrations come before long ones).
 * A theme's days are either `from`/`to` as 'MM-DD' (both included; `to` may be in the next year, over New Year), or
 * `days(year)` → [first, last] as UTC midnights in ms, for the ones that move (Easter, Lunar New Year).
 *
 * Which day it is: the browser shows the theme of its own local day, so the garden switches at the player's
 * midnight (`watchSeasons` in main.js checks every minute). Unlocks go by the UTC day (`seasonOnUtc`), like the Daily
 * Brew, so the server agrees with every browser.
 *
 * `hello` + `greeting` greet on the title ({until}: the theme's last day); `song`: the calm music while it's on
 * (Music.js); `colors`: the title's wordmark (`word`), its glow, the subtitle and the greeting note (main.js sets them
 * as CSS variables).
 */
const DAY = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Easter Sunday (Gregorian, the anonymous algorithm) as a UTC midnight in ms. */
function easter(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(year, month - 1, day);
}

// The first day of the lunar year (it follows the moon, so a table; add years as they come).
const LUNAR_NEW_YEAR = {
  2026: '02-17', 2027: '02-06', 2028: '01-26', 2029: '02-13', 2030: '02-03', 2031: '01-23',
  2032: '02-11', 2033: '01-31', 2034: '02-19', 2035: '02-08', 2036: '01-28', 2037: '02-15',
};

export const SEASONS = [
  // --- Celebrations (first match wins) ---
  {
    id: 'newyear',
    name: 'New Year',
    icon: '🎆',
    from: '12-31',
    to: '01-01',
    hello: 'Happy New Year!',
    greeting: 'Fireworks over the garden',
    song: 'groove',
    colors: { word: '#ffe27a', glow: 'rgba(255, 200, 60, 0.8)', glow2: 'rgba(120, 160, 255, 0.6)', sub: '#c8d8ff', note: '#fff0b8', noteBg: 'rgba(16, 20, 54, 0.72)' },
  },
  {
    id: 'valentine',
    name: "Valentine's Day",
    icon: '💝',
    from: '02-12',
    to: '02-15',
    hello: "Happy Valentine's Day!",
    greeting: 'Love is in the garden until {until}',
    song: 'koi',
    colors: { word: '#ff8fb0', glow: 'rgba(255, 70, 120, 0.75)', glow2: 'rgba(255, 180, 210, 0.6)', sub: '#ffd1e3', note: '#ffe0ec', noteBg: 'rgba(70, 14, 40, 0.7)' },
  },
  {
    id: 'easter',
    name: 'Easter',
    icon: '🐣',
    days: (year) => [easter(year) - 2 * DAY, easter(year) + DAY],
    hello: 'Happy Easter!',
    greeting: 'Painted eggs are hidden in the garden until {until}',
    song: 'garden',
    colors: { word: '#fff27a', glow: 'rgba(255, 170, 220, 0.75)', glow2: 'rgba(140, 220, 255, 0.6)', sub: '#c8f0ff', note: '#fff6c8', noteBg: 'rgba(40, 60, 90, 0.66)' },
  },
  {
    id: 'lunar',
    name: 'Lunar New Year',
    icon: '🏮',
    days: (year) => {
      const day = LUNAR_NEW_YEAR[year];
      if (!day) return null;
      const first = Date.parse(`${year}-${day}T00:00:00Z`);
      return [first - DAY, first + 14 * DAY]; // from the eve to the Lantern Festival
    },
    hello: 'Happy Lunar New Year!',
    greeting: 'Red lanterns light the garden until {until}',
    song: 'lantern',
    colors: { word: '#ffcf3a', glow: 'rgba(255, 60, 40, 0.8)', glow2: 'rgba(255, 200, 60, 0.55)', sub: '#ffd8a0', note: '#ffe6b0', noteBg: 'rgba(90, 10, 10, 0.72)' },
  },
  {
    id: 'halloween',
    name: 'Halloween',
    icon: '🎃',
    from: '10-17',
    to: '11-02',
    hello: 'Happy Halloween!',
    greeting: 'The garden is spooky until {until}',
    song: 'pumpkin',
    colors: { word: '#ffb347', glow: 'rgba(255, 120, 20, 0.75)', glow2: 'rgba(160, 60, 220, 0.55)', sub: '#e8c8ff', note: '#ffd2a0', noteBg: 'rgba(36, 14, 48, 0.7)' },
  },
  {
    id: 'winterfest',
    name: 'Winter Holidays',
    icon: '🎄',
    from: '12-01',
    to: '12-30',
    hello: 'Happy Holidays!',
    greeting: 'The garden is decked out until {until}',
    song: 'snowfall',
    colors: { word: '#ffffff', glow: 'rgba(255, 60, 60, 0.7)', glow2: 'rgba(80, 200, 120, 0.6)', sub: '#ffd8d8', note: '#ffffff', noteBg: 'rgba(110, 16, 24, 0.7)' },
  },
  // --- The four seasons (one of them is always on) ---
  {
    id: 'spring',
    name: 'Spring',
    icon: '🌸',
    from: '03-20',
    to: '06-20',
    hello: 'Spring is here!',
    greeting: 'Blossom and tulips in the garden',
    song: 'garden',
    colors: { word: '#ffd1e3', glow: 'rgba(255, 120, 180, 0.7)', glow2: 'rgba(120, 220, 120, 0.5)', sub: '#ffe680', note: '#ffe8f2', noteBg: 'rgba(60, 20, 46, 0.6)' },
  },
  {
    id: 'summer',
    name: 'Summer',
    icon: '🌻',
    from: '06-21',
    to: '09-21',
    hello: 'Summer in the garden!',
    greeting: 'Sunflowers and long warm evenings',
    song: 'garden',
    colors: { word: '#ffe14a', glow: 'rgba(255, 150, 30, 0.75)', glow2: 'rgba(80, 200, 255, 0.5)', sub: '#fff2a0', note: '#fff2c0', noteBg: 'rgba(60, 40, 6, 0.6)' },
  },
  {
    id: 'autumn',
    name: 'Autumn',
    icon: '🍂',
    from: '09-22',
    to: '12-20',
    hello: 'Autumn in the garden!',
    greeting: 'Falling leaves and a pumpkin harvest',
    song: 'garden',
    colors: { word: '#ffb35a', glow: 'rgba(220, 90, 20, 0.7)', glow2: 'rgba(255, 200, 80, 0.5)', sub: '#ffe0a0', note: '#ffe2c0', noteBg: 'rgba(60, 24, 6, 0.62)' },
  },
  {
    id: 'winter',
    name: 'Winter',
    icon: '❄️',
    from: '12-21',
    to: '03-19',
    hello: 'Snow in the garden!',
    greeting: 'Snowmen and frosty mornings',
    song: 'snowfall',
    colors: { word: '#e8f6ff', glow: 'rgba(110, 190, 255, 0.8)', glow2: 'rgba(200, 230, 255, 0.6)', sub: '#cfe8ff', note: '#e8f6ff', noteBg: 'rgba(14, 34, 66, 0.66)' },
  },
];

export const seasonById = (id) => SEASONS.find((season) => season.id === id) ?? null;

/** The day `ms` falls on, as a UTC midnight: by the UTC calendar, or (`local`) by this device's clock. */
const dayOf = (ms, local) => {
  const date = new Date(ms);
  return local ? Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) : Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

/** A theme's [first, last] day (UTC midnights) that includes `day`, or null when `day` isn't one of its days. */
function daysOf(season, day) {
  const year = new Date(day).getUTCFullYear();
  for (const y of [year - 1, year]) {
    let span;
    if (season.days) span = season.days(y);
    else {
      const first = Date.parse(`${y}-${season.from}T00:00:00Z`);
      let last = Date.parse(`${y}-${season.to}T00:00:00Z`);
      if (last < first) last = Date.parse(`${y + 1}-${season.to}T00:00:00Z`); // over New Year
      span = [first, last];
    }
    if (span && day >= span[0] && day <= span[1]) return span;
  }
  return null;
}

/** The theme on `ms`'s day: by the UTC calendar, or (`local`) by this device's. */
export function seasonAt(ms = Date.now(), { local = false } = {}) {
  const day = dayOf(ms, local);
  return SEASONS.find((season) => daysOf(season, day)) ?? null;
}

/** The last day of a theme's current (or, when it's off, its next) run of days, as "Nov 2". */
export function seasonUntil(season, ms = Date.now()) {
  const day = dayOf(ms, true);
  let span = daysOf(season, day);
  for (let ahead = 1; !span && ahead <= 400; ahead++) span = daysOf(season, day + ahead * DAY);
  if (!span) return '';
  const last = new Date(span[1]);
  return `${MONTHS[last.getUTCMonth()]} ${last.getUTCDate()}`;
}

/** The title's greeting for a theme. */
export const seasonGreeting = (season) => season.greeting.replace('{until}', seasonUntil(season));

// The browser may pretend (`?season=halloween` or `?season=none` in the address, `game.setSeason` while developing);
// the server never does, so a pretended season's wearables don't save.
let pretend;

/** `id`: a theme to show whatever the date, 'none' for none, undefined to follow the calendar again. */
export function pretendSeason(id) {
  pretend = id === undefined ? undefined : seasonById(id);
}

/** The theme this browser shows: its own day's (the calendar's), unless it pretends. */
export const currentSeason = () => (pretend === undefined ? seasonAt(Date.now(), { local: true }) : pretend);

/** Whether theme `id` (or one of a list) is on for the unlocks: the UTC day's, or the pretended one. */
export function seasonOnUtc(id) {
  const on = pretend === undefined ? seasonAt() : pretend;
  return [id].flat().includes(on?.id);
}
