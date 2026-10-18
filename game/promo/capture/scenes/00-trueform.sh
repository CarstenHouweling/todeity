. "$(dirname "$0")/common.sh"; N=${N:-103}
# Cold open: Bee-zebub's killing blow, the screen cracks and he rises again in his true form.
$C reload "$META" >/dev/null
$C eval "$startRun"'
for (const id of ["comet","thunder","fireflies"]) for (let i=0;i<3;i++) game.learn(id);
game.startWave(21); await waitFor(() => boss() && game.phase === "fighting", 90000);
game.setTier(2); __pilot.ult = false; __pilot.zones = false; __pilot.kite = 0.05; __pilot.dash = false;
for (let i = 0; i < 200; i++) { below(240); ff(1/30); }
game.skipSpawns(); document.head.insertAdjacentHTML("beforeend", "<style>.callout{visibility:hidden!important}</style>"); const b = boss(), p = game.player.position; return [b?.type.name, b?.shielded, Math.round(Math.hypot(p.x - b.position.x, p.y - b.position.y)), game.phase]'
# frame 4: the killing blow (hp low, then a hit in the same frame, before a stage threshold can start a shield)
$C record "{\"dir\":\"$F/00\",\"frames\":$N,\"each\":\"below(240); const b = boss(); if (b) __pilot.aim(b.position); if (n===4 && b) { b.hp = 40; game.killAll(); }\"}"
