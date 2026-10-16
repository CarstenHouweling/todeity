. "$(dirname "$0")/common.sh"; N=103
$C reload "$META" >/dev/null
$C eval "$startRun"'
game.startWave(9); await waitFor(() => game.phase === "fighting", 40000);
for (const id of ["comet","thunder"]) for (let i=0;i<2;i++) game.learn(id);
game.setTier(1); game.setWeather("noon", "clear"); game.cameraOffset.multiplyScalar(1.2); __pilot.ult = false;
ff(1); game.skipSpawns(); const P = game.player.position; for (let i = 0; i < 16; i++) game.spawn(i % 3 ? "drone" : "brute", P.x - 200 + Math.cos(i) * 80, P.y - 200 + Math.sin(i) * 80);
__pilot.on = false; __pilot.release(); ff(0.8); game.ultimate("summon"); return game.arena'
$C record "{\"dir\":\"$F/09\",\"frames\":$N,\"each\":\"const P = game.player.position; __pilot.aim(P.clone().set(P.x - 100, P.y - 100, 0)); if(n===2) __pilot.key('KeyE'); if(n===16) __cap('Summon the Great Tode', 'Three ultimates to choose from'); if(n===$N-10) __cap(null);\"}"
