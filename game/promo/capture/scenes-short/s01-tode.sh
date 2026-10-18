. "$(dirname "$0")/common.sh"; N=109
# Hook: plain Tode up close in his garden, then he sips his tea.
$C reload "$TALL" >/dev/null
$C eval "$quiet"'document.querySelector("[data-action=garden]").click(); await wait(2500); __pilot.on = false; __noUI(true);
game.garden.goal.distance = 70; game.garden.goal.pitch = 0.3; await wait(2500); return 1' >/dev/null
$C record "{\"dir\":\"$F/s01\",\"frames\":$N,\"each\":\"if(n===1) __big('This is <em>Tode</em>'); if(n===48) game.action('emote', {id:'sip'}); if(n===55) __big('He just wanted<br>his <em>tea</em>');\"}"
