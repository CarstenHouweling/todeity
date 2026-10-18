. "$(dirname "$0")/common.sh"; N=109
# Rapid-fire Wardrobe: devil horns, infernal wings, sparks, then the crown, mantle and embers he keeps on.
$C reload "$(tall '{"profile":{"name":"Tode","tag":"0420","color":"#ffd76a","outfit":{}}}')" >/dev/null
$C eval "$quiet"'document.head.insertAdjacentHTML("beforeend", "<style>.menu.garden-walk h2,.menu.garden-walk p.sub,.menu.garden-walk .garden-tool{display:none!important}</style>");
game.action("wardrobe"); await wait(2500); __pilot.on = false; game.garden.goal.distance = 105; await wait(2000); return 1' >/dev/null
$C record "{\"dir\":\"$F/s08\",\"frames\":$N,\"each\":\"const W = (id) => game.action('wear', {id}); if(n===1) __big('Then <em>dress up</em>'); if(n===6) W('horns'); if(n===22) W('batwings'); if(n===38) W('sparks'); if(n===54) W('crown'); if(n===70) W('royalcape'); if(n===86) W('embers');\"}"
