K=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
C="node $K/c.mjs"
F=${WORK:-$K/work}/frames
META=$(cat $K/meta-vet.json)
metaClass() { python3 -c "import json,sys;d=json.loads(sys.argv[1]);d['meta']['frogClass']=sys.argv[2];print(json.dumps(d))" "$META" "$1"; }
startRun='__pilot.key("Space"); await waitFor(() => game.phase === "fighting");'
# STILLS=1: clean 2560×1440 stills (no HUD or captions), every 6th frame, into stills/
if [ -n "$STILLS" ]; then
  F=${F%/frames}/stills
  C() {
    local ep=$1; shift
    if [ "$ep" = reload ]; then
      node "$K/c.mjs" reload "$(python3 -c "import json,sys;d=json.loads(sys.argv[1]);d['dsf']=2;print(json.dumps(d))" "$1")"
      node "$K/c.mjs" eval '__noUI(true); window.__cap = () => {}; window.__endCard = () => {}; window.__chapter = () => {}; window.__big = () => {}; window.__bars = () => {}; document.head.insertAdjacentHTML("beforeend", "<style>.callout,.boss-intro .boss-card,.banner,.wave-banner{visibility:hidden!important}</style>"); return 1' >/dev/null
    elif [ "$ep" = record ]; then
      node "$K/c.mjs" record "$(python3 -c "import json,sys;d=json.loads(sys.argv[1]);d['every']=6;d['start']=d.get('start',0)//6;print(json.dumps(d))" "$1")"
    else
      node "$K/c.mjs" $ep "$@"
    fi
  }
  C=C
fi
# NOCAP=1: the same footage without trailer captions (loops for the feature page), into work/web/frames/
if [ -n "$NOCAP" ] && [ -z "$STILLS" ]; then
  F=${WORK:-$K/work/web}/frames
  C() {
    local ep=$1; shift
    node "$K/c.mjs" $ep "$@"
    [ "$ep" = reload ] && node "$K/c.mjs" eval 'window.__cap = () => {}; window.__endCard = () => {}; window.__chapter = () => {}; window.__big = () => {}; window.__bars = () => {}; return 1' >/dev/null
    # NOHUD=1 as well: no HUD, callouts or banners either (the page's hero loop)
    [ "$ep" = reload ] && [ -n "$NOHUD" ] && node "$K/c.mjs" eval '__noUI(true); document.head.insertAdjacentHTML("beforeend", "<style>.callout,.wave-banner,.banner,.boss-intro .boss-card,.damage-number,.dmg{visibility:hidden!important}</style>"); return 1' >/dev/null
  }
  C=C
fi
