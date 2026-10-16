. "$(dirname "$0")/common.sh"; N=109
$C reload "$META" >/dev/null
$C eval "$startRun"'
for (const id of ["comet","thunder","glaive","orb","fireflies","tornado"]) for (let i=0;i<3;i++) game.learn(id);
game.startWave(5); await waitFor(() => boss() && game.phase === "fighting", 40000);
game.cameraOffset.multiplyScalar(0.8); ff(1);
for (let i=0;i<150 && game.phase !== "chest"; i++) { game.killAll(); ff(0.1); }
ff(0.8); return game.phase'
$C record "{\"dir\":\"$F/06\",\"frames\":$N,\"each\":\"if(n===2) __cap('A Royal Tea Chest', 'From every boss', 'tl'); if(n===$N-10) __cap(null);\"}"
