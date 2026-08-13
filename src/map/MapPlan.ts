/**
 * The map plan format.
 *
 * This is the contract a model is asked to fill in (see `MapPrompt.ts`) and the
 * input `MapGenerator` expands into the battlefield. Keep it small and
 * hand-writable: a person should be able to author one in a text editor.
 */

export interface PlanPoint { x: number; y: number; }

export interface BiomePlan {
  name: string;
  summary: string;
  coarse: {
    width: number;
    height: number;
    /** One string per row, `width` biome codes each. */
    rows: string[];
  };
  ridges: { x1: number; y1: number; x2: number; y2: number; height: number }[];
  rivers: { points: PlanPoint[]; width: number }[];
  props: {
    pineDensity: number;
    rockDensity: number;
    craterDensity: number;
    mudTrackDensity: number;
  };
  spawns: { alpha: PlanPoint; bravo: PlanPoint };
}

export interface MapgenResponse {
  /** 'authored' means a plan the user supplied; 'procedural' is the built-in generator. */
  source: 'authored' | 'procedural';
  plan: BiomePlan;
}
