. "$(dirname "$0")/common.sh"; N=157
# The garden at night, quiet. A story line.
$C reload "$NIGHT" >/dev/null
$C eval "$cine"'__noUI(true); __pilot.on = false; return 1' >/dev/null
$C record "{\"dir\":\"$F/j01\",\"frames\":$N,\"each\":\"if(n===16) __chapter(null, 'It began with a cup of tea.'); if(n===$N-16) __chapter();\"}"
