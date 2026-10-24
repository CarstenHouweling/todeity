import * as THREE from 'three';

/**
 * Sculpting with signed distance fields: soft shapes melted into one seamless surface, the way clay is modelled,
 * instead of primitives stuck through each other. A field is sampled on a grid and meshed with surface nets (one
 * vertex per grid cell the surface passes through, quads across the edges it crosses), with normals from the field's
 * gradient, so it shades smoothly at a modest triangle count. Built once per model and cached by the caller.
 *
 *   sculpt([
 *     { ellipsoid: [x, y, z], radii: [rx, ry, rz], color: '#2a1c14' },
 *     { capsule: [[x, y, z], [x, y, z]], radius: r, color: '#ffc21a', blend: 2 },
 *   ], { cell: 0.6, paint: (p, color) => …, carve: (p, d) => d })
 *
 * `blend` is how far a shape melts into the ones before it (smooth minimum), `cell` the grid spacing in model units
 * (smaller: finer, more triangles), `paint` may recolour a point (stripes), `carve` may change the distance (grooves),
 * `glow` (x, y, z) → 0–1 marks points that shine (a `glow` attribute, see BeeModels' glowShader: lava cracks, seams).
 * Returns a non-indexed BufferGeometry with position, normal and color, like BeeModels' `piece`.
 */

const length3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);

// Shapes are packed into one flat array, STRIDE numbers each (the field is sampled tens of thousands of times, and
// shape objects of different kinds made every lookup slow): kind (0 ellipsoid, 1 capsule), centre or end a, radii or
// end b, capsule radius, blend, then the shape's box (centre, half size).
const STRIDE = 15;

function pack(shapes) {
  const flat = new Float64Array(shapes.length * STRIDE);
  shapes.forEach((shape, s) => {
    const o = s * STRIDE;
    const capsule = Boolean(shape.capsule);
    const [a, b] = capsule ? shape.capsule : [shape.ellipsoid, shape.radii];
    const r = capsule ? shape.radius : 0;
    const center = capsule ? a.map((v, i) => (v + b[i]) / 2) : a;
    const extent = capsule ? a.map((v, i) => Math.abs(v - b[i]) / 2 + r) : b;
    flat.set([capsule ? 1 : 0, ...a, ...b, r, shape.blend ?? 0, ...center, ...extent], o);
  });
  return flat;
}

function distance(f, o, x, y, z) {
  if (f[o] === 0) {
    const px = x - f[o + 1];
    const py = y - f[o + 2];
    const pz = z - f[o + 3];
    const rx = f[o + 4];
    const ry = f[o + 5];
    const rz = f[o + 6];
    const k0 = length3(px / rx, py / ry, pz / rz);
    const k1 = length3(px / (rx * rx), py / (ry * ry), pz / (rz * rz));
    return k1 > 1e-6 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
  }
  const pax = x - f[o + 1];
  const pay = y - f[o + 2];
  const paz = z - f[o + 3];
  const bax = f[o + 4] - f[o + 1];
  const bay = f[o + 5] - f[o + 2];
  const baz = f[o + 6] - f[o + 3];
  const h = Math.min(1, Math.max(0, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
  return length3(pax - bax * h, pay - bay * h, paz - baz * h) - f[o + 7];
}

/** How far a point is from a shape's box: never more than from the shape itself. */
function boxDistance(f, o, x, y, z) {
  const dx = Math.max(0, Math.abs(x - f[o + 9]) - f[o + 12]);
  const dy = Math.max(0, Math.abs(y - f[o + 10]) - f[o + 13]);
  const dz = Math.max(0, Math.abs(z - f[o + 11]) - f[o + 14]);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function smoothMin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export function sculpt(shapes, { cell = 0.6, paint = null, carve = null, glow = null } = {}) {
  const colors = shapes.map((s) => new THREE.Color(s.color ?? '#ffffff'));
  const f = pack(shapes);
  const shapeCount = shapes.length;
  // A point farther from a shape's box than the distance so far plus the shape's blend can't be changed by it, so most
  // shapes are skipped for most points.
  const field = (x, y, z) => {
    let d = Infinity;
    for (let o = 0; o < shapeCount * STRIDE; o += STRIDE) {
      if (boxDistance(f, o, x, y, z) > d + f[o + 8]) continue;
      d = smoothMin(d, distance(f, o, x, y, z), f[o + 8]);
    }
    return carve ? carve(x, y, z, d) : d;
  };

  // The grid: around every shape, with room for blending and a cell to spare.
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let o = 0; o < shapeCount * STRIDE; o += STRIDE) {
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], f[o + 9 + a] - f[o + 12 + a] - f[o + 8] - 2 * cell);
      max[a] = Math.max(max[a], f[o + 9 + a] + f[o + 12 + a] + f[o + 8] + 2 * cell);
    }
  }
  const [nx, ny, nz] = [0, 1, 2].map((a) => Math.ceil((max[a] - min[a]) / cell) + 1);
  const values = new Float32Array(nx * ny * nz);
  const at = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) values[at(i, j, k)] = field(min[0] + i * cell, min[1] + j * cell, min[2] + k * cell);
    }
  }

  // Surface nets: a vertex in each cell the surface crosses, at the average of its edge crossings.
  const cellIndex = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cellAt = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const vertices = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const v = new Float32Array(8);
  // (flat tables: destructuring the corners and edges for every cell made this loop slow)
  const cornerOffset = corners.map(([x, y, z]) => x + nx * (y + ny * z));
  const cornerAxes = new Float32Array(corners.flat());
  const edgeEnds = new Int8Array(edges.flat());
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const base = at(i, j, k);
        let inside = 0;
        for (let c = 0; c < 8; c++) {
          v[c] = values[base + cornerOffset[c]];
          if (v[c] < 0) inside++;
        }
        if (inside === 0 || inside === 8) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let count = 0;
        for (let e = 0; e < 24; e += 2) {
          const a = edgeEnds[e];
          const b = edgeEnds[e + 1];
          if (v[a] < 0 === v[b] < 0) continue;
          const t = v[a] / (v[a] - v[b]);
          sx += cornerAxes[a * 3] + (cornerAxes[b * 3] - cornerAxes[a * 3]) * t;
          sy += cornerAxes[a * 3 + 1] + (cornerAxes[b * 3 + 1] - cornerAxes[a * 3 + 1]) * t;
          sz += cornerAxes[a * 3 + 2] + (cornerAxes[b * 3 + 2] - cornerAxes[a * 3 + 2]) * t;
          count++;
        }
        cellIndex[cellAt(i, j, k)] = vertices.length / 3;
        vertices.push(min[0] + (i + sx / count) * cell, min[1] + (j + sy / count) * cell, min[2] + (k + sz / count) * cell);
      }
    }
  }

  // Normals from the gradient, colours from the nearest shapes (softly mixed where they melt together).
  const count = vertices.length / 3;
  const normals = new Float32Array(count * 3);
  const vertexColors = new Float32Array(count * 3);
  const vertexGlow = glow ? new Float32Array(count) : null;
  const e = cell * 0.5;
  const ds = new Float64Array(shapeCount);
  const color = new THREE.Color();
  for (let n = 0; n < count; n++) {
    const [x, y, z] = [vertices[n * 3], vertices[n * 3 + 1], vertices[n * 3 + 2]];
    const gx = field(x + e, y, z) - field(x - e, y, z);
    const gy = field(x, y + e, z) - field(x, y - e, z);
    const gz = field(x, y, z + e) - field(x, y, z - e);
    const g = length3(gx, gy, gz) || 1;
    normals[n * 3] = gx / g;
    normals[n * 3 + 1] = gy / g;
    normals[n * 3 + 2] = gz / g;
    // Shapes whose box is far from the point weigh nothing (e^-12 at most).
    let nearest = Infinity;
    for (let o = 0, s = 0; s < shapeCount; o += STRIDE, s++) {
      ds[s] = boxDistance(f, o, x, y, z) > 4 + f[o + 8] ? Infinity : distance(f, o, x, y, z);
      nearest = Math.min(nearest, ds[s]);
    }
    let total = 0;
    let r = 0;
    let gg = 0;
    let b = 0;
    for (let o = 0, s = 0; s < shapeCount; o += STRIDE, s++) {
      if (ds[s] === Infinity) continue;
      const w = Math.exp(-(ds[s] - nearest) / Math.max(0.3, f[o + 8] * 0.35));
      total += w;
      r += colors[s].r * w;
      gg += colors[s].g * w;
      b += colors[s].b * w;
    }
    color.setRGB(r / total, gg / total, b / total);
    if (paint) paint(x, y, z, color);
    color.toArray(vertexColors, n * 3);
    if (glow) vertexGlow[n] = glow(x, y, z);
  }

  // Quads across every grid edge the surface crosses, between the four cells around it.
  const index = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) index.push(a, c, b, a, d, c);
    else index.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = values[at(i, j, k)] < 0;
        if (a === values[at(i + 1, j, k)] < 0) continue;
        quad(cellIndex[cellAt(i, j - 1, k - 1)], cellIndex[cellAt(i, j, k - 1)], cellIndex[cellAt(i, j, k)], cellIndex[cellAt(i, j - 1, k)], !a);
      }
    }
  }
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const a = values[at(i, j, k)] < 0;
        if (a === values[at(i, j + 1, k)] < 0) continue;
        quad(cellIndex[cellAt(i - 1, j, k - 1)], cellIndex[cellAt(i - 1, j, k)], cellIndex[cellAt(i, j, k)], cellIndex[cellAt(i, j, k - 1)], !a);
      }
    }
  }
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const a = values[at(i, j, k)] < 0;
        if (a === values[at(i, j, k + 1)] < 0) continue;
        quad(cellIndex[cellAt(i - 1, j - 1, k)], cellIndex[cellAt(i, j - 1, k)], cellIndex[cellAt(i, j, k)], cellIndex[cellAt(i - 1, j, k)], !a);
      }
    }
  }

  // Each triangle faces the way the field points (outwards), whatever the winding above came out as.
  const tri = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const position = new Float32Array(index.length * 3);
  const normal = new Float32Array(index.length * 3);
  const colorOut = new Float32Array(index.length * 3);
  const glowOut = glow ? new Float32Array(index.length) : null;
  for (let t = 0; t < index.length; t += 3) {
    let [a, b, c] = [index[t], index[t + 1], index[t + 2]];
    ab.set(vertices[b * 3] - vertices[a * 3], vertices[b * 3 + 1] - vertices[a * 3 + 1], vertices[b * 3 + 2] - vertices[a * 3 + 2]);
    ac.set(vertices[c * 3] - vertices[a * 3], vertices[c * 3 + 1] - vertices[a * 3 + 1], vertices[c * 3 + 2] - vertices[a * 3 + 2]);
    tri.crossVectors(ab, ac);
    const outward = tri.x * (normals[a * 3] + normals[b * 3] + normals[c * 3]) + tri.y * (normals[a * 3 + 1] + normals[b * 3 + 1] + normals[c * 3 + 1]) + tri.z * (normals[a * 3 + 2] + normals[b * 3 + 2] + normals[c * 3 + 2]);
    if (outward < 0) [b, c] = [c, b];
    // (copied by hand: a slice or subarray per corner made this loop most of a sculpt's time)
    for (let corner = 0; corner < 3; corner++) {
      const vi = corner === 0 ? a : corner === 1 ? b : c;
      const o = (t + corner) * 3;
      for (let k = 0; k < 3; k++) {
        position[o + k] = vertices[vi * 3 + k];
        normal[o + k] = normals[vi * 3 + k];
        colorOut[o + k] = vertexColors[vi * 3 + k];
      }
      if (glow) glowOut[t + corner] = vertexGlow[vi];
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colorOut, 3));
  if (glow) geometry.setAttribute('glow', new THREE.BufferAttribute(glowOut, 1));
  return geometry;
}
