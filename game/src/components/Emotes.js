/**
 * Emotes for hanging around in gardens: a move of the frog's rig (FrogModels.js), maybe a spin, an emoji bubble over
 * the head, and often an effect of its own (`fx`, played by GardenHub.js with GardenFx.js). A few are free; the rest
 * unlock with achievements (`unlock`) or with the highest form reached in a run (`minTier`). Everybody in the garden
 * sees them (GardenHub.js, `emote` events). No three.js here.
 *
 * `move`: a rig move; `time`: seconds (default EMOTE_TIME in GardenHub.js); `loop`: plays until the frog moves or
 * jumps; `spin`: turns around (turns); `hops`; `bubble`: an emoji over the head; `burst`: particle colours;
 * `fx`: the effect script in GardenHub.js; `hidden`: not in the emote panel (played by the garden itself).
 */
export const EMOTES = [
  { id: 'wave', icon: '👋', name: 'Wave', move: 'victory' },
  { id: 'sip', icon: '🍵', name: 'Sip tea', move: 'sip' },
  { id: 'hops', icon: '🐸', name: 'Happy hops', move: 'hop', hops: 3 },
  { id: 'heart', icon: '❤️', name: 'Love', move: 'love', time: 2.8, fx: 'love', unlock: 'duo' },
  { id: 'laugh', icon: '😂', name: 'Laugh', move: 'laugh', time: 3.4, bubble: '😂', fx: 'laugh', unlock: 'combo50' },
  { id: 'spin', icon: '🌀', name: 'Spin', spin: 2, unlock: 'skills3' },
  { id: 'flip', icon: '🤸', name: 'Backflip', move: 'flip', unlock: 'queen' },
  { id: 'dance', icon: '💃', name: 'Dance', move: 'dance', loop: true, fx: 'dance', unlock: 'shogun' },
  { id: 'flex', icon: '💪', name: 'Flex', move: 'slam', bubble: '💪', unlock: 'kills1000' },
  { id: 'nap', icon: '💤', name: 'Nap', move: 'nap', loop: true, fx: 'nap', unlock: 'whisker' },
  { id: 'confetti', icon: '🎉', name: 'Party Popper', move: 'victory', time: 3.2, fx: 'popper', unlock: 'party' },
  { id: 'sparkle', icon: '🎆', name: 'Fireworks', move: 'victory', time: 3.4, fx: 'fireworks', unlock: 'golden' },
  { id: 'fire', icon: '🔥', name: 'Fired up', move: 'slam', burst: ['#ff6a00', '#ffb020', '#ffe066'], unlock: 'steep5' },
  { id: 'crown', icon: '👑', name: 'Royal bow', move: 'bow', time: 3.6, fx: 'royal', unlock: 'empress' },
  { id: 'pound', icon: '💥', name: 'Ground Pound', move: 'flip', time: 2.2, fx: 'pound', unlock: 'tower' },
  { id: 'stars', icon: '🌠', name: 'Star Shower', move: 'victory', time: 3.6, fx: 'starfall', unlock: 'god' },
  { id: 'power', icon: '⚡', name: 'Power Up', move: 'power', time: 6.5, fx: 'power', minTier: 1, how: 'Reach any divine form in a run' },
  // More to collect (v0.33).
  { id: 'cheer', icon: '🙌', name: 'Cheer', move: 'cheer', time: 2.4, fx: 'cheer', unlock: 'coop' },
  { id: 'clap', icon: '👏', name: 'Applause', move: 'clap', time: 2.4, fx: 'clap', unlock: 'photo' },
  { id: 'croak', icon: '📣', name: 'Big Croak', move: 'croak', time: 2.6, fx: 'croak', unlock: 'lightfeet' },
  { id: 'meditate', icon: '🧘', name: 'Meditate', move: 'meditate', loop: true, fx: 'meditate', unlock: 'shrines' },
  { id: 'juggle', icon: '🤹', name: 'Juggle', move: 'juggle', time: 3.2, fx: 'juggle', unlock: 'charms' },
  { id: 'rainbow', icon: '🌈', name: 'Rainbow', move: 'victory', time: 3.2, fx: 'rainbow', unlock: 'legendary' },
  { id: 'tornado', icon: '🌪️', name: 'Leaf Tornado', spin: 4, time: 2.4, fx: 'tornado', unlock: 'combo150' },
  { id: 'thunder', icon: '🌩️', name: 'Thunder Clap', move: 'slam', time: 2.2, fx: 'thunder', unlock: 'skills6' },
  { id: 'cackle', icon: '😈', name: 'Wicked Laugh', move: 'cackle', time: 3, fx: 'cackle', unlock: 'beezebub' },
  // Played by the garden: sitting on the bench with a cup of tea, until you hop off.
  { id: 'rest', icon: '🪑', name: 'Rest', move: 'sip', loop: true, fx: 'rest', hidden: true },
];

export const emoteById = (id) => EMOTES.find((emote) => emote.id === id);

/** The highest form a save reached: its `maxTier`, or what its form achievements say (whichever is higher). */
const TIER_ACHIEVEMENTS = { awakened: 1, golden: 2, radiant: 3, god: 4, infinite: 5 };
export function bestTier({ maxTier = 0, achievements = [] } = {}) {
  return achievements.reduce((best, id) => Math.max(best, TIER_ACHIEVEMENTS[id] ?? 0), maxTier ?? 0);
}

/** Whether an emote is free or unlocked by `progress` ({ achievements (ids), maxTier }). */
export const emoteUnlocked = (emote, progress = {}) =>
  !emote.hidden && (!emote.unlock || (progress.achievements ?? []).includes(emote.unlock)) && (!emote.minTier || bestTier(progress) >= emote.minTier);
