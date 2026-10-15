/**
 * The player tag: the name other frogs see (gardens, co-op, the leaderboard), a 4-digit #tag that tells frogs with
 * the same name apart, and a colour for the name. The cloud save owns it (server/saves.js `profile`); this module
 * holds the rules both sides use, so it must not import three.js.
 */
export const NAME_MIN = 2;
export const NAME_MAX = 16;
export const TAG_COLORS = ['#7ed957', '#5fb8ff', '#ff9ec7', '#ffd23f', '#c58aff', '#ff8a3a', '#7ff0d0', '#ff5a7a', '#e8f8ff', '#ffb000'];

/** Letters (any language), digits, spaces and a little punctuation; no runs of spaces. */
export function cleanName(name) {
  return String(name ?? '')
    .replace(/[^\p{L}\p{N} _.\-!?']/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
}

// What a public name may not contain, matched after folding look-alikes (0→o, 1→i, 3→e, 4→a, 5→s, 7→t, @→a, $→s).
// FRAGMENTS are blocked anywhere ("b4dword123"); WORDS only as a whole word, so names like Spicy, Grape, Peacock or
// Sussex stay fine.
const FRAGMENTS = ['fuck', 'shit', 'cunt', 'nigg', 'fagg', 'kike', 'retard', 'whore', 'slut', 'hitler', 'nazi', 'bitch', 'asshole', 'twat', 'wank', 'porn', 'killyourself', 'kanker'];
const WORDS = ['sex', 'anal', 'dick', 'cock', 'rape', 'rapist', 'spic', 'kut', 'hoer', 'tering', 'kys', 'penis', 'vagina', 'chink', 'tranny', 'bastard', 'neuk', 'pussy', 'cum', 'tit', 'tits', 'fag', 'sexy'];
const FOLD = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };

const fold = (text) => [...String(text).toLowerCase()].map((c) => FOLD[c] ?? c).join('');

/** Why a name can't be used, or null when it's fine. */
export function nameProblem(raw) {
  const name = cleanName(raw);
  if (name.length < NAME_MIN) return `Names need at least ${NAME_MIN} characters.`;
  const folded = fold(name);
  const flat = folded.replace(/[^a-z]/g, '');
  const words = folded.split(/[^a-z]+/).filter(Boolean);
  if (FRAGMENTS.some((bad) => flat.includes(bad)) || words.some((word) => WORDS.includes(word))) return "That name isn't allowed. Pick something friendlier!";
  return null;
}

/** A name safe to show to others: the cleaned name, or `fallback` when it breaks the rules. */
export const publicName = (raw, fallback = 'Frog') => (nameProblem(raw) ? fallback : cleanName(raw));

const ADJECTIVES = ['Sleepy', 'Brave', 'Jolly', 'Mighty', 'Sneaky', 'Fuzzy', 'Lucky', 'Spicy', 'Misty', 'Golden', 'Bouncy', 'Steamy', 'Cosy', 'Zesty', 'Grumpy', 'Swift'];
const NOUNS = ['Sencha', 'Matcha', 'Oolong', 'Chai', 'Lily', 'Tadpole', 'Croaker', 'Teacup', 'Kettle', 'Leaf', 'Newt', 'Toadstool', 'Pond', 'Biscuit', 'Hopper', 'Brew'];

/** A random tea-and-frog name ("Jolly Oolong"). */
export function randomName(random = Math.random) {
  const pick = (list) => list[Math.floor(random() * list.length)];
  return `${pick(ADJECTIVES)} ${pick(NOUNS)}`.slice(0, NAME_MAX);
}

/** A fresh 4-digit tag. */
export const newTag = (random = Math.random) => String(1000 + Math.floor(random() * 9000));
