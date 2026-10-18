. "$(dirname "$0")/common.sh"
$C reload "$META" >/dev/null
$C eval "$startRun"'
for (const id of ["comet","thunder","fireflies"]) for (let i=0;i<3;i++) game.learn(id);
game.startWave(20); await waitFor(() => boss() && game.phase === "fighting", 60000);
game.setTier(3); ff(1); game.killAll(); ff(0.3);
for (let i = 0; i < 300 && game.phase !== "travel"; i++) { game.killAll(); ff(0.1); if (["choosing","ultimate","skill","chest"].includes(game.phase)) { document.querySelector(".card")?.click(); __pilot.key("Space"); } }
return game.phase'
# the fall into the Underworld (Bee-zebub himself is the cold open, 00)
$C record "{\"dir\":\"$F/10\",\"frames\":103}"
