// Virtual time for frame-exact capture: timers, rAF, performance.now and Date.now follow window.__vt.
// In auto mode a real rAF pump advances it at real speed (loading, menus); in manual mode the harness calls
// __vt.advance(ms) per frame and __vt.syncAnimations() to pin CSS animations to the same clock.
(() => {
  const realRAF = window.requestAnimationFrame.bind(window);
  const perfNow = performance.now.bind(performance);
  const t0 = perfNow();
  const d0 = Date.now();
  let vt = 0;
  const V = (window.__vt = { auto: true, now: () => vt, errors: [] });
  let nextId = 1;
  const timers = new Map();
  let rafs = new Map();
  performance.now = () => t0 + vt;
  Date.now = () => d0 + vt;
  window.setTimeout = (fn, ms = 0, ...args) => {
    const id = nextId++;
    timers.set(id, { at: vt + Math.max(0, +ms || 0), fn, args });
    return id;
  };
  window.setInterval = (fn, ms = 0, ...args) => {
    const id = nextId++;
    const every = Math.max(4, +ms || 0);
    timers.set(id, { at: vt + every, fn, args, every });
    return id;
  };
  window.clearTimeout = window.clearInterval = (id) => timers.delete(id);
  window.requestAnimationFrame = (fn) => {
    const id = nextId++;
    rafs.set(id, fn);
    return id;
  };
  window.cancelAnimationFrame = (id) => rafs.delete(id);
  const call = (fn, args) => {
    try {
      typeof fn === 'function' ? fn(...args) : (0, eval)(fn);
    } catch (e) {
      console.error(e);
      if (V.errors.length < 50) V.errors.push(String(e && e.stack || e));
    }
  };
  const runTimers = (until) => {
    for (let guard = 0; guard < 20000; guard++) {
      let best = null;
      let bestId;
      for (const [id, t] of timers) if (t.at <= until && (!best || t.at < best.at)) (best = t), (bestId = id);
      if (!best) break;
      vt = Math.max(vt, best.at);
      if (best.every) best.at += best.every;
      else timers.delete(bestId);
      call(best.fn, best.args);
    }
  };
  V.advance = (ms) => {
    const until = vt + ms;
    runTimers(until);
    vt = until;
    const list = rafs;
    rafs = new Map();
    for (const fn of list.values()) call(fn, [t0 + vt]);
  };
  let last = perfNow();
  const pump = () => {
    const now = perfNow();
    if (V.auto) V.advance(Math.min(50, now - last));
    last = now;
    realRAF(pump);
  };
  realRAF(pump);
  const seen = new WeakMap();
  V.syncAnimations = () => {
    for (const a of document.getAnimations()) {
      if (!seen.has(a)) {
        seen.set(a, vt - (a.currentTime ?? 0));
        a.pause();
      }
      a.currentTime = Math.max(0, vt - seen.get(a));
    }
  };
  V.releaseAnimations = () => {
    for (const a of document.getAnimations()) if (seen.has(a)) a.play();
  };
})();
