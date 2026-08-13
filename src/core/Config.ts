/** Global tuning constants. Everything spatial is derived from TILE_W/TILE_H. */

export const TILE_W = 64;
export const TILE_H = 32;
export const HALF_W = TILE_W / 2;
export const HALF_H = TILE_H / 2;

/** Screen pixels a tile rises per elevation step. */
export const ELEV_STEP = 16;

/** Simulation runs on a fixed timestep; rendering interpolates between ticks. */
export const SIM_HZ = 30;
export const SIM_DT = 1 / SIM_HZ;
export const MAX_CATCHUP_TICKS = 5;

export const MAP_SIZE = 96;

/** Render layers, low to high. Depth sorting happens inside the entity layer. */
export const Layer = {
  Terrain: 0,
  Decal: 1,
  Shadow: 2,
  Entity: 3,
  Air: 4,
  Effect: 5,
  UI: 6,
} as const;

export const Economy = {
  startingCoins: 3500,
  /** Coins per second every agent receives unconditionally. */
  passiveDrip: 18,
  /** Each operational mining rig multiplies the drip by this much. */
  rigMultiplier: 0.6,
  /** Rigs beyond this stop contributing, so the curve can't run away. */
  maxRigsCounted: 12,
  /** Refund fraction when a structure is sold or scuttled. */
  salvageRate: 0.35,
} as const;

export const CameraCfg = {
  minZoom: 0.55,
  maxZoom: 2.4,
  /** Exponential smoothing per second for pan / zoom. */
  panLerp: 2.6,
  zoomLerp: 1.8,
  /** How long a battle must stay hot before the director cuts to it. */
  cutCooldown: 6.5,
  /** Combat heat decays by this factor per second. */
  heatDecay: 0.55,
  shakeDecay: 4.0,
  maxShake: 14,
} as const;

export const AICfg = {
  /** Simulation ticks between full board evaluations. */
  thinkInterval: 15,
  /** Ticks between cheap retarget passes for idle squads. */
  retargetInterval: 45,
} as const;

export type TeamId = 0 | 1;

export interface TeamMeta {
  id: TeamId;
  name: string;
  short: string;
  /** Primary and secondary body colours for procedural sprite tinting. */
  primary: number;
  secondary: number;
  accent: number;
}

export const TEAMS: readonly [TeamMeta, TeamMeta] = [
  { id: 0, name: 'ALPHA COMMAND', short: 'ALPHA', primary: 0x3f6ea8, secondary: 0x27446b, accent: 0x7fb4e8 },
  { id: 1, name: 'BRAVO LEGION', short: 'BRAVO', primary: 0xa8462f, secondary: 0x6b2a1c, accent: 0xe8875f },
];

export function enemyOf(team: TeamId): TeamId {
  return team === 0 ? 1 : 0;
}
