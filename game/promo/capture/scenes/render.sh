#!/bin/bash
cd "$(dirname "$0")"
for s in ${@:-01 02 03 04 05 06 07 08 09 10 12 13}; do
  f=$(ls $s-*.sh); W=${WORK:-$(cd .. && pwd)/work}; rm -rf $W/frames/$s $W/frames/${s}x
  [ $s = 10 ] && rm -rf $W/frames/11
  echo "== $f $(date +%T)"; bash $f 2>&1 | grep -v '^ *"ok\|^{\|^}'
done
echo DONE
