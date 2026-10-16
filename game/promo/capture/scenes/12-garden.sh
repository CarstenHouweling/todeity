. "$(dirname "$0")/common.sh"; N=157
$C reload "$META" >/dev/null
$C eval 'document.querySelector("[data-action=garden]").click(); await wait(1500); __pilot.on = false; __noUI(true); return 1' >/dev/null
$C record "{\"dir\":\"$F/12\",\"frames\":$N,\"each\":\"const k = Math.floor(n / 35) % 4; __pilot.setKey('KeyW', k === 0); __pilot.setKey('KeyD', k === 1); __pilot.setKey('KeyS', k === 2); __pilot.setKey('KeyA', k === 3); if (n % 22 === 5) __pilot.key('Space'); if(n===6) __cap('Build your garden', 'Visit friends · co-op for up to 4'); if(n===$N-10) __cap(null);\"}"
