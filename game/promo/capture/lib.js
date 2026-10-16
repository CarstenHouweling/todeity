window.wait = (ms) => new Promise((r) => setTimeout(r, ms));
window.waitFor = async (test, ms = 20000) => { const t = performance.now(); while (!test() && performance.now() - t < ms) await wait(100); return test(); };
window.ff = (s) => { for (let i = 0; i < s * 30; i++) { __pilot.tick(); __vt.advance(1000/60); __vt.advance(1000/60); } };

window.boss = () => game.enemies.find((e) => e.type.boss && !e.dying);
// Keep Tode `d` away from the boss (on the side he's on), so both are on screen.
window.keepNear = (d = 220) => { const b = boss(); if (!b) return (__pilot.goal = null); const p = game.player.position; const dx = p.x - b.position.x, dy = p.y - b.position.y, l = Math.hypot(dx, dy) || 1; __pilot.goal = { x: b.position.x + dx / l * d, y: b.position.y + dy / l * d }; };
// Tode below the boss on screen (the boss `d` further up the screen), so both are in view.
window.below = (d = 220) => { const b = boss(); if (!b) return (__pilot.goal = null); __pilot.goal = { x: b.position.x + d * Math.SQRT1_2, y: b.position.y - d * Math.SQRT1_2 }; };
// Tode to the right of the boss on screen, so a beam crosses the middle of the screen.
window.right = (d = 300) => { const b = boss(); if (!b) return (__pilot.goal = null); __pilot.goal = { x: b.position.x + d * Math.SQRT1_2, y: b.position.y + d * Math.SQRT1_2 }; };
