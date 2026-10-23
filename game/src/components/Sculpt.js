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
 * (smaller: finer, more triangles), `paint` may recolour a point (stripes), `carve` may change the distance (grooves).
 * Returns a non-indexed BufferGeometry with position, normal and color, like BeeModels' `piece`.
 */

const length3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);

function distance(shape, x, y, z) {
  if (shape.ellipsoid) {
    const [cx, cy, cz] = shape.ellipsoid;
    const [rx, ry, rz] = shape.radii;
    const px = x - cx;
    const py = y - cy;
    const pz = z - cz;
    const k0 = length3(px / rx, py / ry, pz / rz);
    const k1 = length3(px / (rx * rx), py / (ry * ry), pz / (rz * rz));
    return k1 > 1e-6 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
  }
  const [[ax, ay, az], [bx, by, bz]] = shape.capsule;
  const pax = x - ax;
  const pay = y - ay;
  const paz = z - az;
  const bax = bx - ax;
  const bay = by - ay;
  const baz = bz - az;
  const h = Math.min(1, Math.max(0, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
  return length3(pax - bax * h, pay - bay * h, paz - baz * h) - shape.radius;
}

function smoothMin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

function reach(shape) {
  if (shape.ellipsoid) return { center: shape.ellipsoid, extent: shape.radii };
  const [a, b] = shape.capsule;
  const r = shape.radius;
  return { center: a.map((v, i) => (v + b[i]) / 2), extent: a.map((v, i) => Math.abs(v - b[i]) / 2 + r) };
}

export function sculpt(shapes, { cell = 0.6, paint = null, carve = null } = {}) {
  const colors = shapes.map((s) => new THREE.Color(s.color ?? '#ffffff'));
  const field = (x, y, z) => {
    let d = Infinity;
    for (const shape of shapes) d = smoothMin(d, distance(shape, x, y, z), shape.blend ?? 0);
    return carve ? carve(x, y, z, d) : d;
  };

  // The grid: around every shape, with room for blending and a cell to spare.
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const shape of shapes) {
    const { center, extent } = reach(shape);
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], center[a] - extent[a] - (shape.blend ?? 0) - 2 * cell);
      max[a] = Math.max(max[a], center[a] + extent[a] + (shape.blend ?? 0) + 2 * cell);
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
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        let inside = 0;
        for (let c = 0; c < 8; c++) {
          v[c] = values[at(i + corners[c][0], j + corners[c][1], k + corners[c][2])];
          if (v[c] < 0) inside++;
        }
        if (inside === 0 || inside === 8) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let count = 0;
        for (const [a, b] of edges) {
          if (v[a] < 0 === v[b] < 0) continue;
          const t = v[a] / (v[a] - v[b]);
          sx += corners[a][0] + (corners[b][0] - corners[a][0]) * t;
          sy += corners[a][1] + (corners[b][1] - corners[a][1]) * t;
          sz += corners[a][2] + (corners[b][2] - corners[a][2]) * t;
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
  const e = cell * 0.5;
  const color = new THREE.Color();
  for (let n = 0; n < count; n++) {
    const [x, y, z] = [vertices[n * 3], vertices[n * 3 + 1], vertices[n * 3 + 2]];
    const gx = field(x + e, y, z) - field(x - e, y, z);
    const gy = field(x, y + e, z) - field(x, y - e, z);
    const gz = field(x, y, z + e) - field(x, y, z - e);
    const g = length3(gx, gy, gz) || 1;
    normals.set([gx / g, gy / g, gz / g], n * 3);
    const ds = shapes.map((shape) => distance(shape, x, y, z));
    const nearest = Math.min(...ds);
    let total = 0;
    let r = 0;
    let gg = 0;
    let b = 0;
    ds.forEach((d, s) => {
      const w = Math.exp(-(d - nearest) / Math.max(0.3, (shapes[s].blend ?? 0) * 0.35));
      total += w;
      r += colors[s].r * w;
      gg += colors[s].g * w;
      b += colors[s].b * w;
    });
    color.setRGB(r / total, gg / total, b / total);
    if (paint) paint(x, y, z, color);
    color.toArray(vertexColors, n * 3);
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
  for (let t = 0; t < index.length; t += 3) {
    let [a, b, c] = [index[t], index[t + 1], index[t + 2]];
    ab.set(vertices[b * 3] - vertices[a * 3], vertices[b * 3 + 1] - vertices[a * 3 + 1], vertices[b * 3 + 2] - vertices[a * 3 + 2]);
    ac.set(vertices[c * 3] - vertices[a * 3], vertices[c * 3 + 1] - vertices[a * 3 + 1], vertices[c * 3 + 2] - vertices[a * 3 + 2]);
    tri.crossVectors(ab, ac);
    const outward = tri.x * (normals[a * 3] + normals[b * 3] + normals[c * 3]) + tri.y * (normals[a * 3 + 1] + normals[b * 3 + 1] + normals[c * 3 + 1]) + tri.z * (normals[a * 3 + 2] + normals[b * 3 + 2] + normals[c * 3 + 2]);
    if (outward < 0) [b, c] = [c, b];
    [a, b, c].forEach((vi, corner) => {
      const o = (t + corner) * 3;
      position.set(vertices.slice(vi * 3, vi * 3 + 3), o);
      normal.set(normals.subarray(vi * 3, vi * 3 + 3), o);
      colorOut.set(vertexColors.subarray(vi * 3, vi * 3 + 3), o);
    });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colorOut, 3));
  return geometry;
}
