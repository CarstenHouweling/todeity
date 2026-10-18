. "$(dirname "$0")/common.sh"; N=54
$C reload "$TALL" >/dev/null
$C eval "$quiet$startRun"'
for (const id of ["comet","thunder"]) for (let i=0;i<3;i++) game.learn(id);
game.startWave(10); await waitFor(() => boss() && game.phase === "fighting", 40000);
game.setTier(2); game.setWeather("noon", "clear"); __pilot.ult = false; __pilot.kite = 0.05; __pilot.zones = false; __pilot.center = 0;
for (let i = 0; i < 150; i++) { below(260); ff(1/30); }
game.ultimate("beam"); __pilot.aim(boss().position); __pilot.key("KeyE"); for (let i = 0; i < 12; i++) { below(260); __pilot.aim(boss().position); ff(1/30); } return 1' >/dev/null
$C record "{\"dir\":\"$F/s05\",\"frames\":$N,\"each\":\"below(260); const b = boss(); if (b) __pilot.aim(b.position); if(n===1) __big('Melt bosses with<br>a <em>tea beam</em>');\"}"
