. "$(dirname "$0")/common.sh"; N=${N:-236}
# The Wardrobe: Tode tries on a crown, a mantle, a breastplate and an ember aura, then powers up to his best form.
PLAIN=$(python3 -c "import json,sys;d=json.loads(sys.argv[1]);d['meta']['profile']['outfit']={};print(json.dumps(d))" "$META")
$C reload "$PLAIN" >/dev/null
$C eval 'document.head.insertAdjacentHTML("beforeend", "<style>.menu.garden-walk h2,.menu.garden-walk p.sub,.menu.garden-walk .garden-tool{display:none!important}</style>");
game.action("wardrobe"); await wait(2500); __pilot.on = false; game.action("wardrobe-slot", { slot: "head" }); await wait(600); return 1' >/dev/null
$C record "{\"dir\":\"$F/12\",\"frames\":$N,\"each\":\"const A = (a, d) => game.action(a, d); if(n===4) __cap('Dress up your frog', '54 things to wear, all earned'); if(n===12) A('wear', {id:'crown'}); if(n===34) A('wardrobe-slot', {slot:'back'}); if(n===42) A('wear', {id:'royalcape'}); if(n===64) A('wardrobe-slot', {slot:'body'}); if(n===72) A('wear', {id:'goldplate'}); if(n===94) A('wardrobe-slot', {slot:'aura'}); if(n===102) A('wear', {id:'embers'}); if(n===126) { __cap(null); A('garden-wardrobe'); __noUI(true); } if(n===134) A('emote', {id:'power'});\"}"
