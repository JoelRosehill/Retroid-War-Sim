/**
 * Expands a coarse biome plan into the full-resolution battlefield.
 *
 * The plan (from Claude or the procedural fallback) supplies large-scale
 * intent; everything here adds the detail that makes it look hand-placed:
 * noise-warped biome borders, ridge elevation, carved rivers, scattered props
 * and pre-existing battle damage. It finishes by guaranteeing the two spawns
 * are connected by ground, carving a corridor if the plan didn't leave one.
 */
import { RNG, ValueNoise } from '../core/RNG';
import { clamp } from '../core/MathUtils';
import { GameMap } from './GameMap';
import { Biome, biomeDef, biomeFromCode, DecalKind, PropKind } from './BiomeTypes';
import type { BiomePlan } from './MapPlan';

export interface GenerateOptions {
  size: number;
  seed: number;
  plan: BiomePlan;
  source: 'authored' | 'procedural';
}

export function generateMap(opts: GenerateOptions): GameMap {
  const { size, seed, plan } = opts;
  const map = new GameMap(size);
  map.name = plan.name;
  map.summary = plan.summary;
  map.source = opts.source;

  const rng = new RNG(seed);
  const warp = new ValueNoise(seed ^ 0x51ed270b);
  const detail = new ValueNoise(seed ^ 0x1b873593);
  const elevNoise = new ValueNoise(seed ^ 0x27d4eb2f);

  paintBiomes(map, plan, warp, detail);
  applyRidges(map, plan, elevNoise);
  carveRivers(map, plan);
  smoothElevation(map);

  map.recomputeAll();

  placeSpawns(map, plan);
  ensureConnectivity(map, rng);

  scatterProps(map, plan, rng, detail);
  scatterDecals(map, plan, rng);

  map.recomputeAll();
  clearSpawnAreas(map);
  map.recomputeAll();

  return map;
}

/** Sample the coarse matrix with domain warping so borders aren't blocky. */
function paintBiomes(map: GameMap, plan: BiomePlan, warp: ValueNoise, detail: ValueNoise): void {
  const { width: cw, height: ch, rows } = plan.coarse;
  const size = map.size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;

      // Warp the lookup so the coarse cells bleed into each other organically.
      const wx = nx + (warp.fbm(nx * 5, ny * 5, 3) - 0.5) * 0.16;
      const wy = ny + (warp.fbm(nx * 5 + 33, ny * 5 + 17, 3) - 0.5) * 0.16;

      const cx = clamp(Math.floor(wx * cw), 0, cw - 1);
      const cy = clamp(Math.floor(wy * ch), 0, ch - 1);
      let biome = biomeFromCode(rows[cy][cx]);

      // Sub-cell detail: a little grass inside plains, mud at forest edges.
      const d = detail.fbm(nx * 22, ny * 22, 3);
      if (biome === Biome.Plains && d > 0.68) biome = Biome.Grass;
      else if (biome === Biome.Grass && d < 0.3) biome = Biome.Plains;
      else if (biome === Biome.Forest && d < 0.26) biome = Biome.Grass;
      else if (biome === Biome.Rock && d > 0.76) biome = Biome.Mountain;
      else if (biome === Biome.Mountain && d < 0.24) biome = Biome.Rock;

      const i = map.idx(x, y);
      map.biome[i] = biome;
      map.variant[i] = Math.floor(detail.sample(x * 0.7, y * 0.7) * 4) & 3;

      // Base elevation: rocky ground sits above the water table.
      const base = biome === Biome.Mountain ? 2 : biome === Biome.Rock ? 1 : 0;
      map.elevation[i] = base;
    }
  }
}

function applyRidges(map: GameMap, plan: BiomePlan, noise: ValueNoise): void {
  const size = map.size;
  for (const ridge of plan.ridges) {
    const ax = ridge.x1 * size, ay = ridge.y1 * size;
    const bx = ridge.x2 * size, by = ridge.y2 * size;
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy || 1;
    const peak = clamp(ridge.height, 1, 4);
    const halfWidth = 5.5;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const t = clamp(((x - ax) * dx + (y - ay) * dy) / lenSq, 0, 1);
        const px = ax + dx * t, py = ay + dy * t;
        const d = Math.hypot(x - px, y - py) + (noise.sample(x * 0.25, y * 0.25) - 0.5) * 3;
        if (d > halfWidth) continue;

        const rise = Math.round(peak * (1 - d / halfWidth));
        if (rise <= 0) continue;

        const i = map.idx(x, y);
        map.elevation[i] = Math.min(6, map.elevation[i] + rise);
        if (rise >= peak * 0.6) map.biome[i] = Biome.Mountain;
        else if (rise >= peak * 0.3 && map.biome[i] !== Biome.Mountain) map.biome[i] = Biome.Rock;
      }
    }
  }
}

function carveRivers(map: GameMap, plan: BiomePlan): void {
  const size = map.size;
  for (const river of plan.rivers) {
    if (river.points.length < 2) continue;
    const halfWidth = clamp(river.width, 1, 6) / 2;

    for (let s = 0; s < river.points.length - 1; s++) {
      const a = river.points[s];
      const b = river.points[s + 1];
      const ax = a.x * size, ay = a.y * size;
      const bx = b.x * size, by = b.y * size;
      const steps = Math.ceil(Math.hypot(bx - ax, by - ay));

      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const cx = ax + (bx - ax) * t;
        const cy = ay + (by - ay) * t;
        const r = Math.ceil(halfWidth) + 1;

        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const x = Math.round(cx + dx);
            const y = Math.round(cy + dy);
            if (!map.inBounds(x, y)) continue;
            const d = Math.hypot(cx + dx - cx, cy + dy - cy);
            const idx = map.idx(x, y);
            if (d <= halfWidth) {
              map.biome[idx] = Biome.Water;
              map.elevation[idx] = 0;
            } else if (d <= halfWidth + 1.2 && map.biome[idx] !== Biome.Water) {
              map.biome[idx] = Biome.Sand;
              map.elevation[idx] = Math.min(map.elevation[idx], 1);
            }
          }
        }
      }
    }
  }
}

/** Knock down single-tile elevation spikes so cliffs read as ridgelines. */
function smoothElevation(map: GameMap): void {
  const size = map.size;
  const copy = map.elevation.slice();
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const i = map.idx(x, y);
      const n = copy[i - size], s = copy[i + size];
      const w = copy[i - 1], e = copy[i + 1];
      const maxNeighbour = Math.max(n, s, w, e);
      if (copy[i] > maxNeighbour + 1) map.elevation[i] = maxNeighbour + 1;
    }
  }
}

function placeSpawns(map: GameMap, plan: BiomePlan): void {
  const size = map.size;
  const raw = [plan.spawns.alpha, plan.spawns.bravo];
  map.spawns = raw.map((p) => {
    const gx = clamp(Math.round(p.x * size), 8, size - 9);
    const gy = clamp(Math.round(p.y * size), 8, size - 9);
    return findBuildableNear(map, gx, gy);
  });

  // If the plan put both spawns on top of each other, push them apart.
  const [a, b] = map.spawns;
  if (Math.hypot(a.gx - b.gx, a.gy - b.gy) < size * 0.4) {
    map.spawns[0] = findBuildableNear(map, Math.round(size * 0.15), Math.round(size * 0.15));
    map.spawns[1] = findBuildableNear(map, Math.round(size * 0.85), Math.round(size * 0.85));
  }
}

/** Spiral outward from (gx, gy) for the nearest tile with room for a base. */
function findBuildableNear(map: GameMap, gx: number, gy: number): { gx: number; gy: number } {
  const size = map.size;
  const fits = (x: number, y: number): boolean => {
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const tx = x + dx, ty = y + dy;
        if (!map.inBounds(tx, ty)) return false;
        const def = biomeDef(map.biome[map.idx(tx, ty)] as Biome);
        if (def.blocksGround) return false;
      }
    }
    return true;
  };

  if (fits(gx, gy)) return { gx, gy };
  for (let r = 1; r < size; r++) {
    for (let a = 0; a < r * 8; a++) {
      const ang = (a / (r * 8)) * Math.PI * 2;
      const x = clamp(Math.round(gx + Math.cos(ang) * r), 6, size - 7);
      const y = clamp(Math.round(gy + Math.sin(ang) * r), 6, size - 7);
      if (fits(x, y)) return { gx: x, gy: y };
    }
  }
  return { gx: clamp(gx, 6, size - 7), gy: clamp(gy, 6, size - 7) };
}

/**
 * Flood fill from spawn A; if spawn B isn't reachable by ground, bulldoze a
 * corridor between them. A map where the armies can never meet is a bug, not
 * an interesting layout.
 */
function ensureConnectivity(map: GameMap, rng: RNG): void {
  if (map.spawns.length < 2) return;
  const [a, b] = map.spawns;
  const size = map.size;
  const seen = new Uint8Array(size * size);
  const queue = new Int32Array(size * size);
  let head = 0, tail = 0;

  const start = map.idx(a.gx, a.gy);
  queue[tail++] = start;
  seen[start] = 1;

  while (head < tail) {
    const i = queue[head++];
    const x = i % size;
    const y = (i / size) | 0;
    const neighbours = [
      [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1],
    ];
    for (const [nx, ny] of neighbours) {
      if (!map.inBounds(nx, ny)) continue;
      const ni = map.idx(nx, ny);
      if (seen[ni]) continue;
      if (map.blocked[ni]) continue;
      seen[ni] = 1;
      queue[tail++] = ni;
    }
  }

  if (seen[map.idx(b.gx, b.gy)]) return;

  // Carve a wandering two-tile-wide corridor from A to B.
  let cx = a.gx, cy = a.gy;
  let guard = size * 6;
  while ((cx !== b.gx || cy !== b.gy) && guard-- > 0) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx, y = cy + dy;
        if (!map.inBounds(x, y)) continue;
        const i = map.idx(x, y);
        const def = biomeDef(map.biome[i] as Biome);
        if (!def.blocksGround) continue;
        map.biome[i] = def.isWater ? Biome.Sand : Biome.Rock;
        map.elevation[i] = Math.min(map.elevation[i], 1);
        map.prop[i] = PropKind.None;
        map.recomputeTile(x, y);
      }
    }

    // Bias toward the target, with a little wander so it isn't a ruled line.
    if (cx !== b.gx && (cy === b.gy || rng.bool(0.6))) cx += Math.sign(b.gx - cx);
    else if (cy !== b.gy) cy += Math.sign(b.gy - cy);
  }
}

function scatterProps(map: GameMap, plan: BiomePlan, rng: RNG, detail: ValueNoise): void {
  const size = map.size;
  const pine = clamp(plan.props.pineDensity, 0, 1);
  const rock = clamp(plan.props.rockDensity, 0, 1);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = map.idx(x, y);
      const biome = map.biome[i] as Biome;
      const def = biomeDef(biome);
      if (def.isWater) continue;

      // Clumping: a noise field gates placement so props form thickets.
      const clump = detail.fbm(x * 0.16, y * 0.16, 2);
      let chance = def.propDensity;
      if (biome === Biome.Forest) chance *= 0.55 + pine;
      else if (biome === Biome.Rock || biome === Biome.Mountain) chance *= 0.5 + rock;
      chance *= 0.35 + clump;

      if (!rng.bool(chance)) continue;

      let kind: PropKind;
      switch (biome) {
        case Biome.Forest:
          kind = rng.bool(0.82) ? PropKind.Pine : rng.bool(0.5) ? PropKind.Bush : PropKind.Stump;
          break;
        case Biome.Mountain:
        case Biome.Rock:
          kind = rng.bool(0.6) ? PropKind.Boulder : PropKind.RockCluster;
          break;
        case Biome.Grass:
          kind = rng.bool(0.35) ? PropKind.Pine : rng.bool(0.6) ? PropKind.Bush : PropKind.DeadTree;
          break;
        case Biome.Mud:
          kind = rng.bool(0.6) ? PropKind.DeadTree : PropKind.Stump;
          break;
        case Biome.Sand:
          kind = PropKind.RockCluster;
          break;
        default:
          kind = rng.bool(0.5) ? PropKind.Bush : PropKind.DeadTree;
          break;
      }

      map.prop[i] = kind;
      map.propVariant[i] = rng.int(0, 2);
    }
  }
}

function scatterDecals(map: GameMap, plan: BiomePlan, rng: RNG): void {
  const size = map.size;
  const craters = clamp(plan.props.craterDensity, 0, 0.4);
  const tracks = clamp(plan.props.mudTrackDensity, 0, 0.4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = map.idx(x, y);
      if (map.blocked[i] || map.prop[i] !== PropKind.None) continue;
      const biome = map.biome[i] as Biome;
      if (biomeDef(biome).isWater) continue;

      if (rng.bool(craters)) {
        map.decal[i] = DecalKind.Crater;
        map.decalVariant[i] = rng.int(0, 2);
      } else if (rng.bool(tracks) && (biome === Biome.Mud || biome === Biome.Plains || biome === Biome.Grass)) {
        map.decal[i] = DecalKind.MudTrack;
        map.decalVariant[i] = rng.int(0, 2);
      }
    }
  }
}

/** Flatten and clear a build pad around each spawn. */
function clearSpawnAreas(map: GameMap): void {
  for (const spawn of map.spawns) {
    const baseElev = map.elevationAt(spawn.gx, spawn.gy);
    for (let dy = -6; dy <= 6; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        const x = spawn.gx + dx, y = spawn.gy + dy;
        if (!map.inBounds(x, y)) continue;
        if (dx * dx + dy * dy > 42) continue;

        const i = map.idx(x, y);
        const def = biomeDef(map.biome[i] as Biome);
        if (def.blocksGround) map.biome[i] = def.isWater ? Biome.Sand : Biome.Plains;
        map.elevation[i] = baseElev;
        map.prop[i] = PropKind.None;
        map.decal[i] = DecalKind.None;
      }
    }
  }
}
