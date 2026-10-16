// In-page autopilot for footage (adapted from game/src/dev/bot.js): one decision per captured frame.
(() => {
  const SR = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
  const SU = { x: -Math.SQRT1_2, y: Math.SQRT1_2 };
  const held = new Set();
  const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : code }));
  const setKey = (code, on) => {
    if (on === held.has(code)) return;
    on ? held.add(code) : held.delete(code);
    key(on ? 'keydown' : 'keyup', code);
  };
  const tap = (code) => (key('keydown', code), key('keyup', code));
  const aim = (position) => {
    const v = position.clone().setZ(10).project(game.camera);
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: ((v.x + 1) / 2) * innerWidth, clientY: ((1 - v.y) / 2) * innerHeight }));
  };
  const P = (window.__pilot = {
    on: true,
    dash: true,
    ult: true,
    pick: false, // auto-pick cards
    kite: 1, // how strongly to flee bees
    center: 0.05,
    goal: null, // {x, y}: walk there
    wander: 0, // circle-strafe strength
    t: 0,
    key: tap,
    setKey,
    aim,
    release: () => held.forEach((c) => setKey(c, false)),
  });
  P.tick = () => {
    P.t += 1 / 30;
    if (window.game && P.immortal !== false) game.player.hp = game.player.stats.maxHp;
    if (!P.on || !window.game) return;
    if (P.pick && ['choosing', 'ultimate', 'skill'].includes(game.phase)) {
      const cards = [...document.querySelectorAll('.card')];
      cards[Math.floor(Math.random() * cards.length)]?.click();
    }
    const p = game.player.position;
    const alive = game.enemies.filter((e) => !e.dying);
    const zone = P.zones === false ? null : game.objectiveZones?.[0];
    let fx = -p.x * (zone ? 0.005 : P.center);
    let fy = -p.y * (zone ? 0.005 : P.center);
    const target = P.goal || zone;
    if (target) {
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > 12) (fx += (dx / d) * (d > 60 ? 10 : 25)), (fy += (dy / d) * (d > 60 ? 10 : 25));
    }
    if (P.wander) {
      fx += Math.cos(P.t * 0.7) * P.wander;
      fy += Math.sin(P.t * 0.7) * P.wander;
    }
    const edge = (game.mapHalfSize ?? 400) - 70;
    for (const [cx, cy] of [[-edge, -edge], [edge, -edge], [-edge, edge], [edge, edge]]) {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const w = 3000 / (dx * dx + dy * dy + 1);
      fx += dx * w;
      fy += dy * w;
    }
    for (const e of alive) {
      const dx = p.x - e.position.x;
      const dy = p.y - e.position.y;
      const w = (P.kite * (e.type.boss ? 3 : 1) * (zone ? 250 : 1000)) / (dx * dx + dy * dy + 1);
      fx += dx * w;
      fy += dy * w;
    }
    for (const b of game.bullets.list) {
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      const d = Math.hypot(dx, dy);
      const inc = (dx * b.dx + dy * b.dy) / (d || 1);
      if (d > 140 || inc < 0.8) continue;
      const side = Math.sign(dx * b.dy - dy * b.dx) || 1;
      fx += b.dy * side * 40;
      fy += -b.dx * side * 40;
    }
    const sx = fx * SR.x + fy * SR.y;
    const sy = fx * SU.x + fy * SU.y;
    const len = Math.hypot(sx, sy) || 1;
    const still = Math.hypot(fx, fy) < 0.3;
    setKey('KeyD', !still && sx / len > 0.38);
    setKey('KeyA', !still && sx / len < -0.38);
    setKey('KeyW', !still && sy / len > 0.38);
    setKey('KeyS', !still && sy / len < -0.38);
    const nearest = alive.sort((a, b) => a.position.distanceTo(p) - b.position.distanceTo(p))[0];
    if (nearest) aim(nearest.position);
    if (P.dash && nearest && nearest.position.distanceTo(p) < nearest.radius + 25) tap('Space');
    if (P.ult && game.player.gauge >= 100 && alive.length >= 3) tap('KeyE');
  };
})();
