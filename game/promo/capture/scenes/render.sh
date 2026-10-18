#!/bin/bash
cd "$(dirname "$0")"
for s in ${@:-00 01 02 03 04 05 06 07 08 09 10 11 12 12b 13}; do
  f=$(ls $s-*.sh); W=${WORK:-$(cd .. && pwd)/work}; [ -z "$STILLS" ] && rm -rf $W/frames/$s
  echo "== $f $(date +%T)"; bash $f 2>&1 | grep -v '^ *"ok\|^{\|^}'
done
echo DONE
