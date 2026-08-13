/**
 * Parses and repairs a biome plan pasted back from an arbitrary model.
 *
 * Because the prompt goes into a plain chat box, nothing enforces the schema on
 * the model's side. Every model gets small details wrong — a row one character
 * short, a density given as a percentage, markdown fences around the answer.
 * Rejecting those outright would make the feature miserable to use, so this
 * repairs what is safely repairable and reports what it did.
 *
 * Only genuinely unusable input is an error: no matrix, or a matrix that isn't
 * rectangular enough to interpret.
 */
import { COARSE_MAX, COARSE_MIN } from './MapPrompt';
import type { BiomePlan, PlanPoint } from './MapPlan';

const VALID_CODES = 'wsgpfurm';
/** Common near-misses models produce, mapped to the intended biome. */
const CODE_ALIASES: Record<string, string> = {
  '.': 'p', ' ': 'p', '-': 'p', 'o': 'p',
  'd': 's', 'b': 's',
  't': 'f', 'j': 'f',
  'h': 'm', 'k': 'm', 'a': 'm',
  'c': 'r', 'x': 'r',
  'l': 'w', 'i': 'w', '~': 'w',
};

export interface NormalizeResult {
  plan: BiomePlan | null;
  /** Repairs that were applied. The plan is usable. */
  warnings: string[];
  /** Problems that made the input unusable. */
  errors: string[];
}

/** Strip markdown fences and any prose surrounding the JSON object. */
export function extractJson(raw: string): string {
  let text = raw.trim();

  // ```json ... ``` or ``` ... ```
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  // Prose before/after a bare object.
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) text = text.slice(first, last + 1);

  // Trailing commas — the single most common JSON syntax error from models.
  text = text.replace(/,(\s*[}\]])/g, '$1');

  return text;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Coerce to a finite number, or null. Handles "0.5", "50%", 50. */
function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const pct = value.trim().endsWith('%');
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return pct ? parsed / 100 : parsed;
  }
  return null;
}

/** A 0-1 density, tolerating percentages and out-of-range values. */
function density(value: unknown, fallback: number, name: string, warnings: string[]): number {
  const n = num(value);
  if (n === null) return fallback;
  if (n > 1 && n <= 100) {
    warnings.push(`${name} looked like a percentage (${n}); read as ${(n / 100).toFixed(2)}.`);
    return clamp(n / 100, 0, 1);
  }
  if (n < 0 || n > 1) {
    warnings.push(`${name} was out of range (${n}); clamped.`);
    return clamp(n, 0, 1);
  }
  return n;
}

function point(value: unknown, fallback: PlanPoint): PlanPoint {
  const v = value as Record<string, unknown> | undefined;
  const x = num(v?.x);
  const y = num(v?.y);
  return {
    x: x === null ? fallback.x : clamp(x, 0, 1),
    y: y === null ? fallback.y : clamp(y, 0, 1),
  };
}

export function normalizePlan(raw: unknown): NormalizeResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!raw || typeof raw !== 'object') {
    return { plan: null, warnings, errors: ['Top level is not a JSON object.'] };
  }
  const src = raw as Record<string, any>;

  // --- Matrix (the only genuinely required part) ---------------------------
  const coarseSrc = src.coarse ?? src.matrix ?? src.grid;
  if (!coarseSrc || typeof coarseSrc !== 'object') {
    return { plan: null, warnings, errors: ['Missing the "coarse" object with the biome matrix.'] };
  }

  let rows: unknown = coarseSrc.rows ?? coarseSrc.tiles ?? coarseSrc.data;
  // Some models emit a 2D array of characters instead of strings.
  if (Array.isArray(rows) && Array.isArray(rows[0])) {
    rows = (rows as unknown[][]).map((r) => r.join(''));
    warnings.push('Rows were arrays of characters; joined into strings.');
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return { plan: null, warnings, errors: ['"coarse.rows" is missing or empty.'] };
  }

  let stringRows = (rows as unknown[]).map((r) => String(r ?? ''));

  // Trust the rows over the declared dimensions — models miscount the numbers
  // far more often than they miscount the strings they actually wrote.
  const declaredW = num(coarseSrc.width);
  const declaredH = num(coarseSrc.height);

  const widths = stringRows.map((r) => r.length);
  const modeWidth = widths.slice().sort(
    (a, b) => widths.filter((w) => w === a).length - widths.filter((w) => w === b).length,
  ).pop() ?? 0;

  let width = Math.round(declaredW !== null && widths.every((w) => w === declaredW) ? declaredW : modeWidth);
  if (width < COARSE_MIN || width > COARSE_MAX) {
    const clamped = clamp(width, COARSE_MIN, COARSE_MAX);
    if (width > 0) warnings.push(`Matrix width ${width} is outside ${COARSE_MIN}-${COARSE_MAX}; using ${clamped}.`);
    width = clamped;
  }

  // Pad or trim every row to a common width.
  let resized = 0;
  stringRows = stringRows.map((row) => {
    if (row.length === width) return row;
    resized++;
    return row.length > width ? row.slice(0, width) : row.padEnd(width, row[row.length - 1] ?? 'p');
  });
  if (resized > 0) {
    warnings.push(`${resized} row(s) were not ${width} characters; padded or trimmed to fit.`);
  }

  if (stringRows.length > COARSE_MAX) {
    warnings.push(`Matrix had ${stringRows.length} rows; trimmed to ${COARSE_MAX}.`);
    stringRows = stringRows.slice(0, COARSE_MAX);
  }
  while (stringRows.length < COARSE_MIN) {
    stringRows.push(stringRows[stringRows.length - 1] ?? 'p'.repeat(width));
    warnings.push('Matrix had too few rows; duplicated the last row to reach the minimum.');
  }
  if (declaredH !== null && Math.round(declaredH) !== stringRows.length) {
    warnings.push(`Declared height ${declaredH} did not match ${stringRows.length} rows; used the rows.`);
  }

  // Map unknown characters onto real biomes.
  const unknown = new Set<string>();
  stringRows = stringRows.map((row) =>
    [...row].map((ch) => {
      const lower = ch.toLowerCase();
      if (VALID_CODES.includes(lower)) return lower;
      const alias = CODE_ALIASES[lower];
      if (alias) return alias;
      unknown.add(ch);
      return 'p';
    }).join(''),
  );
  if (unknown.size > 0) {
    warnings.push(`Unrecognised biome code(s) ${[...unknown].map((c) => `"${c}"`).join(', ')} treated as plains.`);
  }

  const height = stringRows.length;

  // --- Everything else is optional and gets sane defaults ------------------
  const ridges = Array.isArray(src.ridges) ? src.ridges.flatMap((r: any) => {
    const x1 = num(r?.x1), y1 = num(r?.y1), x2 = num(r?.x2), y2 = num(r?.y2);
    if (x1 === null || y1 === null || x2 === null || y2 === null) return [];
    return [{
      x1: clamp(x1, 0, 1), y1: clamp(y1, 0, 1),
      x2: clamp(x2, 0, 1), y2: clamp(y2, 0, 1),
      height: clamp(num(r?.height) ?? 2, 1, 4),
    }];
  }) : [];
  if (src.ridges !== undefined && !Array.isArray(src.ridges)) {
    warnings.push('"ridges" was not an array; ignored.');
  }

  const rivers = Array.isArray(src.rivers) ? src.rivers.flatMap((r: any) => {
    const pts = Array.isArray(r?.points) ? r.points.flatMap((p: any) => {
      const x = num(p?.x), y = num(p?.y);
      return x === null || y === null ? [] : [{ x: clamp(x, 0, 1), y: clamp(y, 0, 1) }];
    }) : [];
    if (pts.length < 2) return [];
    return [{ points: pts, width: clamp(num(r?.width) ?? 3, 1, 6) }];
  }) : [];
  if (src.rivers !== undefined && !Array.isArray(src.rivers)) {
    warnings.push('"rivers" was not an array; ignored.');
  }

  const propsSrc = src.props ?? {};
  const props = {
    pineDensity: density(propsSrc.pineDensity, 0.55, 'pineDensity', warnings),
    rockDensity: density(propsSrc.rockDensity, 0.25, 'rockDensity', warnings),
    craterDensity: density(propsSrc.craterDensity, 0.05, 'craterDensity', warnings),
    mudTrackDensity: density(propsSrc.mudTrackDensity, 0.07, 'mudTrackDensity', warnings),
  };

  const spawnsSrc = src.spawns ?? {};
  const alpha = point(spawnsSrc.alpha, { x: 0.15, y: 0.15 });
  const bravo = point(spawnsSrc.bravo, { x: 0.85, y: 0.85 });

  // Spawns on top of each other make for a non-match; push them apart.
  if (Math.hypot(alpha.x - bravo.x, alpha.y - bravo.y) < 0.35) {
    warnings.push('Spawns were too close together; moved to opposite corners.');
    alpha.x = 0.15; alpha.y = 0.15;
    bravo.x = 0.85; bravo.y = 0.85;
  }

  const plan: BiomePlan = {
    name: typeof src.name === 'string' && src.name.trim() ? src.name.trim().slice(0, 60) : 'Unnamed Sector',
    summary: typeof src.summary === 'string' ? src.summary.trim().slice(0, 200) : '',
    coarse: { width, height, rows: stringRows },
    ridges,
    rivers,
    props,
    spawns: { alpha, bravo },
  };

  return { plan, warnings, errors };
}

/** Parse pasted text straight through to a usable plan. */
export function parsePlanText(text: string): NormalizeResult {
  if (!text.trim()) return { plan: null, warnings: [], errors: ['Nothing pasted.'] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(text));
  } catch (err) {
    return { plan: null, warnings: [], errors: [`Not valid JSON: ${(err as Error).message}`] };
  }
  return normalizePlan(parsed);
}
