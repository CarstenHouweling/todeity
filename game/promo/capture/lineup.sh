#!/bin/bash
# The seven frogs in their victory pose with a transparent background (work/banner/lineup.png), from the dev-only
# /classes.html: rendered once on black and once on white, and the difference gives the alpha.
K=$(cd "$(dirname "$0")" && pwd); W=${WORK:-$K/work}; B=$W/banner; mkdir -p $B; C="node $K/c.mjs"
$C reload '{"raw":true,"query":"classes.html","dsf":2}' >/dev/null
$C eval '
document.head.insertAdjacentHTML("beforeend","<style>body > *:not(canvas){display:none!important}</style>");
const scene = preview.frogs[0].frog.root.parent;
const keep = new Set(preview.frogs.map(f => f.frog.root));
scene.children.forEach(c => { if (c.isMesh && !keep.has(c)) c.visible = false; });
window.__bg = (hex) => { scene.background.set(hex); scene.fog.color.set(hex); };
__vt.auto = false; preview.setCamera("front"); __bg("#000000"); preview.pose("victory", 0.55); return 1' >/dev/null
$C shot "{\"path\":\"$B/lineup-black.png\"}" >/dev/null
$C eval '__bg("#ffffff"); preview.pose("victory", 0.55); return 1' >/dev/null
$C shot "{\"path\":\"$B/lineup-white.png\"}" >/dev/null
${PYTHON:-python3} - "$B" <<'PY'
import sys
from PIL import Image
import numpy as np
d = sys.argv[1]
b = np.asarray(Image.open(f'{d}/lineup-black.png').convert('RGB')).astype(np.float32)
w = np.asarray(Image.open(f'{d}/lineup-white.png').convert('RGB')).astype(np.float32)
a = 1 - np.clip((w - b).mean(axis=2) / 255, 0, 1)
a[a < 0.02] = 0
rgb = np.where(a[..., None] > 0, b / np.maximum(a[..., None], 1e-3), 0)
im = Image.fromarray(np.dstack([np.clip(rgb, 0, 255), a * 255]).astype(np.uint8), 'RGBA')
im.crop(im.getbbox()).save(f'{d}/lineup.png')
PY
echo $B/lineup.png
