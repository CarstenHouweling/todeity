. "$(dirname "$0")/common.sh"; N=163
# Chapter III: the leap into Sky Citadel and the swoop over it (the travel cut-scene), Tode one form further.
$C reload "$META" >/dev/null
$C eval "$cine$startRun"'
for (const id of ["comet","thunder","fireflies"]) for (let i=0;i<3;i++) game.learn(id);
document.head.insertAdjacentHTML("beforeend", "<style>.boss-intro,.callout,.wave-banner,.banner{visibility:hidden!important}</style>"); game.setArena("mountain"); await wait(300); game.setTier(2); game.startWave(11); return game.phase'
$C record "{\"dir\":\"$F/j05\",\"frames\":$N,\"each\":\"if(n===24) __chapter('III', 'Sky Citadel'); if(n===$N-16) __chapter();\"}"
