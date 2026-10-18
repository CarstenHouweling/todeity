. "$(dirname "$0")/common.sh"; N=109
# The teapot cannon, turned towards the pond for the shot: Tode hops in and splashes down in the water.
$C reload "$(tall '{"profile":{"name":"Tode","tag":"0420","color":"#ffd76a","outfit":{"head":"crown","back":"royalcape","aura":"embers"}}}')" >/dev/null
$C eval "$quiet$walkTo"'
document.head.insertAdjacentHTML("beforeend", "<style>.menu.garden-walk{display:none!important}</style>");
document.querySelector("[data-action=garden]").click(); await wait(2500); __pilot.on = false;
window.CANNON_D = 405; const POND = { x: 195, y: 175 }, a = Math.atan2(POND.y - 0, POND.x - 0);
const L = game.meta.decor?.find?.((d) => d.id === "launcher") ?? null;
window.__cannon = { x: POND.x - Math.cos(a) * (window.CANNON_D ?? 250), y: POND.y - Math.sin(a) * (window.CANNON_D ?? 250), r: a };
if (L) { Object.assign(L, window.__cannon); game.syncGarden(); }
await wait(800); const it = game.hub.world.items().find((i) => i.id === "launcher");
const me = game.hub.player.group.position; me.set(it.x - Math.cos(it.r) * 70, it.y - Math.sin(it.r) * 70, me.z);
game.garden.goal.distance = 300; await wait(1500);
return [!!L, it && { x: Math.round(it.x), y: Math.round(it.y), r: it.r }]'
$C record "{\"dir\":\"$F/s09\",\"frames\":$N,\"each\":\"const it = game.hub.world.items().find((i) => i.id === 'launcher'); if (n < 30) __walkTo(it.x, it.y); else __pilot.release(); if(n===2) __big('Fire your frog<br>out of a <em>teapot</em>'); return n % 10 === 0 ? [Math.round(game.hub.player.group.position.x), Math.round(game.hub.player.group.position.y), Math.round(game.hub.z ?? 0)] : undefined;\"}"
