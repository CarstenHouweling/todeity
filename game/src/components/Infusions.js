/**
 * Infusions: small upgrades picked on every level-up during a wave (tea leaves are the experience). They stack
 * without limit, like items in a roguelite, on top of the brews chosen between waves.
 * `weight` sets how often one is offered; `max` caps the stack.
 */
export const INFUSIONS = [
  { id: 'sharp', icon: '🗡️', name: 'Sharp Leaves', text: '+12% damage', weight: 10, apply: (s) => (s.damageMultiplier *= 1.12) },
  { id: 'sip', icon: '💧', name: 'Quick Sip', text: 'Spit 10% faster', weight: 10, apply: (s) => (s.spitCooldown *= 0.9) },
  { id: 'feet', icon: '🦶', name: 'Swift Feet', text: '+7% move speed', weight: 8, apply: (s) => (s.moveSpeed *= 1.07) },
  { id: 'crit', icon: '🎯', name: 'Golden Brew', text: '+8% critical chance (crits deal ×2)', weight: 8, max: 8, apply: (s) => (s.critChance += 0.08) },
  { id: 'heart', icon: '❤️', name: 'Steeped Heart', text: '+1 max heart and heal 1', weight: 6, apply: (s, player) => {
    s.maxHp += 1;
    player.heal(1);
  } },
  { id: 'magnet', icon: '🧲', name: 'Leaf Magnet', text: '+40% leaf pickup range', weight: 6, max: 5, apply: (s) => (s.magnet *= 1.4) },
  { id: 'kettle', icon: '💥', name: 'Hot Kettle', text: 'Tea bombs deal +30% damage', weight: 7, apply: (s) => (s.splashDamage *= 1.3) },
  { id: 'reach', icon: '🎋', name: 'Long Steep', text: 'Spit flies 15% further and faster', weight: 6, apply: (s) => {
    s.spitRange *= 1.15;
    s.spitSpeed *= 1.15;
  } },
  { id: 'bomb', icon: '🫖', name: 'Spare Kettle', text: '+1 tea bomb charge', weight: 3, max: 2, rare: true, apply: (s) => (s.bombCharges += 1) },
  { id: 'twin', icon: '🌿', name: 'Twin Leaf', text: '+1 spit projectile', weight: 2, max: 3, rare: true, apply: (s) => (s.spitCount += 1) },
  { id: 'hop', icon: '🐸', name: 'Spring Step', text: 'Dash recharges 15% faster', weight: 5, apply: (s) => (s.dashCooldown *= 0.85) },
  { id: 'lucky', icon: '🍀', name: 'Lucky Leaf', text: 'Leaves are worth 15% more', weight: 5, max: 5, apply: (s) => (s.leafValue *= 1.15) },
];

/** Three different infusions, weighted, respecting stack caps. */
export function rollInfusions(levels) {
  const pool = INFUSIONS.filter((infusion) => !infusion.max || (levels.get(infusion.id) ?? 0) < infusion.max);
  const picks = [];
  while (picks.length < 3 && pool.length) {
    const total = pool.reduce((sum, infusion) => sum + infusion.weight, 0);
    let roll = Math.random() * total;
    const index = pool.findIndex((infusion) => (roll -= infusion.weight) < 0);
    picks.push(...pool.splice(Math.max(0, index), 1));
  }
  return picks;
}

/** Experience needed to go from `level` to the next one. */
export const leavesForLevel = (level) => Math.round(6 + level * 3 + level * level * 0.45);
