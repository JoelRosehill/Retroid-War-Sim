import { Ramps, type Ramp } from '../render/Palette';

export const enum Biome {
  Water = 0,
  Sand = 1,
  Grass = 2,
  Plains = 3,
  Forest = 4,
  Mud = 5,
  Rock = 6,
  Mountain = 7,
}

export const BIOME_COUNT = 8;

export interface BiomeDef {
  readonly id: Biome;
  readonly code: string;
  readonly name: string;
  readonly ramp: Ramp;
  /** Ground units cannot enter. Hovercraft ignore `waterOnly` blockers. */
  readonly blocksGround: boolean;
  readonly isWater: boolean;
  /** Movement multiplier for ground units. */
  readonly speedFactor: number;
  /** Chance a tile spawns scatter props (trees, rocks). */
  readonly propDensity: number;
  /** Buildings may be placed here. */
  readonly buildable: boolean;
}

export const BIOMES: readonly BiomeDef[] = [
  { id: Biome.Water,    code: 'w', name: 'Water',    ramp: Ramps.water,    blocksGround: true,  isWater: true,  speedFactor: 0,    propDensity: 0,    buildable: false },
  { id: Biome.Sand,     code: 's', name: 'Sand',     ramp: Ramps.sand,     blocksGround: false, isWater: false, speedFactor: 0.88, propDensity: 0.03, buildable: true },
  { id: Biome.Grass,    code: 'g', name: 'Grass',    ramp: Ramps.grass,    blocksGround: false, isWater: false, speedFactor: 1.0,  propDensity: 0.07, buildable: true },
  { id: Biome.Plains,   code: 'p', name: 'Plains',   ramp: Ramps.plains,   blocksGround: false, isWater: false, speedFactor: 1.05, propDensity: 0.04, buildable: true },
  { id: Biome.Forest,   code: 'f', name: 'Forest',   ramp: Ramps.foliage,  blocksGround: false, isWater: false, speedFactor: 0.7,  propDensity: 0.55, buildable: true },
  { id: Biome.Mud,      code: 'u', name: 'Mud',      ramp: Ramps.mud,      blocksGround: false, isWater: false, speedFactor: 0.62, propDensity: 0.02, buildable: true },
  { id: Biome.Rock,     code: 'r', name: 'Badlands', ramp: Ramps.rock,     blocksGround: false, isWater: false, speedFactor: 0.82, propDensity: 0.22, buildable: true },
  { id: Biome.Mountain, code: 'm', name: 'Mountain', ramp: Ramps.mountain, blocksGround: true,  isWater: false, speedFactor: 0,    propDensity: 0.3,  buildable: false },
];

const CODE_TO_BIOME = new Map<string, Biome>(BIOMES.map((b) => [b.code, b.id]));

export function biomeFromCode(code: string): Biome {
  return CODE_TO_BIOME.get(code) ?? Biome.Plains;
}

export function biomeDef(id: Biome): BiomeDef {
  return BIOMES[id];
}

/** Scatter prop kinds placed on top of the terrain layer. */
export const enum PropKind {
  None = 0,
  Pine = 1,
  DeadTree = 2,
  Boulder = 3,
  RockCluster = 4,
  Bush = 5,
  Stump = 6,
}

/** Ground decals baked into the terrain texture. */
export const enum DecalKind {
  None = 0,
  Crater = 1,
  MudTrack = 2,
  Scorch = 3,
  Rubble = 4,
}
