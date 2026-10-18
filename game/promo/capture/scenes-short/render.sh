#!/bin/bash
cd "$(dirname "$0")"
for s in ${@:-s01 s02 s03 s04 s05 s06 s07 s08 s09 s10}; do
  f=$(ls $s-*.sh); W=${WORK:-$(cd .. && pwd)/work/short}; [ -z "$STILLS" ] && rm -rf $W/frames/$s
  echo "== $f $(date +%T)"; bash $f 2>&1 | grep -v '^ *"ok\|^{\|^}\|"ms"'
done
echo DONE
