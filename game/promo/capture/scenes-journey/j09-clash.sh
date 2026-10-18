. "$(dirname "$0")/common.sh"; N=206
# Bee-zebub roars and fires his beam; Tode answers, and the player mashes the clash point back.
$C reload "$META" >/dev/null
$C eval "$cine$startRun"'
for (const id of ["comet","thunder","fireflies"]) for (let i=0;i<3;i++) game.learn(id);
game.startWave(21); await waitFor(() => boss() && game.phase === "fighting", 90000);
game.setTier(4); __pilot.ult = false; __pilot.zones = false; __pilot.kite = 0.05; __pilot.dash = false;
for (let i = 0; i < 150; i++) { below(260); ff(1/30); }
game.skipSpawns(); document.head.insertAdjacentHTML("beforeend", "<style>.callout{visibility:hidden!important}</style>"); return [boss()?.type.name, game.phase]'
# frame 6: past his stage script (no shield), under his first roar threshold: the roar starts the clash
$C record "{\"dir\":\"$F/j09\",\"frames\":$N,\"each\":\"below(260); const b = boss(); if (b) __pilot.aim(b.position); if (n===6 && b) { b.ai.stage = 99; b.hp = Math.round(b.maxHp * 0.64); } if (game.phase === 'clash' && n % 3 === 0) __pilot.key('Space'); if (n===8) __chapter(); return n % 20 === 0 ? game.phase : undefined;\"}"
