#!/bin/bash
# A clean 2560×1440 close-up of Tode in his garden in a full outfit (work/banner/dressed-N.jpg), for the banners.
# OUTFIT='{"head":"crown",...}' and EMOTE (an emote id) change the look; DIST is the camera distance.
K=$(cd "$(dirname "$0")" && pwd); W=${WORK:-$K/work}; B=$W/banner; mkdir -p $B; C="node $K/c.mjs"
OUTFIT=${OUTFIT:-'{"head":"crown","back":"royalcape","body":"goldplate","aura":"embers"}'}
M=$(python3 -c "import json,sys;d=json.load(open(sys.argv[1]));d['meta']['profile']['outfit']=json.loads(sys.argv[2]);d['dsf']=2;print(json.dumps(d))" "$K/meta-vet.json" "$OUTFIT")
$C reload "$M" >/dev/null
$C eval "const DIST = ${DIST:-75}, PITCH = ${PITCH:-0.32}, EMOTE = '${EMOTE:-wave}';"'
document.querySelector("[data-action=garden]").click(); await wait(2500); __pilot.on = false; __noUI(true);
game.garden.goal.distance = DIST; game.garden.goal.pitch = PITCH; await wait(2500); if (EMOTE) game.action("emote", { id: EMOTE }); return 1' >/dev/null
$C record "{\"dir\":\"$B/dressed\",\"frames\":60,\"every\":6}" >/dev/null
ls $B/dressed
