/**
 * Dev/preview-server middleware backing `POST /api/mapgen`.
 *
 * The browser never sees the API key: it posts a natural-language brief, this
 * handler asks Claude for a *biome plan* (a coarse biome matrix plus ridge,
 * river and prop directives) under a strict JSON schema, and the client's
 * MapGenerator expands that plan into the full-resolution isometric grid.
 *
 * Asking for a coarse matrix rather than a 96x96 one keeps the response inside
 * a few thousand tokens while still letting the model author the map's shape.
 */
import type { Plugin, ViteDevServer, PreviewServer } from 'vite';
import { loadEnv } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

/** Single-character biome codes the model may emit in the coarse matrix. */
const BIOME_CODES = ['w', 's', 'g', 'p', 'f', 'u', 'r', 'm'] as const;

const COARSE_MAX = 24;

const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'summary', 'coarse', 'ridges', 'rivers', 'props', 'spawns'],
  properties: {
    name: { type: 'string', description: 'Short evocative name for the battlefield.' },
    summary: { type: 'string', description: 'One sentence describing the terrain for the HUD ticker.' },
    coarse: {
      type: 'object',
      additionalProperties: false,
      required: ['width', 'height', 'rows'],
      properties: {
        width: { type: 'integer', description: `Columns in the matrix, 8-${COARSE_MAX}.` },
        height: { type: 'integer', description: `Rows in the matrix, 8-${COARSE_MAX}.` },
        rows: {
          type: 'array',
          description:
            'One string per row, each exactly `width` characters long, drawn from the biome codes: ' +
            'w=water s=sand g=grass p=plains f=forest u=mud r=rock m=mountain.',
          items: { type: 'string' },
        },
      },
    },
    ridges: {
      type: 'array',
      description: 'Mountain ridge lines in normalized 0-1 map space, raised above the surrounding terrain.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['x1', 'y1', 'x2', 'y2', 'height'],
        properties: {
          x1: { type: 'number' }, y1: { type: 'number' },
          x2: { type: 'number' }, y2: { type: 'number' },
          height: { type: 'number', description: 'Elevation steps at the ridge crest, 1-4.' },
        },
      },
    },
    rivers: {
      type: 'array',
      description: 'Water courses as polylines in normalized 0-1 map space.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['points', 'width'],
        properties: {
          points: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['x', 'y'],
              properties: { x: { type: 'number' }, y: { type: 'number' } },
            },
          },
          width: { type: 'number', description: 'River width in tiles, 1-6.' },
        },
      },
    },
    props: {
      type: 'object',
      additionalProperties: false,
      required: ['pineDensity', 'rockDensity', 'craterDensity', 'mudTrackDensity'],
      properties: {
        pineDensity: { type: 'number', description: '0-1 density of pine trees inside forest tiles.' },
        rockDensity: { type: 'number', description: '0-1 density of boulders and rubble.' },
        craterDensity: { type: 'number', description: '0-1 density of pre-existing shell craters.' },
        mudTrackDensity: { type: 'number', description: '0-1 density of churned mud tracks.' },
      },
    },
    spawns: {
      type: 'object',
      description: 'Base locations in normalized 0-1 map space. Keep them far apart and off water.',
      additionalProperties: false,
      required: ['alpha', 'bravo'],
      properties: {
        alpha: {
          type: 'object', additionalProperties: false, required: ['x', 'y'],
          properties: { x: { type: 'number' }, y: { type: 'number' } },
        },
        bravo: {
          type: 'object', additionalProperties: false, required: ['x', 'y'],
          properties: { x: { type: 'number' }, y: { type: 'number' } },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = [
  'You are a level designer for a 2.5D isometric real-time-strategy simulation rendered in',
  'early-2000s pixel art (SimCity 2000 / Red Alert 2 lineage).',
  '',
  'You author the terrain only — no units, no buildings. Produce a coarse biome matrix that a',
  'procedural expander upsamples to the full battlefield, plus ridge, river and prop directives.',
  '',
  'Design rules:',
  `- The matrix is at most ${COARSE_MAX}x${COARSE_MAX}. Every row string must be exactly "width" characters.`,
  '- Use only these codes: w=water s=sand g=grass p=plains f=forest u=mud r=rock m=mountain.',
  '- Leave a broad, mostly-traversable middle band: the two armies must be able to reach each other',
  '  by ground. Water and mountains are for flavour and chokepoints, never a full wall.',
  '- Put the two spawns near opposite corners or edges, on solid ground, with clear buildable space.',
  '- Prefer legible large shapes over noise; the expander adds the fine detail and texture.',
].join('\n');

interface MapgenRequest {
  prompt?: string;
  seed?: number;
}

/** The subset of the Messages response this handler reads. */
interface MessageResponse {
  stop_reason: string | null;
  stop_details?: unknown;
  content: { type: string; text?: string }[];
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(payload);
}

async function readBody(req: IncomingMessage, limitBytes = 32 * 1024): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > limitBytes) throw new Error('request body too large');
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Cheap guard so a malformed model response can never crash the client. */
function validatePlan(plan: any): string | null {
  if (!plan || typeof plan !== 'object') return 'plan is not an object';
  const c = plan.coarse;
  if (!c || !Array.isArray(c.rows)) return 'coarse.rows missing';
  if (!Number.isInteger(c.width) || !Number.isInteger(c.height)) return 'coarse dimensions not integers';
  if (c.width < 4 || c.height < 4 || c.width > COARSE_MAX || c.height > COARSE_MAX) {
    return `coarse dimensions out of range (${c.width}x${c.height})`;
  }
  if (c.rows.length !== c.height) return `expected ${c.height} rows, got ${c.rows.length}`;
  const allowed = new Set<string>(BIOME_CODES);
  for (let y = 0; y < c.rows.length; y++) {
    const row = c.rows[y];
    if (typeof row !== 'string' || row.length !== c.width) return `row ${y} is not ${c.width} chars`;
    for (const ch of row) if (!allowed.has(ch)) return `row ${y} has unknown biome code "${ch}"`;
  }
  return null;
}

function createHandler(env: Record<string, string>) {
  const apiKey = env.ANTHROPIC_API_KEY ?? '';
  const model = env.MAPGEN_MODEL || 'claude-opus-5';
  const effort = env.MAPGEN_EFFORT || 'low';

  return async function mapgenHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });

    if (!apiKey) {
      return send(res, 503, {
        error: 'no_api_key',
        detail: 'ANTHROPIC_API_KEY is not set; the client will use its procedural fallback.',
      });
    }

    let body: MapgenRequest;
    try {
      body = JSON.parse(await readBody(req) || '{}');
    } catch (err) {
      return send(res, 400, { error: 'bad_request', detail: String(err) });
    }

    const brief = typeof body.prompt === 'string' && body.prompt.trim()
      ? body.prompt.trim().slice(0, 2000)
      : 'A contested river valley: forested highlands on one flank, open mud flats on the other.';

    try {
      // Imported lazily so the dev server still boots when the SDK is absent.
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey });

      // `output_config` (structured outputs + effort) is newer than some pinned
      // SDK versions type. Building the body untyped keeps this compiling
      // against either, since the wire format is what actually matters.
      const requestBody: Record<string, unknown> = {
        model,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        output_config: {
          effort,
          format: { type: 'json_schema', schema: PLAN_SCHEMA },
        },
        messages: [{
          role: 'user',
          content: `Design the battlefield.\n\nBrief: ${brief}\n\nVariation seed: ${body.seed ?? 0}`,
        }],
      };

      const response = (await client.messages.create(
        requestBody as unknown as Parameters<typeof client.messages.create>[0],
      )) as unknown as MessageResponse;

      if (response.stop_reason === 'refusal') {
        return send(res, 502, { error: 'refused', detail: response.stop_details ?? null });
      }

      const text = response.content.find((b) => b.type === 'text' && typeof b.text === 'string');
      if (!text?.text) {
        return send(res, 502, { error: 'empty_response' });
      }

      const plan = JSON.parse(text.text);
      const problem = validatePlan(plan);
      if (problem) return send(res, 502, { error: 'invalid_plan', detail: problem });

      return send(res, 200, { source: 'llm', model, plan });
    } catch (err) {
      // Never fail the sim on a map-gen hiccup — the client falls back locally.
      return send(res, 502, { error: 'upstream_error', detail: (err as Error).message });
    }
  };
}

export function mapgenPlugin(): Plugin {
  let env: Record<string, string> = {};

  return {
    name: 'retroid-mapgen',
    config(_config, { mode }) {
      env = loadEnv(mode, process.cwd(), '');
    },
    configureServer(server: ViteDevServer) {
      const handler = createHandler(env);
      server.middlewares.use('/api/mapgen', (req, res) => { void handler(req, res); });
    },
    configurePreviewServer(server: PreviewServer) {
      const handler = createHandler(env);
      server.middlewares.use('/api/mapgen', (req, res) => { void handler(req, res); });
    },
  };
}
