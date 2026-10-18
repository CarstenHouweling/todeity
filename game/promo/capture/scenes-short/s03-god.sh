. "$(dirname "$0")/common.sh"; N=109
$C reload "$TALL" >/dev/null
$C eval "$quiet$startRun"'
game.startWave(2); await waitFor(() => game.phase === "fighting"); game.setWeather("noon", "clear");
for (const id of ["comet","thunder"]) for (let i=0;i<2;i++) game.learn(id);
const P = game.player.position; for (let i = 0; i < 30; i++) { const a = i / 30 * Math.PI * 2; game.spawn("drone", P.x + Math.cos(a) * 280, P.y + Math.sin(a) * 280); }
game.setTier(1); game.cameraOffset.multiplyScalar(0.62); ff(1.2); game.ascend(2); return 1' >/dev/null
$C record "{\"dir\":\"$F/s03\",\"frames\":$N,\"each\":\"if(n===1) __big('So he became<br>a <em>god</em>');\"}"
