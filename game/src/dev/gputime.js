// Dev-only GPU timing of the current frame, in the browser console:
//   await game.gpuTime()            // ms the GPU spends drawing one frame (median of 7 queries of 10 renders each)
//   await game.gpuTime({ renders: 20, queries: 5 })
// Renders the frozen frame again and again inside EXT_disjoint_timer_query_webgl2 queries (several renders per query,
// so the GPU clocks up). Returns null when the browser doesn't offer the timer. Use it with game.step() between
// measurements and game.setQualityStep(n) to compare steps; frame-rate numbers can't do that on a 60 Hz screen.
export function makeGpuTime(game) {
  return async ({ renders = 10, queries = 7 } = {}) => {
    const gl = game.renderer.getContext();
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!ext) return null;
    const results = [];
    for (let q = 0; q < queries; q++) {
      const query = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
      for (let i = 0; i < renders; i++) game.postfx.render(0);
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      let available = false;
      for (let tries = 0; tries < 200 && !available; tries++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        available = gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE);
      }
      if (available && !gl.getParameter(ext.GPU_DISJOINT_EXT)) results.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6 / renders);
      gl.deleteQuery(query);
    }
    results.sort((a, b) => a - b);
    return results.length ? Math.round(results[results.length >> 1] * 100) / 100 : null;
  };
}
