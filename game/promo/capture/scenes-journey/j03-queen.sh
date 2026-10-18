. "$(dirname "$0")/common.sh"; N=109
# The first boss makes her entrance.
$C reload "$META" >/dev/null
$C eval "$cine$startRun"'
for (const id of ["comet","thunder"]) for (let i=0;i<2;i++) game.learn(id);
game.startWave(4); await waitFor(() => game.phase === "fighting"); game.skipSpawns(); game.killAll(); ff(0.2);
document.head.insertAdjacentHTML("beforeend", "<style>.callout,.wave-banner,.banner{visibility:hidden!important}</style>");
game.startWave(5); for (let i = 0; i < 600 && game.phase !== "bossIntro"; i++) ff(1/30); return game.phase'
$C record "{\"dir\":\"$F/j03\",\"frames\":$N}"
