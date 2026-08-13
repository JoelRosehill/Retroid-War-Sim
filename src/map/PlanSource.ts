/**
 * Where the map plan comes from at boot.
 *
 * Either a plan the user authored elsewhere (pasted into Map Studio and kept in
 * localStorage), or the built-in procedural generator. There is no network call
 * and no API key: the model, whichever one you use, is driven by hand through
 * a copy-pasted prompt.
 */
import { RNG, ValueNoise } from '../core/RNG';
import type { BiomePlan, MapgenResponse } from './MapPlan';
import { normalizePlan } from './PlanValidator';

const STORAGE_KEY = 'retroid.mapPlan';
const COARSE = 20;

interface StoredPlan {
  plan: BiomePlan;
  savedAt: number;
}

/** Persist a plan so the next reload builds the map from it. */
export function saveStoredPlan(plan: BiomePlan): void {
  const payload: StoredPlan = { plan, savedAt: Date.now() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function clearStoredPlan(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function loadStoredPlan(): BiomePlan | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as StoredPlan;
    // Re-normalize on read: the stored plan may predate a schema change.
    const { plan } = normalizePlan(stored.plan);
    return plan;
  } catch {
    clearStoredPlan();
    return null;
  }
}

export function hasStoredPlan(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

/** Resolve the plan for this run. Synchronous — nothing to await. */
export function resolveMapPlan(seed: number): MapgenResponse {
  const stored = loadStoredPlan();
  if (stored) return { source: 'authored', plan: stored };
  return { source: 'procedural', plan: proceduralPlan(seed) };
}

/**
 * Deterministic stand-in for an authored map: layered noise picks biomes by
 * elevation and moisture, then ridges, a river and spawns are placed. Produces
 * the same plan structure a model does, so the rest of the pipeline is
 * identical either way.
 */
export function proceduralPlan(seed: number): BiomePlan {
  const rng = new RNG(seed);
  const elevation = new ValueNoise(seed);
  const moisture = new ValueNoise(seed ^ 0x9e3779b9);

  const rows: string[] = [];
  for (let y = 0; y < COARSE; y++) {
    let row = '';
    for (let x = 0; x < COARSE; x++) {
      const nx = x / COARSE;
      const ny = y / COARSE;
      const e = elevation.fbm(nx * 3.1, ny * 3.1, 4);
      const m = moisture.fbm(nx * 2.3 + 11, ny * 2.3 + 7, 3);

      // Push the map's edges down so the playfield reads as a basin.
      const edge = Math.min(nx, ny, 1 - nx, 1 - ny);
      const h = e - Math.max(0, 0.22 - edge) * 1.1;

      let code: string;
      if (h < 0.30) code = 'w';
      else if (h < 0.35) code = 's';
      else if (h > 0.74) code = 'm';
      else if (h > 0.64) code = 'r';
      else if (m > 0.62) code = 'f';
      else if (m < 0.34) code = 'p';
      else if (m < 0.42) code = 'u';
      else code = 'g';
      row += code;
    }
    rows.push(row);
  }

  const ridges = [];
  const ridgeCount = rng.int(1, 3);
  for (let i = 0; i < ridgeCount; i++) {
    const vertical = rng.bool();
    const t = rng.range(0.25, 0.75);
    ridges.push(vertical
      ? { x1: t, y1: rng.range(0, 0.25), x2: t + rng.range(-0.2, 0.2), y2: rng.range(0.75, 1), height: rng.range(1.5, 3.5) }
      : { x1: rng.range(0, 0.25), y1: t, x2: rng.range(0.75, 1), y2: t + rng.range(-0.2, 0.2), height: rng.range(1.5, 3.5) });
  }

  const riverPoints = [];
  const riverVertical = rng.bool();
  const steps = 5;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const wobble = Math.sin(t * Math.PI * 2 + seed) * 0.12 + rng.range(-0.05, 0.05);
    riverPoints.push(riverVertical ? { x: 0.5 + wobble, y: t } : { x: t, y: 0.5 + wobble });
  }

  const flip = rng.bool();
  const spawns = flip
    ? { alpha: { x: 0.14, y: 0.16 }, bravo: { x: 0.86, y: 0.84 } }
    : { alpha: { x: 0.15, y: 0.85 }, bravo: { x: 0.85, y: 0.15 } };

  return {
    name: 'Unnamed Sector',
    summary: 'Procedurally generated basin with mixed cover and a central watercourse.',
    coarse: { width: COARSE, height: COARSE, rows },
    ridges,
    rivers: [{ points: riverPoints, width: rng.range(2, 4.5) }],
    props: {
      pineDensity: rng.range(0.45, 0.8),
      rockDensity: rng.range(0.15, 0.4),
      craterDensity: rng.range(0.02, 0.09),
      mudTrackDensity: rng.range(0.03, 0.12),
    },
    spawns,
  };
}
