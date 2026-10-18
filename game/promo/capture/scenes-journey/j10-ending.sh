. "$(dirname "$0")/common.sh"; N=235
# Both of Bee-zebub's lives gone: the ending cut-scene, back home in the garden, a cup of tea at last.
$C reload "$META" >/dev/null
$C eval "$cine$startRun"'
for (const id of ["comet","thunder","fireflies"]) for (let i=0;i<3;i++) game.learn(id);
game.startWave(21); await waitFor(() => boss() && game.phase === "fighting", 90000);
game.setTier(4); game.skipSpawns(); boss().hp = 40; game.killAll();
await waitFor(() => boss()?.ai.trueForm && game.phase === "fighting", 30000); ff(0.5);
const b = boss(); b.ai.stage = 99; b.hp = 40; game.killAll();
for (let i = 0; i < 400 && game.phase !== "ending"; i++) { game.skipSpawns(); game.killAll(); ff(0.1); }
return game.phase'
$C record "{\"dir\":\"$F/j10\",\"frames\":$N,\"each\":\"return n % 30 === 0 ? game.phase : undefined;\"}"
