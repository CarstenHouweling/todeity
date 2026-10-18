#!/bin/bash
# The feature page's media (game/public/media/, served at /media/): trailers, a hero loop, feature loops with posters,
# the frog lineup and arena stills. Needs the trailers in promo/, NOCAP=1 frames in work/web/ (scenes 00 03 04 07 08
# 12 12b), work/web-short/ (s09) and NOCAP=1 NOHUD=1 frames in work/hero/ (07 08 00 12), STILLS=1 journey stills (j02 j04 j05 j06 j08) and work/banner/lineup.png.
K=$(cd "$(dirname "$0")" && pwd); W=$K/work; O=$K/../../public/media; mkdir -p $O
FF="${FFMPEG:-ffmpeg} -hide_banner -loglevel error -y"
# loop <name> <width> <frames dir> [first last]...: a muted H.264 loop and a poster from its first frame
loop() {
  local name=$1 width=$2 dir=$3; shift 3
  local list=$W/loop-$name.txt; : > $list
  if [ $# -eq 0 ]; then set -- 0 99999; fi
  while [ $# -gt 0 ]; do
    ls $dir/*.jpg | sed -n "$(($1 + 1)),$(($2 + 1))p" | sed "s/^/file '/; s/$/'\nduration 0.0333333/" >> $list; shift 2
  done
  $FF -f concat -safe 0 -i $list -vf "fps=30,scale=$width:-2:flags=lanczos,format=yuv420p" -c:v libx264 -preset slow -crf ${CRF:-29} -profile:v high -an -movflags +faststart $O/$name.mp4
  $FF -i $O/$name.mp4 -frames:v 1 -vf "scale=$width:-2" -q:v 4 $O/$name.jpg
  echo "$(du -k $O/$name.mp4 | cut -f1) KB  $name"
}
# Trailers: the Discord cuts (under 10 MB each), posters from a strong frame
cp $K/../todeity-trailer-discord.mp4 $O/trailer.mp4; $FF -ss 2.4 -i $O/trailer.mp4 -frames:v 1 -q:v 3 $O/trailer.jpg
cp $K/../todeity-journey-discord.mp4 $O/journey.mp4; $FF -ss 3 -i $O/journey.mp4 -frames:v 1 -q:v 3 $O/journey.jpg
cp $K/../todeity-short-discord.mp4 $O/short.mp4; $FF -ss 1 -i $O/short.mp4 -frames:v 1 -q:v 3 $O/short.jpg
# Hero (NOCAP=1 NOHUD=1 frames in work/hero/): Golden Tode, the beam, Bee-zebub's fall, a garden Power Up
CRF=30 loop hero 1280 $W/hero/frames/07 20 130 && mv $O/hero.mp4 $W/hero-a.mp4
CRF=30 loop hero 1280 $W/hero/frames/08 6 90 && mv $O/hero.mp4 $W/hero-b.mp4
CRF=30 loop hero 1280 $W/hero/frames/00 0 40 && mv $O/hero.mp4 $W/hero-c.mp4
CRF=30 loop hero 1280 $W/hero/frames/12 135 228 && mv $O/hero.mp4 $W/hero-d.mp4
printf "file '%s'\n" $W/hero-a.mp4 $W/hero-b.mp4 $W/hero-c.mp4 $W/hero-d.mp4 > $W/hero.txt
$FF -f concat -safe 0 -i $W/hero.txt -c copy -movflags +faststart $O/hero.mp4
$FF -ss 1.2 -i $O/hero.mp4 -frames:v 1 -q:v 4 $O/hero.jpg
echo "$(du -k $O/hero.mp4 | cut -f1) KB  hero"
loop loop-bullets 854 $W/web/frames/03
loop loop-picks 854 $W/web/frames/04 0 70 109 175
loop loop-ascend 854 $W/web/frames/07
loop loop-beam 854 $W/web/frames/08
loop loop-trueform 854 $W/web/frames/00
loop loop-wardrobe 854 $W/web/frames/12
loop loop-garden 854 $W/web/frames/12b
loop loop-cannon 480 $W/web-short/frames/s09
# Stills
python3 - "$W" "$O" <<'PY'
import sys
from PIL import Image
w, o = sys.argv[1:]
im = Image.open(f'{w}/banner/lineup.png'); im = im.resize((1400, round(1400 * im.height / im.width)), Image.LANCZOS); im.save(f'{o}/frogs.png', optimize=True)
picks = {'garden': ('j02', 12), 'mountain': ('j04', 12), 'citadel': ('j05', 13), 'tournament': ('j06', 13), 'underworld': ('j08', 16)}
for name, (scene, n) in picks.items():
    s = Image.open(f'{w}/journey/stills/{scene}/{n:04d}.jpg')
    h = s.height; tw = round(h * 3 / 4) + 200  # a little wider than the 3:4 card, centred
    x = (s.width - tw) // 2
    s.crop((x, 0, x + tw, h)).resize((round(tw * 900 / h), 900), Image.LANCZOS).save(f'{o}/arena-{name}.jpg', quality=80)
PY
du -sh $O; ls $O
