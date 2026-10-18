#!/bin/bash
# Clean 2560×1440 close-ups of Tode in a divine form mid-fight (work/banner/form-T/), for the banners: TIER=2 golden.
K=$(cd "$(dirname "$0")" && pwd); W=${WORK:-$K/work}; B=$W/banner; mkdir -p $B; C="node $K/c.mjs"; T=${TIER:-2}
M=$(python3 -c "import json,sys;d=json.load(open(sys.argv[1]));d['dsf']=2;print(json.dumps(d))" "$K/meta-vet.json")
$C reload "$M" >/dev/null
$C eval '__noUI(true); window.__cap = () => {}; document.head.insertAdjacentHTML("beforeend", "<style>.callout,.banner,.wave-banner{visibility:hidden!important}</style>");
__pilot.key("Space"); await waitFor(() => game.phase === "fighting");
game.startWave(2); await waitFor(() => game.phase === "fighting"); game.setWeather("noon", "clear");
for (const id of ["comet","thunder"]) for (let i=0;i<2;i++) game.learn(id);
game.setTier('$T'); game.cameraOffset.multiplyScalar('${ZOOM:-0.5}'); __pilot.kite = 0.2;
const P = game.player.position; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; game.spawn("drone", P.x + Math.cos(a) * 200, P.y + Math.sin(a) * 200); }
ff(1.5); return 1' >/dev/null
rm -rf $B/form-$T; $C record "{\"dir\":\"$B/form-$T\",\"frames\":60,\"every\":6}" >/dev/null
ls $B/form-$T | wc -l
