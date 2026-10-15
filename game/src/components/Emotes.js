/**
 * Emotes for hanging around in gardens: a move of the frog's rig (FrogModels.js), maybe a spin, a flip done by the
 * garden itself, an emoji bubble over the head and a puff of particles. A few are free; the rest unlock with
 * achievements (`unlock`). Everybody in the garden sees them (GardenHub.js, `emote` events). No three.js here.
 *
 * `move`: a rig move ('victory', 'sip', 'slam', 'flip', 'attack', 'hop', 'dash'); `spin`: turns around (turns);
 * `bubble`: an emoji over the head; `burst`: particle colours; `lie`: lies down for a nap.
 */
export const EMOTES = [
  { id: 'wave', icon: '👋', name: 'Wave', move: 'victory' },
  { id: 'sip', icon: '🍵', name: 'Sip tea', move: 'sip' },
  { id: 'hops', icon: '🐸', name: 'Happy hops', move: 'hop', hops: 3 },
  { id: 'heart', icon: '❤️', name: 'Love', bubble: '❤️', burst: ['#ff5a7a', '#ff9ec7', '#ffffff'], unlock: 'duo' },
  { id: 'laugh', icon: '😂', name: 'Laugh', move: 'victory', bubble: '😂', unlock: 'combo50' },
  { id: 'spin', icon: '🌀', name: 'Spin', spin: 2, unlock: 'skills3' },
  { id: 'flip', icon: '🤸', name: 'Backflip', move: 'flip', unlock: 'queen' },
  { id: 'dance', icon: '💃', name: 'Dance', move: 'hop', hops: 4, spin: 1, bubble: '🎵', unlock: 'shogun' },
  { id: 'flex', icon: '💪', name: 'Flex', move: 'slam', bubble: '💪', unlock: 'kills1000' },
  { id: 'nap', icon: '💤', name: 'Nap', lie: true, bubble: '💤', unlock: 'whisker' },
  { id: 'confetti', icon: '🎉', name: 'Confetti', move: 'victory', burst: ['#ff9ec7', '#7ed957', '#5fb8ff', '#ffd23f', '#c58aff'], unlock: 'party' },
  { id: 'sparkle', icon: '✨', name: 'Sparkle', move: 'victory', burst: ['#ffffff', '#ffe680', '#ffd36b'], unlock: 'golden' },
  { id: 'fire', icon: '🔥', name: 'Fired up', move: 'slam', burst: ['#ff6a00', '#ffb020', '#ffe066'], unlock: 'steep5' },
  { id: 'crown', icon: '👑', name: 'Royal bow', move: 'attack', bubble: '👑', unlock: 'empress' },
  { id: 'tower', icon: '🗼', name: 'Tower pose', move: 'victory', bubble: '🗼', burst: ['#7ff0d0', '#ffffff'], unlock: 'tower' },
  { id: 'god', icon: '🌟', name: 'Godlike', move: 'victory', spin: 1, burst: ['#ffffff', '#fff2a0', '#ffc93c'], bubble: '🌟', unlock: 'god' },
];

export const emoteById = (id) => EMOTES.find((emote) => emote.id === id);

/** Whether an emote is free or unlocked by an achievement in `achievements` (ids). */
export const emoteUnlocked = (emote, achievements = []) => !emote.unlock || achievements.includes(emote.unlock);
