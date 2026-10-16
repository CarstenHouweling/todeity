. "$(dirname "$0")/common.sh"; N=109
$C reload "$META" >/dev/null
$C eval "$startRun"'
game.startWave(16); await waitFor(() => game.phase === "fighting", 40000);
for (const id of ["comet","thunder"]) for (let i=0;i<3;i++) game.learn(id);
game.setTier(1); game.skipSpawns(); game.killAll(); __pilot.kite = 0.3;
for (let i = 0; i < 6; i++) game.spawn("stinger", Math.cos(i) * 300, Math.sin(i) * 300);
ff(1.5); game.event("noose"); ff(0.6); return game.bullets.list.length'
$C record "{\"dir\":\"$F/03\",\"frames\":$N,\"each\":\"if(n===4) __cap('Dodge, dash, graze', 'Near misses charge your ultimate'); if(n===$N-10) __cap(null); if(n===45) game.event('starburst');\"}"
