/**
 * Builds the copy-paste prompt used to author a map.
 *
 * This is deliberately model-agnostic: paste it into DeepSeek, ChatGPT, Claude,
 * a local model, anything. That means we cannot rely on schema enforcement
 * (`response_format`, `output_config.format`, tool calls) — none of it exists
 * in a plain chat box. So the prompt has to carry the whole contract itself:
 * the field list, the constraints, and a complete worked example.
 *
 * The matching forgiveness lives in `PlanValidator.normalizePlan`, which
 * repairs the small mistakes every model makes rather than rejecting outright.
 */

export const COARSE_MIN = 8;
export const COARSE_MAX = 24;

export interface PromptOptions {
  /** The designer's brief, e.g. "a frozen mountain pass". */
  brief: string;
  /** Preferred matrix resolution; the model may deviate within limits. */
  size?: number;
}

const BIOME_LEGEND = [
  'w = water     — impassable to ground units (hovercraft excepted), cannot be built on',
  's = sand      — open, slightly slow, typically a shoreline',
  'g = grass     — open, normal speed, light tree cover',
  'p = plains    — open, fastest, sparse',
  'f = forest    — passable but slow, heavy cover, dense pines',
  'u = mud       — passable, slowest open terrain, churned and bleak',
  'r = rock      — badlands, slow, raised, scattered boulders',
  'm = mountain  — impassable, raised high, forms walls and chokepoints',
].join('\n');

const EXAMPLE = `{
  "name": "Kessler Ford",
  "summary": "A shallow river crossing overlooked by pine ridges on both banks.",
  "coarse": {
    "width": 12,
    "height": 12,
    "rows": [
      "mmrrggppggrr",
      "mrrggppppggr",
      "rrggppppppgg",
      "rggppwwppppg",
      "ggpppwwpppgg",
      "gfppwwwwppgg",
      "ffppwwwwppgf",
      "ggppwwwwppff",
      "ggpppwwpppgg",
      "rggppwwppppg",
      "rrggppppppgg",
      "mrrggppppggr"
    ]
  },
  "ridges": [
    { "x1": 0.05, "y1": 0.15, "x2": 0.35, "y2": 0.05, "height": 3 },
    { "x1": 0.70, "y1": 0.90, "x2": 0.98, "y2": 0.70, "height": 2 }
  ],
  "rivers": [
    { "points": [{ "x": 0.5, "y": 0.0 }, { "x": 0.45, "y": 0.5 }, { "x": 0.5, "y": 1.0 }], "width": 3 }
  ],
  "props": {
    "pineDensity": 0.6,
    "rockDensity": 0.25,
    "craterDensity": 0.05,
    "mudTrackDensity": 0.08
  },
  "spawns": {
    "alpha": { "x": 0.12, "y": 0.15 },
    "bravo": { "x": 0.88, "y": 0.85 }
  }
}`;

/** The full prompt, ready for the clipboard. */
export function buildMapPrompt(opts: PromptOptions): string {
  const size = Math.max(COARSE_MIN, Math.min(COARSE_MAX, opts.size ?? 16));
  const brief = opts.brief.trim() || 'A contested valley with mixed cover and a central watercourse.';

  return `You are designing the terrain for a 2.5D isometric real-time-strategy battle
simulation, in the visual tradition of Red Alert 2 and SimCity 2000.

Reply with ONE json object and nothing else. No markdown code fences, no
explanation before or after, no trailing commas.

## The brief

${brief}

## What you are producing

A COARSE biome matrix, roughly ${size}x${size} (minimum ${COARSE_MIN}, maximum ${COARSE_MAX}
in each direction). You are not drawing individual tiles — a procedural expander
blows this up to a 96x96 battlefield and adds all the fine detail: warped biome
borders, cliff faces, tree scatter, craters, shorelines. Your job is the large
readable shapes.

## Biome codes

Each character in a row is one biome:

${BIOME_LEGEND}

## The json shape

- name              string. Short evocative battlefield name.
- summary           string. One sentence, shown in the game's HUD.
- coarse.width      integer, ${COARSE_MIN}-${COARSE_MAX}.
- coarse.height     integer, ${COARSE_MIN}-${COARSE_MAX}.
- coarse.rows       array of exactly coarse.height strings. Every string must be
                    exactly coarse.width characters long, using only the codes
                    above. This is the single most common mistake — count them.
- ridges            array of raised mountain lines. Each has x1, y1, x2, y2 as
                    fractions of the map from 0 to 1, and height in elevation
                    steps from 1 to 4. Use [] for none.
- rivers            array of watercourses. Each has points (an array of {x, y}
                    fractions from 0 to 1, in order) and width in tiles, 1 to 6.
                    Use [] for none.
- props             four densities from 0 to 1: pineDensity, rockDensity,
                    craterDensity, mudTrackDensity.
- spawns            alpha and bravo, each {x, y} as fractions from 0 to 1. These
                    are the two armies' starting bases.

## Design rules

1. The two armies must be able to REACH each other on foot. Leave a broad,
   mostly-traversable corridor. Water and mountains make chokepoints, never a
   complete wall across the map.
2. Put the two spawns far apart — opposite corners or opposite edges — on solid
   buildable ground, each with open space around it for a base. Never place a
   spawn on water or mountain.
3. Prefer a few large legible shapes over noise. A river, a ridge, a forest
   belt, an open plain. The expander adds texture; you provide composition.
4. Make it asymmetric and characterful. A map that reads as a place beats a
   map that reads as a pattern.

## Example of the exact format expected

${EXAMPLE}

Now produce the json for the brief above.`;
}

/** Shorter reminder used when a model's first attempt failed validation. */
export function buildRepairPrompt(problems: readonly string[]): string {
  return `That json had the following problems:

${problems.map((p) => `- ${p}`).join('\n')}

Reply with the corrected json object only. No fences, no commentary. Pay
particular attention to row lengths: coarse.rows must contain exactly
coarse.height strings, each exactly coarse.width characters long.`;
}
