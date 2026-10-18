. "$(dirname "$0")/common.sh"; N=157
$C reload "$NIGHT" >/dev/null
$C eval '__noUI(true); __pilot.on = false; return 1' >/dev/null
$C record "{\"dir\":\"$F/j11\",\"frames\":$N,\"each\":\"if(n===2) __endCard();\"}"
