/**
 * Seasonal themes: for a few weeks a year the garden dresses up (Halloween: jack-o'-lanterns, bats, ghosts and
 * autumn trees, see SeasonDecor.js), the title screen follows, and seasonal wearables and a garden song come out.
 * Dates are UTC days, like the Daily Brew, so the server (which imports this file for the seasonal unlocks) and every
 * browser agree. No three.js here.
 *
 * A season: `from`/`to` as 'MM-DD' (both included; `to` may be in the next year, for a season over New Year).
 */
export const SEASONS = [
  {
    id: 'halloween',
    name: 'Halloween',
    icon: '🎃',
    from: '10-17',
    to: '11-02',
    until: 'Nov 2',
    greeting: 'The garden is spooky until Nov 2',
  },
];

export const seasonById = (id) => SEASONS.find((season) => season.id === id) ?? null;

/** Whether a 'MM-DD' day falls in a season (wrapping over New Year when `to` comes before `from`). */
const inside = (season, day) => (season.from <= season.to ? day >= season.from && day <= season.to : day >= season.from || day <= season.to);

/** The season on the calendar at `ms` (null outside every season). */
export function seasonAt(ms = Date.now()) {
  const day = new Date(ms).toISOString().slice(5, 10);
  return SEASONS.find((season) => inside(season, day)) ?? null;
}

// The browser may pretend (`?season=halloween` or `?season=none` in the address, `game.setSeason` while developing);
// the server never does, so a pretended season's wearables don't save.
let pretend;

/** `id`: a season to show whatever the date, 'none' for none, undefined to follow the calendar again. */
export function pretendSeason(id) {
  pretend = id === undefined ? undefined : seasonById(id);
}

/** The season this browser shows (the calendar's, unless it pretends). */
export const currentSeason = () => (pretend === undefined ? seasonAt() : pretend);

/** Whether season `id` is on right now (pretending counts in the browser). */
export const seasonOn = (id) => currentSeason()?.id === id;
