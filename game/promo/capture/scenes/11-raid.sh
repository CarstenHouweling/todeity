. "$(dirname "$0")/common.sh"; N=${N:-102}
# Raid mechanics: the Seraph Queen in the Sky Citadel puts up her shield and the Halo Crystals start circling.
$C reload "$META" >/dev/null
$C eval "$startRun"'
for (const id of ["comet","thunder","fireflies"]) for (let i=0;i<3;i++) game.learn(id);
game.startWave(15); await waitFor(() => boss() && game.phase === "fighting", 90000);
game.setTier(3); game.setWeather("noon", "clear"); __pilot.ult = false; __pilot.zones = false; __pilot.kite = 0.1;
for (let i = 0; i < 120; i++) { below(260); ff(1/30); }
return [boss()?.type.name, game.arena]'
$C record "{\"dir\":\"$F/11\",\"frames\":$N,\"each\":\"below(260); const b = boss(); if (b) __pilot.aim(b.position); if (n===3 && b) b.hp = Math.round(b.maxHp * 0.825); if(n===10) __cap('Raid bosses', 'Stages · shields · enrage timers'); if(n===$N-10) __cap(null);\"}"
