#!/bin/bash
S=${WORK:-$(cd "$(dirname "$0")" && pwd)/work}
FF="${FFMPEG:-ffmpeg} -hide_banner -loglevel error -y"
cd $S
gif() { # name width fps colors ranges...
  local name=$1 w=$2 fps=$3 colors=$4; shift 4
  local sel=$(printf "between(n\\\\,%s)+" "$@"); sel=${sel%+}
  $FF -framerate 30 -i seq/%05d.jpg -vf "select='$sel',setpts=N/30/TB,fps=$fps,scale=$w:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=$colors:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle" -loop 0 out/$name.gif
  ls -la out/$name.gif | awk '{print $5, $9}'
}
gif todeity 480 12 192 175\\,219 300\\,344 760\\,810 840\\,899 1170\\,1214 1336\\,1379 1595\\,1650
gif todeity-chest 480 15 160 708\\,810
gif todeity-ascension 480 15 160 811\\,913
gif todeity-garden 480 15 160 1430\\,1580
gif todeity-bosses 480 15 160 1229\\,1240 1290\\,1400
