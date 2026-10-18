. "$(dirname "$0")/common.sh"; N=55
$C reload "$TALL" >/dev/null
$C eval "$quiet$startRun"'
game.startWave(16); await waitFor(() => game.phase === "fighting", 40000);
for (const id of ["comet","thunder"]) for (let i=0;i<3;i++) game.learn(id);
game.setTier(2); game.skipSpawns(); game.killAll(); __pilot.kite = 0.3; game.cameraOffset.multiplyScalar(0.8);
for (let i = 0; i < 6; i++) game.spawn("stinger", Math.cos(i) * 300, Math.sin(i) * 300);
ff(1.5); game.event("noose"); ff(0.9); game.event("starburst"); ff(0.4); return 1' >/dev/null
$C record "{\"dir\":\"$F/s04\",\"frames\":$N,\"each\":\"if(n===1) __big('Dodge<br><em>everything</em>');\"}"
