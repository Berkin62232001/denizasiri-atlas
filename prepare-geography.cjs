const fs = require('node:fs');

const [source, destination] = process.argv.slice(2);
const topology = JSON.parse(fs.readFileSync(source, 'utf8'));
const [scaleX, scaleY] = topology.transform.scale;
const [translateX, translateY] = topology.transform.translate;
const units = 20;
const tolerance = .042;

// Equal Earth projection. Keep the same origin and scale as work/map.js.
function project(lon, lat) {
  const lambda = lon * Math.PI / 180;
  const phi = lat * Math.PI / 180;
  const theta = Math.asin(Math.sqrt(3) / 2 * Math.sin(phi));
  const t2 = theta * theta;
  const t6 = t2 * t2 * t2;
  const x = 2 * Math.sqrt(3) * lambda * Math.cos(theta)
    / (3 * (1.340264 - 0.243957 * t2 + t6 * (0.006123 + 0.017204 * t2)));
  const y = theta * (1.340264 - 0.081319 * t2 + t6 * (0.000893 + 0.003796 * t2));
  return [600 + x * 198.5, 340 - y * 198.5];
}

function distanceSquared(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = dx * dx + dy * dy;
  const fraction = length > 0
    ? Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / length))
    : 0;
  return (point[0] - start[0] - fraction * dx) ** 2 + (point[1] - start[1] - fraction * dy) ** 2;
}

function simplify(points) {
  const keep = new Uint8Array(points.length);
  const last = points.length - 1;
  keep[0] = 1;
  keep[last] = 1;
  const ranges = [[0, last]];
  while (ranges.length) {
    const [first, end] = ranges.pop();
    let next = -1;
    let distance = tolerance * tolerance;
    for (let i = first + 1; i < end; i++) {
      const candidate = distanceSquared(points[i], points[first], points[end]);
      if (candidate > distance) {
        next = i;
        distance = candidate;
      }
    }
    if (next >= 0) {
      keep[next] = 1;
      ranges.push([first, next], [next, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function rings(geometry) {
  if (geometry.type === 'Polygon') return geometry.arcs;
  if (geometry.type === 'MultiPolygon') return geometry.arcs.flat();
  return geometry.geometries?.flatMap(rings) ?? [];
}

const bytes = [];
function addVarUint(value) {
  while (value >= 128) {
    bytes.push((value & 127) | 128);
    value >>>= 7;
  }
  bytes.push(value);
}

const addSigned = value => addVarUint((value << 1) ^ (value >> 31));
let sourcePoints = 0;
let packedPoints = 0;
for (const arc of topology.arcs) {
  let lon = 0;
  let lat = 0;
  const projected = arc.map(([dLon, dLat]) => {
    lon += dLon;
    lat += dLat;
    return project(lon * scaleX + translateX, lat * scaleY + translateY);
  });
  const compact = [];
  for (const point of simplify(projected)) {
    const next = point.map(coordinate => Math.round(coordinate * units));
    const prior = compact.at(-1);
    if (!prior || next[0] !== prior[0] || next[1] !== prior[1]) compact.push(next);
  }
  addVarUint(compact.length);
  let x = 0;
  let y = 0;
  for (const [nextX, nextY] of compact) {
    addSigned(nextX - x);
    addSigned(nextY - y);
    x = nextX;
    y = nextY;
  }
  sourcePoints += arc.length;
  packedPoints += compact.length;
}
const packed = {
  units,
  arcCount: topology.arcs.length,
  arcs: Buffer.from(bytes).toString('base64'),
  countries: topology.objects.countries.geometries.map(geometry => [geometry.properties.name, rings(geometry)]),
  land: rings(topology.objects.land)
};
fs.writeFileSync(destination, 'window.ATLAS_GEOGRAPHY=' + JSON.stringify(packed) + ';\n');
console.log(`${topology.arcs.length} arcs, ${sourcePoints} source points, ${packedPoints} packed points, ${fs.statSync(destination).size} bytes`);
