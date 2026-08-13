/** Wire format shared with `server/mapgen.ts`. */

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
  source: 'llm' | 'procedural';
  model?: string;
  plan: BiomePlan;
}
