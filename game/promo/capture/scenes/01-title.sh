. "$(dirname "$0")/common.sh"; N=157
$C reload "$META" >/dev/null
$C eval '__noUI(true); __pilot.on = false; return 1' >/dev/null
$C record "{\"dir\":\"$F/01\",\"frames\":$N,\"each\":\"if(n===14) __cap('Tode just wanted his morning tea.', '', 'center'); if(n===$N-14) __cap(null);\"}"
