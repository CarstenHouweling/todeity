#!/bin/bash
cd "$(dirname "$0")"
for s in ${@:-j01 j02 j03 j04 j05 j06 j07 j08 j09 j10 j11}; do
  f=$(ls $s-*.sh); W=${WORK:-$(cd .. && pwd)/work/journey}; [ -z "$STILLS" ] && rm -rf $W/frames/$s
  echo "== $f $(date +%T)"; bash $f 2>&1 | grep -v '^ *"ok\|^{\|^}\|"ms"'
done
echo DONE
