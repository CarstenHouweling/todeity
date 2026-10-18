. "$(dirname "$0")/common.sh"; N=206
# God of Tea becomes Omnitode, the last form (the main trailer stops at God of Tea).
$C reload "$META" >/dev/null
$C eval "$cine$startRun"'
for (const id of ["comet","thunder","fireflies"]) for (let i=0;i<3;i++) game.learn(id);
game.startWave(17); await waitFor(() => game.phase === "fighting", 40000); game.setWeather("noon", "clear"); game.skipSpawns(); game.killAll();
const P = game.player.position; for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2; game.spawn("drone", P.x + Math.cos(a) * 300, P.y + Math.sin(a) * 300); }
document.head.insertAdjacentHTML("beforeend", "<style>.callout,.wave-banner,.banner{visibility:hidden!important}</style>"); game.setTier(4); game.cameraOffset.multiplyScalar(0.75); ff(1.2); game.ascend(5); return game.phase'
$C record "{\"dir\":\"$F/j07\",\"frames\":$N}"
