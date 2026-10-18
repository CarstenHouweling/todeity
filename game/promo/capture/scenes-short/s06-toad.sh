. "$(dirname "$0")/common.sh"; N=55
$C reload "$TALL" >/dev/null
$C eval "$quiet$startRun"'
game.startWave(9); await waitFor(() => game.phase === "fighting", 40000);
for (const id of ["comet","thunder"]) for (let i=0;i<2;i++) game.learn(id);
game.setTier(1); game.setWeather("noon", "clear"); __pilot.ult = false;
ff(1); game.skipSpawns(); const P = game.player.position; for (let i = 0; i < 16; i++) game.spawn(i % 3 ? "drone" : "brute", P.x - 160 + Math.cos(i) * 70, P.y - 160 + Math.sin(i) * 70);
__pilot.on = false; __pilot.release(); ff(0.5); game.ultimate("summon"); __pilot.aim(P.clone().set(P.x - 100, P.y - 100, 0)); __pilot.key("KeyE"); ff(0.9); return 1' >/dev/null
$C record "{\"dir\":\"$F/s06\",\"frames\":$N,\"each\":\"if(n===1) __big('Summon a<br><em>giant toad</em>');\"}"
