import * as THREE from 'three';

export const TILE_SIZE = 30;
export const SOLO_TILES = 25;
// The garden grows for co-op. These are live bindings: importers always see the current size.
export let MAP_TILES = SOLO_TILES;
export let MAP_HALF_SIZE = (TILE_SIZE * MAP_TILES) / 2;

/** Resizes the garden (an odd number of tiles keeps a tile centred on the origin). Rebuild the world after. */
export function setMapTiles(tiles) {
  MAP_TILES = tiles;
  MAP_HALF_SIZE = (TILE_SIZE * tiles) / 2;
}

const OUTER_SIZE = 6000;
const LAWN_TEXTURE_SIZE = 2048;

/**
 * Looks of the lawn as Tode's divinity grows:
 * the garden, a lusher garden in bloom, and finally gold-veined marble tiles
 * (a nod to the checkerboard of the original course game).
 */
const LAWN_STYLES = {
  garden: {
    light: '#7cc75a',
    dark: '#70bb4f',
    specks: ['rgba(40,90,30,0.18)', 'rgba(200,240,150,0.16)'],
    path: ['rgba(120,150,70,0.6)', '#c8a978', '#d6b98a'],
    edge: 'rgba(40,80,20,0.35)',
  },
  lush: {
    light: '#83d65c',
    dark: '#74c94f',
    specks: ['rgba(40,90,30,0.16)', 'rgba(220,255,160,0.2)', 'rgba(255,240,120,0.5)', 'rgba(255,190,220,0.45)'],
    path: ['rgba(140,170,70,0.6)', '#d7b882', '#e6cc9a'],
    edge: 'rgba(40,90,20,0.25)',
  },
  marble: {
    light: '#e6dfcf',
    dark: '#d4c6a8',
    specks: ['rgba(160,130,80,0.12)', 'rgba(255,255,255,0.4)'],
    path: ['rgba(212,167,44,0.5)', '#e8c25a', '#fff1b8'],
    edge: 'rgba(212,167,44,0.25)',
    veins: true,
  },
};

/** World (x, y) on the lawn → canvas pixel coordinates. */
function toCanvas(x, y) {
  const scale = LAWN_TEXTURE_SIZE / (MAP_HALF_SIZE * 2);
  return [(x + MAP_HALF_SIZE) * scale, (MAP_HALF_SIZE - y) * scale];
}

function speckle(ctx, size, count, colors, maxDot) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
    const dot = 1 + Math.random() * maxDot;
    ctx.fillRect(Math.random() * size, Math.random() * size, dot, dot);
  }
}

function canvasTexture(canvas, repeat) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  if (repeat) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat, repeat);
  }
  return texture;
}

function createLawnTexture(path, style) {
  const look = LAWN_STYLES[style];
  const size = LAWN_TEXTURE_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const tile = size / MAP_TILES;

  // Mowing pattern (or marble tiles).
  for (let row = 0; row < MAP_TILES; row++) {
    for (let col = 0; col < MAP_TILES; col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? look.light : look.dark;
      ctx.fillRect(col * tile, row * tile, tile + 1, tile + 1);
    }
  }
  speckle(ctx, size, 40000, look.specks, 3);

  // Gold veins running through the marble.
  if (look.veins) {
    ctx.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      ctx.strokeStyle = `rgba(212, 167, 44, ${0.25 + Math.random() * 0.45})`;
      ctx.lineWidth = 1 + Math.random() * 3;
      ctx.beginPath();
      let x = Math.random() * size;
      let y = Math.random() * size;
      ctx.moveTo(x, y);
      for (let j = 0; j < 6; j++) {
        x += (Math.random() - 0.5) * 220;
        y += (Math.random() - 0.5) * 220;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // Thin gold grout between the tiles.
    ctx.strokeStyle = 'rgba(212, 167, 44, 0.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= MAP_TILES; i++) {
      ctx.beginPath();
      ctx.moveTo(i * tile, 0);
      ctx.lineTo(i * tile, size);
      ctx.moveTo(0, i * tile);
      ctx.lineTo(size, i * tile);
      ctx.stroke();
    }
  }

  // The path from Tode's door to the middle of the garden.
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
    drawPath(78, look.path[0]);
    drawPath(62, look.path[1]);
    drawPath(40, look.path[2]);
  }

  // Shade toward the fence.
  const edge = ctx.createRadialGradient(size / 2, size / 2, size * 0.42, size / 2, size / 2, size * 0.72);
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(1, look.edge);
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, size, size);

  return canvasTexture(canvas);
}

function createWildGrassTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#5f9f3f';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, 3000, ['rgba(30,70,20,0.25)', 'rgba(170,220,110,0.18)'], 3);
  return canvasTexture(canvas, OUTER_SIZE / 120);
}

/** Soft, sunlit clouds for when the garden floats in the heavens. */
function createCloudTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#efe6ff';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 20 + Math.random() * 70;
    const tint = ['255,255,255', '255,236,248', '255,246,220'][i % 3];
    // Draw wrapped copies so the texture tiles seamlessly.
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        const gradient = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        gradient.addColorStop(0, `rgba(${tint},0.9)`);
        gradient.addColorStop(1, `rgba(${tint},0)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
      }
    }
  }
  return canvasTexture(canvas, OUTER_SIZE / 500);
}

/**
 * The garden lawn plus the meadow that stretches to the horizon. `path` is a list of [x, y] points.
 * `setStyle(lawnStyle, meadowStyle)` changes the look (textures are made once and cached).
 */
export function createMap({ path } = {}) {
  const map = new THREE.Group();
  const lawnTextures = {};
  const meadowTextures = {};

  const lawn = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_HALF_SIZE * 2, MAP_HALF_SIZE * 2),
    new THREE.MeshLambertMaterial()
  );
  lawn.receiveShadow = true;
  map.add(lawn);

  const meadow = new THREE.Mesh(new THREE.PlaneGeometry(OUTER_SIZE, OUTER_SIZE), new THREE.MeshLambertMaterial());
  meadow.position.z = -0.5;
  meadow.receiveShadow = true;
  map.add(meadow);

  map.setStyle = (lawnStyle = 'garden', meadowStyle = 'meadow') => {
    lawn.material.map = lawnTextures[lawnStyle] ??= createLawnTexture(path, lawnStyle);
    meadow.material.map = meadowTextures[meadowStyle] ??= meadowStyle === 'clouds' ? createCloudTexture() : createWildGrassTexture();
    // The sea of clouds lies far below the floating garden and is never in shadow.
    meadow.position.z = meadowStyle === 'clouds' ? -140 : -0.5;
    meadow.receiveShadow = meadowStyle !== 'clouds';
    lawn.material.needsUpdate = true;
    meadow.material.needsUpdate = true;
  };
  map.setStyle();

  return map;
}

/** True if a character of the given radius at (x, y) stays inside the map. */
export function isInsideMap(position, radius = 0) {
  const limit = MAP_HALF_SIZE - radius;
  return Math.abs(position.x) <= limit && Math.abs(position.y) <= limit;
}
