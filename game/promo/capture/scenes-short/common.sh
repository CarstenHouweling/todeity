# Trailer C, the vertical short: 540×960 at 2× (1080×1920 frames) into work/short/, harness port 9332 by default.
export HARNESS_PORT=${HARNESS_PORT:-9332}
export WORK=${WORK:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/work/short}
. "$(dirname "${BASH_SOURCE[0]}")/../scenes/common.sh"
tall() { python3 -c "import json,sys;d=json.loads(sys.argv[1]);d.update(width=540,height=960,dsf=2);d['meta'].update(json.loads(sys.argv[2]) if len(sys.argv)>2 else {});print(json.dumps(d))" "$META" "$@"; }
TALL=$(tall)
# No callouts or wave banners: the big hook text does the talking.
quiet='document.head.insertAdjacentHTML("beforeend", "<style>.callout,.wave-banner,.banner{visibility:hidden!important}</style>");'
# Garden helper: walk my frog towards a point, steering on screen (the walking camera turns with him).
walkTo='window.__walkTo = (x, y) => { const me = game.hub.player.group.position; const s = me.clone().project(game.camera), t = me.clone().set(x, y, me.z).project(game.camera); const dx = t.x - s.x, dy = (t.y - s.y) * innerHeight / innerWidth, l = Math.hypot(dx, dy) || 1, far = Math.hypot(x - me.x, y - me.y) > 6; __pilot.setKey("KeyD", far && dx / l > 0.38); __pilot.setKey("KeyA", far && dx / l < -0.38); __pilot.setKey("KeyW", far && dy / l > 0.38); __pilot.setKey("KeyS", far && dy / l < -0.38); };'
