# Trailer B, "The Journey": frames go to work/journey/ (harness port 9331 by default, so it can run beside the others).
export HARNESS_PORT=${HARNESS_PORT:-9331}
export WORK=${WORK:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/work/journey}
. "$(dirname "${BASH_SOURCE[0]}")/../scenes/common.sh"
NIGHT=$(python3 -c "import json,sys;d=json.loads(sys.argv[1]);d['meta']['gardenNight']=True;print(json.dumps(d))" "$META")
# Letterbox bars and no toasts in every shot.
cine='__bars(true);'
