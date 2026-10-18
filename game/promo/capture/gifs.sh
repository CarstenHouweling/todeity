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
# Frame numbers in seq/ (assemble.py prints where each scene starts): 00 0, 01 103, 02 260, 03 369, 04 478, 05 587,
# 06 696, 07 805, 08 1011, 09 1114, 10 1217, 11 1320, 12 1422, 12b 1658, 13 1815.
gif todeity 480 12 192 4\\,50 290\\,334 400\\,444 850\\,899 1040\\,1084 1140\\,1184 1556\\,1610 1700\\,1744
gif todeity-trueform 480 15 160 0\\,102
gif todeity-chest 480 15 160 696\\,804
gif todeity-ascension 480 15 160 805\\,910
gif todeity-bosses 480 15 160 1015\\,1075 1340\\,1421
gif todeity-wardrobe 480 15 160 1426\\,1650
gif todeity-garden 480 15 160 1658\\,1800
