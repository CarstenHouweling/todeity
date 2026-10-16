. "$(dirname "$0")/common.sh"
$C reload "$META" >/dev/null
$C eval 'document.querySelector("[data-action=classes]").click(); await wait(300); return 1' >/dev/null
$C record "{\"dir\":\"$F/05\",\"frames\":40,\"each\":\"if(n===2) __cap('Seven frogs', 'Each with its own moves', 'tl');\"}"
$C reload "$(metaClass brawler)" >/dev/null
$C eval "$startRun"'
game.startWave(7); await waitFor(() => game.phase === "fighting", 40000); game.setTier(1); game.cameraOffset.multiplyScalar(0.7);
const P = game.player.position; for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; game.spawn("drone", P.x + Math.cos(a) * 200, P.y + Math.sin(a) * 200); }
ff(1.2); return game.arena'
$C record "{\"dir\":\"$F/05\",\"frames\":34,\"start\":40,\"each\":\"if(n===0) __cap('Bullfrog Brawler', 'Spinning throwing axes', 'tl');\"}"
$C reload "$(metaClass mage)" >/dev/null
$C eval "$startRun"'
game.startWave(12); await waitFor(() => game.phase === "fighting", 40000); game.setTier(2); game.cameraOffset.multiplyScalar(0.7);
const P = game.player.position; for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; game.spawn("drone", P.x + Math.cos(a) * 220, P.y + Math.sin(a) * 220); }
ff(1.2); return game.arena'
$C record "{\"dir\":\"$F/05\",\"frames\":35,\"start\":74,\"each\":\"if(n===0) __cap('Starleaf Mage', 'Homing fireballs', 'tl'); if(n===27) __cap(null);\"}"
