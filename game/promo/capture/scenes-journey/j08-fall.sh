. "$(dirname "$0")/common.sh"; N=103
# Chapter V: the Empress falls, the ground gives way, and Tode drops into the Underworld.
$C reload "$META" >/dev/null
$C eval "$cine$startRun"'
for (const id of ["comet","thunder","fireflies"]) for (let i=0;i<3;i++) game.learn(id);
game.startWave(20); await waitFor(() => boss() && game.phase === "fighting", 60000);
document.head.insertAdjacentHTML("beforeend", "<style>.boss-intro{visibility:hidden!important}</style>"); game.setTier(4); ff(1); game.killAll(); ff(0.3);
for (let i = 0; i < 300 && game.phase !== "travel"; i++) { game.killAll(); ff(0.1); if (["choosing","ultimate","skill","chest"].includes(game.phase)) { document.querySelector(".card")?.click(); __pilot.key("Space"); } }
return game.phase'
$C record "{\"dir\":\"$F/j08\",\"frames\":$N,\"each\":\"if(n===50) __chapter('V', 'The Underworld');\"}"
