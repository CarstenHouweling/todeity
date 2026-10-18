. "$(dirname "$0")/common.sh"; N=${N:-157}
# Leaf Rush in the garden: the frog hops from leaf to leaf (steered on screen towards the nearest one).
DRESSED=$(python3 -c "import json,sys;d=json.loads(sys.argv[1]);d['meta']['profile']['outfit']={'head':'crown','back':'royalcape','aura':'embers'};print(json.dumps(d))" "$META")
$C reload "$DRESSED" >/dev/null
$C eval 'document.head.insertAdjacentHTML("beforeend", "<style>.menu.garden-walk h2,.menu.garden-walk p.sub,.menu.garden-walk .garden-tool{display:none!important} .menu.garden-walk{background:none!important;box-shadow:none!important;border-color:transparent!important;backdrop-filter:none!important}</style>");
document.querySelector("[data-action=garden]").click(); await wait(2500); __pilot.on = false; game.garden.goal.distance = 270;
window.__steer = () => {
  const hub = game.hub, me = hub.player.group.position, leaves = [...(hub.rush.round?.leaves.values() ?? [])];
  const near = leaves.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
  const keys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false };
  if (near) {
    const s = me.clone().project(game.camera), t = me.clone().set(near.x, near.y, me.z).project(game.camera);
    const dx = t.x - s.x, dy = t.y - s.y, l = Math.hypot(dx, dy) || 1;
    keys.KeyD = dx / l > 0.38; keys.KeyA = dx / l < -0.38; keys.KeyW = dy / l > 0.38; keys.KeyS = dy / l < -0.38;
  }
  for (const [k, on] of Object.entries(keys)) __pilot.setKey(k, on);
};
game.action("garden-rush"); ff(3.4); return game.hub.rush.round?.leaves.size'
$C record "{\"dir\":\"$F/12b\",\"frames\":$N,\"each\":\"__steer(); if (n % 26 === 13) __pilot.key('Space'); if(n===6) __cap('Play together in gardens', 'Leaf Rush · visits · co-op for up to 4'); if(n===$N-10) __cap(null);\"}"
