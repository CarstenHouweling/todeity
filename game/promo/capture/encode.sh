#!/bin/bash
# Encodes seq/ + trailer.wav into the trailer MP4s and the GIFs in out/.
S=${WORK:-$(cd "$(dirname "$0")" && pwd)/work}
FF="${FFMPEG:-ffmpeg} -hide_banner -loglevel error -y"
# NAME: file prefix (todeity-trailer); TALL=1: a vertical video (1080×1920, 720×1280 and 540×960 for Discord).
NAME=${NAME:-todeity-trailer}
if [ -n "$TALL" ]; then BIG=1080p; MID=scale=720:1280; SMALL=scale=540:960; else BIG=1080p; MID=scale=1280:720; SMALL=scale=960:540; fi
cd $S && mkdir -p out
N=$(ls seq | wc -l); D=$(python3 -c "print($N/30)")
FO=$(python3 -c "print($N/30-1.6)")
AUD="-ss 0.1 -t $D -i trailer.wav"
AF="afade=t=in:d=0.3,afade=t=out:st=$FO:d=1.6"
VF="fade=t=in:d=0.4"
$FF -framerate 30 -i seq/%05d.jpg $AUD -vf "$VF,format=yuv420p" -af "$AF" -c:v libx264 -preset slow -crf 18 -profile:v high -movflags +faststart -c:a aac -b:a 192k -shortest out/$NAME-$BIG.mp4
$FF -framerate 30 -i seq/%05d.jpg $AUD -vf "$VF,$MID:flags=lanczos,format=yuv420p" -af "$AF" -c:v libx264 -preset slow -crf 21 -profile:v high -movflags +faststart -c:a aac -b:a 160k -shortest out/$NAME-720p.mp4
for p in 1 2; do
  if [ $p = 1 ]; then $FF -framerate 30 -i seq/%05d.jpg -vf "$VF,$SMALL:flags=lanczos,format=yuv420p" -c:v libx264 -preset slow -b:v 1040k -pass 1 -passlogfile out/pass -an -f mp4 /dev/null;
  else $FF -framerate 30 -i seq/%05d.jpg $AUD -vf "$VF,$SMALL:flags=lanczos,format=yuv420p" -af "$AF" -c:v libx264 -preset slow -b:v 1040k -pass 2 -passlogfile out/pass -movflags +faststart -c:a aac -b:a 96k -shortest out/$NAME-discord.mp4; fi
done
rm -f out/pass*
ls -la out
