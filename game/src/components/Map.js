import * as THREE from 'three';

export const TILE_SIZE = 30;
export const MAP_TILES = 25;
export const MAP_HALF_SIZE = (TILE_SIZE * MAP_TILES) / 2;

const OUTER_SIZE = 6000;
const LAWN_TEXTURE_SIZE = 2048;
const LAWN_LIGHT = '#7cc75a';
const LAWN_DARK = '#70bb4f';
const WILD_GRASS = '#5f9f3f';

/** World (x, y) on the lawn → canvas pixel coordinates. */
function toCanvas(x, y) {
  const scale = LAWN_TEXTURE_SIZE / (MAP_HALF_SIZE * 2);
  return [(x + MAP_HALF_SIZE) * scale, (MAP_HALF_SIZE - y) * scale];
}

function speckle(ctx, size, count, colors, maxDot, random = Math.random) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(random() * colors.length)];
    const dot = 1 + random() * maxDot;
    ctx.fillRect(random() * size, random() * size, dot, dot);
  }
}

function createLawnTexture(path) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = LAWN_TEXTURE_SIZE;
  const ctx = canvas.getContext('2d');
  const tile = LAWN_TEXTURE_SIZE / MAP_TILES;

  // Subtle mowing pattern.
  for (let row = 0; row < MAP_TILES; row++) {
    for (let col = 0; col < MAP_TILES; col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? LAWN_LIGHT : LAWN_DARK;
      ctx.fillRect(col * tile, row * tile, tile + 1, tile + 1);
    }
  }
  speckle(ctx, LAWN_TEXTURE_SIZE, 40000, ['rgba(40,90,30,0.18)', 'rgba(200,240,150,0.16)'], 3);

  // Dirt path from Tode's door to the middle of the garden.
  if (path) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const drawPath = (width, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      path.forEach(([x, y], i) => (i ? ctx.lineTo(...toCanvas(x, y)) : ctx.moveTo(...toCanvas(x, y))));
      ctx.stroke();
    };
    drawPath(78, 'rgba(120,150,70,0.6)');
    drawPath(62, '#c8a978');
    drawPath(40, '#d6b98a');
  }

  // Darker, wilder grass towards the fence.
  const edge = ctx.createRadialGradient(
    LAWN_TEXTURE_SIZE / 2, LAWN_TEXTURE_SIZE / 2, LAWN_TEXTURE_SIZE * 0.42,
    LAWN_TEXTURE_SIZE / 2, LAWN_TEXTURE_SIZE / 2, LAWN_TEXTURE_SIZE * 0.72
  );
  edge.addColorStop(0, 'rgba(40,80,20,0)');
  edge.addColorStop(1, 'rgba(40,80,20,0.35)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, LAWN_TEXTURE_SIZE, LAWN_TEXTURE_SIZE);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function createWildGrassTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = WILD_GRASS;
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, 3000, ['rgba(30,70,20,0.25)', 'rgba(170,220,110,0.18)'], 3);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(OUTER_SIZE / 120, OUTER_SIZE / 120);
  texture.anisotropy = 8;
  return texture;
}

/** The garden lawn plus the wild meadow that stretches to the horizon. `path` is a list of [x, y] points. */
export function createMap({ path } = {}) {
  const map = new THREE.Group();

  const lawn = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_HALF_SIZE * 2, MAP_HALF_SIZE * 2),
    new THREE.MeshLambertMaterial({ map: createLawnTexture(path) })
  );
  lawn.receiveShadow = true;
  map.add(lawn);

  const meadow = new THREE.Mesh(
    new THREE.PlaneGeometry(OUTER_SIZE, OUTER_SIZE),
    new THREE.MeshLambertMaterial({ map: createWildGrassTexture() })
  );
  meadow.position.z = -0.5;
  meadow.receiveShadow = true;
  map.add(meadow);

  return map;
}

/** True if a character of the given radius at (x, y) stays inside the map. */
export function isInsideMap(position, radius = 0) {
  const limit = MAP_HALF_SIZE - radius;
  return Math.abs(position.x) <= limit && Math.abs(position.y) <= limit;
}
