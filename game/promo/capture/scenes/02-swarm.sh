. "$(dirname "$0")/common.sh"; N=109
$C reload "$META" >/dev/null
$C eval "$startRun"'
game.startWave(3); await waitFor(() => game.phase === "fighting"); game.setWeather("noon", "clear");
game.learn("comet"); game.cameraOffset.multiplyScalar(0.8);
const P = game.player.position; for (let i = 0; i < 30; i++) { const a = i / 30 * Math.PI * 2; game.spawn(i % 5 ? "drone" : "zipper", P.x + Math.cos(a) * 260, P.y + Math.sin(a) * 260); }
ff(0.3); return game.enemies.length'
$C record "{\"dir\":\"$F/02\",\"frames\":$N,\"each\":\"if(n===4) __cap('Then the bees came.', 'A 3D roguelite bullet hell'); if(n===$N-10) __cap(null);\"}"
