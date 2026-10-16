. "$(dirname "$0")/common.sh"; N=218
$C reload "$META" >/dev/null
$C eval "$startRun"'
for (const id of ["comet","frost","thunder","glaive"]) for (let i=0;i<3;i++) game.learn(id);
game.cameraOffset.multiplyScalar(0.85); ff(2.5); game.levelUp(); ff(0.05); return game.phase'
$C record "{\"dir\":\"$F/04\",\"frames\":$N,\"each\":\"if(n===6) __cap('24 skills that fuse', 'Level up · master · fuse', 'tl'); if(n===92) { __cap(null); document.querySelector('.card')?.click(); } if(n===112) __cap('Brews from talking tea spirits', 'Five Blends · Duos · Legendaries', 'tl'); if(n===$N-10) __cap(null);\"}"
