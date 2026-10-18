. "$(dirname "$0")/common.sh"; N=109
$C reload "$TALL" >/dev/null
$C eval "$quiet$startRun"'
game.startWave(2); await waitFor(() => game.phase === "fighting"); game.setWeather("noon", "clear"); game.learn("comet"); game.cameraOffset.multiplyScalar(0.62);
const P = game.player.position; for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2; game.spawn(i % 5 ? "drone" : "zipper", P.x + Math.cos(a) * 230, P.y + Math.sin(a) * 230); }
ff(0.3); return 1' >/dev/null
$C record "{\"dir\":\"$F/s02\",\"frames\":$N,\"each\":\"if(n===1) __big('Then 1,000 <em>bees</em><br>showed up');\"}"
