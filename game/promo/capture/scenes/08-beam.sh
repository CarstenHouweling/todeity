. "$(dirname "$0")/common.sh"; N=103
$C reload "$META" >/dev/null
$C eval "$startRun"'
for (const id of ["comet","thunder"]) for (let i=0;i<3;i++) game.learn(id);
game.startWave(10); await waitFor(() => boss() && game.phase === "fighting", 40000);
game.setTier(2); game.setWeather("noon", "clear"); __pilot.ult = false; __pilot.kite = 0.05; __pilot.zones = false; __pilot.center = 0;
for (let i = 0; i < 150; i++) { right(320); ff(1/30); }
game.ultimate("beam"); return boss()?.type.name'
$C record "{\"dir\":\"$F/08\",\"frames\":$N,\"each\":\"right(320); const b = boss(); if (b) __pilot.aim(b.position); if(n===4) __pilot.key('KeyE'); if(n===10) __cap('Unleash ultimates', 'The Steeping Beam'); if(n===$N-10) __cap(null);\"}"
