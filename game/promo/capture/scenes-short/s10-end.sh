. "$(dirname "$0")/common.sh"; N=109
$C reload "$(tall '{"gardenNight":true}')" >/dev/null
$C eval '__noUI(true); __pilot.on = false; return 1' >/dev/null
$C record "{\"dir\":\"$F/s10\",\"frames\":$N,\"each\":\"if(n===1) __endCardTall();\"}"
