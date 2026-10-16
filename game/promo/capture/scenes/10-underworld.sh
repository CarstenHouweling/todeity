. "$(dirname "$0")/common.sh"
$C reload "$META" >/dev/null
$C eval "$startRun"'
for (const id of ["comet","thunder","fireflies"]) for (let i=0;i<3;i++) game.learn(id);
game.startWave(20); await waitFor(() => boss() && game.phase === "fighting", 60000);
game.setTier(3); ff(1); game.killAll(); ff(0.3);
for (let i = 0; i < 300 && game.phase !== "travel"; i++) { game.killAll(); ff(0.1); if (["choosing","ultimate","skill","chest"].includes(game.phase)) { document.querySelector(".card")?.click(); __pilot.key("Space"); } }
return game.phase'
# the fall (~0-100) and, after a skip, Bee-zebub's entrance
$C record "{\"dir\":\"$F/10\",\"frames\":103}"
$C record "{\"dir\":\"$F/10x\",\"frames\":107}"
$C record "{\"dir\":\"$F/11\",\"frames\":102,\"each\":\"if(n===0) __cap(null); if(n===6) __cap('Raid bosses', 'Stages · shields · enrage timers', 'tl'); if(n===92) __cap(null);\"}"
