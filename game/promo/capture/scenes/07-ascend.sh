. "$(dirname "$0")/common.sh"
$C reload "$META" >/dev/null
$C eval "$startRun"'
game.startWave(2); await waitFor(() => game.phase === "fighting"); game.setWeather("noon", "clear");
for (const id of ["comet","thunder"]) for (let i=0;i<2;i++) game.learn(id);
const P = game.player.position; for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; game.spawn("drone", P.x + Math.cos(a) * 320, P.y + Math.sin(a) * 320); }
game.setTier(1); game.cameraOffset.multiplyScalar(0.7); ff(1.5); game.ascend(2); return game.phase'
$C record "{\"dir\":\"$F/07\",\"frames\":103,\"each\":\"if(n===4) __cap('Ascend', 'From garden frog to God of Tea');\"}"
$C eval 'const P = game.player.position; for (let i = 0; i < 30; i++) { const a = i / 30 * Math.PI * 2; game.spawn("drone", P.x + Math.cos(a) * 320, P.y + Math.sin(a) * 320); } game.setTier(3); ff(1.2); game.ascend(4); return game.phase'
$C record "{\"dir\":\"$F/07\",\"frames\":103,\"start\":103,\"each\":\"if(n===92) __cap(null);\"}"
