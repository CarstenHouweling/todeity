. "$(dirname "$0")/common.sh"; N=103
$C reload "$TALL" >/dev/null
$C eval "$quiet$startRun"'
for (const id of ["comet","thunder","fireflies"]) for (let i=0;i<3;i++) game.learn(id);
game.startWave(21); await waitFor(() => boss() && game.phase === "fighting", 90000);
game.setTier(2); __pilot.ult = false; __pilot.zones = false; __pilot.kite = 0.05; __pilot.dash = false;
for (let i = 0; i < 200; i++) { below(240); ff(1/30); } game.skipSpawns(); return 1' >/dev/null
$C record "{\"dir\":\"$F/s07\",\"frames\":$N,\"each\":\"below(240); const b = boss(); if (b) __pilot.aim(b.position); if (n===3 && b) { b.hp = 40; game.killAll(); } if(n===1) __big('The final boss<br><em>gets back up</em>');\"}"
