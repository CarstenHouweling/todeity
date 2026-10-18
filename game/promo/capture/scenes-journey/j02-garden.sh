. "$(dirname "$0")/common.sh"; N=109
# Chapter I: the first bees in Tode's garden, morning light.
$C reload "$META" >/dev/null
$C eval "$cine$startRun"'
game.startWave(2); await waitFor(() => game.phase === "fighting"); game.setWeather("morning", "clear");
game.learn("comet"); game.skipSpawns(); game.killAll(); game.cameraOffset.multiplyScalar(0.75);
const P = game.player.position; for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; game.spawn("drone", P.x + Math.cos(a) * 240, P.y + Math.sin(a) * 240); }
ff(0.5); __noUI(true); return 1' >/dev/null
$C record "{\"dir\":\"$F/j02\",\"frames\":$N,\"each\":\"if(n===8) __chapter('I', 'Tode’s Garden'); if(n===$N-14) __chapter();\"}"
