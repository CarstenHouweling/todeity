// Dev-only autoplayer for balance testing. In the browser console:
//   const bot = game.makeBot(); bot.run(120)  // simulates 120 s of play, returns a log
// It kites away from bees, aims at the nearest one, splashes crowds and picks random brews.
// It never dodges stingers on purpose, so it is weaker than a human late in a run.

const SCREEN_RIGHT = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
const SCREEN_UP = { x: -Math.SQRT1_2, y: Math.SQRT1_2 };

export function makeBot(game) {
  const canvas = document.querySelector('canvas.game');
  const held = new Set();
  const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code }));
  const setKey = (code, on) => {
    if (on === held.has(code)) return;
    on ? held.add(code) : held.delete(code);
    key(on ? 'keydown' : 'keyup', code);
  };
  const tap = (code) => {
    key('keydown', code);
    key('keyup', code);
  };
  const holdFire = () => canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
  const aim = (position) => {
    const v = position.clone().setZ(10).project(game.camera);
    window.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: ((v.x + 1) / 2) * window.innerWidth,
        clientY: ((1 - v.y) / 2) * window.innerHeight,
      })
    );
  };

  const bot = { time: 0, log: [], wave: 0, waveStart: 0 };
  game.autoPause = false; // the test browser is often in the background
  if (game.phase === 'title' || game.phase === 'gameover') tap('Space');
  game.step(0.05);
  holdFire();

  bot.run = (seconds) => {
    const end = bot.time + seconds;
    while (bot.time < end && game.phase !== 'gameover') {
      if (game.phase === 'victory') {
        bot.log.push('VICTORY');
        document.querySelector('[data-action="retire"]').click();
        break;
      }
      if (game.phase === 'chest') {
        // The Royal Tea Chest after a boss: collect once its reel has stopped.
        document.querySelector('[data-action="chest-collect"]:not([disabled])')?.click();
        game.step(0.1);
        bot.time += 0.1;
        continue;
      }
      if (['choosing', 'ultimate', 'skill'].includes(game.phase)) {
        const cards = [...document.querySelectorAll('.card')];
        const card = cards[Math.floor(Math.random() * cards.length)];
        bot.log.push(`+${card.querySelector('.card-name').textContent}`);
        card.click();
        holdFire();
      }
      if (game.wave !== bot.wave) {
        if (bot.wave) bot.log.push(`wave ${bot.wave}: ${(bot.time - bot.waveStart).toFixed(0)}s, ${game.player.hp} hp`);
        bot.wave = game.wave;
        bot.waveStart = bot.time;
      }

      const p = game.player.position;
      const alive = game.enemies.filter((e) => !e.dying);
      // Flee from nearby bees (the queen counts triple), drift back toward the middle,
      // and stay out of the corners where bees spawn.
      // Shrine objectives (circles of light, safe spots, …): walk into the nearest one; then the pull to the
      // middle is weak, or it would cancel the walk to circles far out in the big arenas.
      const shrine = game.objectiveZones?.[0];
      let fx = -p.x * (shrine ? 0.005 : 0.05);
      let fy = -p.y * (shrine ? 0.005 : 0.05);
      if (shrine) {
        const dx = shrine.x - p.x;
        const dy = shrine.y - p.y;
        const distance = Math.hypot(dx, dy) || 1;
        // Head for it, and once inside keep to its middle (bees would shove it out otherwise).
        if (distance > 12) {
          const pull = distance > 60 ? 10 : 25;
          fx += (dx / distance) * pull;
          fy += (dy / distance) * pull;
        }
      }
      // Keep away from the corners where bees spawn (the arenas grow, so ask how big this one is).
      const edge = (game.mapHalfSize ?? 400) - 70;
      for (const [cx, cy] of [[-edge, -edge], [edge, -edge], [-edge, edge], [edge, edge]]) {
        const dx = p.x - cx;
        const dy = p.y - cy;
        const weight = 3000 / (dx * dx + dy * dy + 1);
        fx += dx * weight;
        fy += dy * weight;
      }
      for (const e of alive) {
        const dx = p.x - e.position.x;
        const dy = p.y - e.position.y;
        // With a circle to reach, it braves the bees (a player would too).
        const weight = ((e.type.boss ? 3 : 1) * (shrine ? 250 : 1000)) / (dx * dx + dy * dy + 1);
        fx += dx * weight;
        fy += dy * weight;
      }
      // Sidestep bullets flying at Tode, like a player would.
      for (const bullet of game.bullets.list) {
        const dx = p.x - bullet.x;
        const dy = p.y - bullet.y;
        const distance = Math.hypot(dx, dy);
        const incoming = (dx * bullet.dx + dy * bullet.dy) / (distance || 1);
        if (distance > 140 || incoming < 0.8) continue;
        const side = Math.sign(dx * bullet.dy - dy * bullet.dx) || 1;
        fx += bullet.dy * side * 40;
        fy += -bullet.dx * side * 40;
      }
      const sx = fx * SCREEN_RIGHT.x + fy * SCREEN_RIGHT.y;
      const sy = fx * SCREEN_UP.x + fy * SCREEN_UP.y;
      const length = Math.hypot(sx, sy) || 1;
      setKey('KeyD', sx / length > 0.38);
      setKey('KeyA', sx / length < -0.38);
      setKey('KeyW', sy / length > 0.38);
      setKey('KeyS', sy / length < -0.38);

      const nearest = alive.sort((a, b) => a.position.distanceTo(p) - b.position.distanceTo(p))[0];
      if (nearest) aim(nearest.position);
      if (nearest && nearest.position.distanceTo(p) < nearest.radius + 25) tap('Space');
      if (game.player.gauge >= 100 && alive.length >= 3) tap('KeyE');

      game.step(0.1);
      bot.time += 0.1;
    }
    if (game.phase === 'gameover') bot.log.push(`run over in wave ${game.wave} after ${bot.time.toFixed(0)}s`);
    return bot.log.join(' | ');
  };

  bot.stop = () => {
    held.forEach((code) => setKey(code, false));
    window.dispatchEvent(new PointerEvent('pointerup', { button: 0 }));
  };
  return bot;
}
