/**
 * Tile storage. Everything is a flat typed array indexed by `y * size + x`:
 * the grid is read every tick by pathfinding, targeting and rendering, so
 * cache locality matters more than ergonomics here.
 */
import { Biome, biomeDef, DecalKind, PropKind } from './BiomeTypes';

export class GameMap {
  readonly size: number;
  readonly biome: Uint8Array;
  readonly elevation: Uint8Array;
  readonly variant: Uint8Array;
  readonly decal: Uint8Array;
  readonly decalVariant: Uint8Array;
  readonly prop: Uint8Array;
  readonly propVariant: Uint8Array;
  /** Static terrain blocking: water, mountains and large props. */
  readonly blocked: Uint8Array;
  /** Movement cost multiplier x100, precomputed from biome and props. */
  readonly costScale: Uint8Array;

  /** Metadata carried from the plan for the HUD. */
  name = 'Unnamed Sector';
  summary = '';
  source: 'authored' | 'procedural' = 'procedural';

  spawns: { gx: number; gy: number }[] = [];

  constructor(size: number) {
    this.size = size;
    const n = size * size;
    this.biome = new Uint8Array(n);
    this.elevation = new Uint8Array(n);
    this.variant = new Uint8Array(n);
    this.decal = new Uint8Array(n);
    this.decalVariant = new Uint8Array(n);
    this.prop = new Uint8Array(n);
    this.propVariant = new Uint8Array(n);
    this.blocked = new Uint8Array(n);
    this.costScale = new Uint8Array(n);
  }

  idx(x: number, y: number): number {
    return y * this.size + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }

  biomeAt(x: number, y: number): Biome {
    if (!this.inBounds(x, y)) return Biome.Mountain;
    return this.biome[this.idx(x, y)] as Biome;
  }

  elevationAt(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 0;
    return this.elevation[this.idx(x, y)];
  }

  /** Terrain-only blocking; unit and building occupancy lives in NavGrid. */
  isBlocked(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return true;
    return this.blocked[this.idx(x, y)] !== 0;
  }

  isWater(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    return biomeDef(this.biome[this.idx(x, y)] as Biome).isWater;
  }

  /** 1.0 is open ground; lower is slower. */
  speedFactorAt(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 0;
    return this.costScale[this.idx(x, y)] / 100;
  }

  /**
   * Terrain that can never host a structure, whatever else is true of the
   * tile: water and mountain. Distinct from `isBuildable`, which also rejects
   * transient obstructions like scatter props.
   */
  isTerrainBuildable(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    return !biomeDef(this.biome[this.idx(x, y)] as Biome).blocksGround;
  }

  /** True only if every tile of the footprint can host a structure. */
  footprintOnBuildableTerrain(gx: number, gy: number, fw: number, fh: number): boolean {
    for (let y = gy; y < gy + fh; y++) {
      for (let x = gx; x < gx + fw; x++) {
        if (!this.isTerrainBuildable(x, y)) return false;
      }
    }
    return true;
  }

  isBuildable(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = this.idx(x, y);
    if (this.blocked[i]) return false;
    if (this.prop[i] !== PropKind.None) return false;
    return biomeDef(this.biome[i] as Biome).buildable;
  }

  setDecal(x: number, y: number, kind: DecalKind, variant: number): void {
    if (!this.inBounds(x, y)) return;
    const i = this.idx(x, y);
    this.decal[i] = kind;
    this.decalVariant[i] = variant;
  }

  clearProp(x: number, y: number): void {
    if (!this.inBounds(x, y)) return;
    const i = this.idx(x, y);
    this.prop[i] = PropKind.None;
    this.recomputeTile(x, y);
  }

  /** Refresh derived blocking/cost for one tile. */
  recomputeTile(x: number, y: number): void {
    const i = this.idx(x, y);
    const def = biomeDef(this.biome[i] as Biome);
    const prop = this.prop[i] as PropKind;
    const propBlocks = prop === PropKind.Pine || prop === PropKind.Boulder || prop === PropKind.RockCluster;

    this.blocked[i] = def.blocksGround || propBlocks ? 1 : 0;
    const propPenalty = prop === PropKind.Bush || prop === PropKind.Stump || prop === PropKind.DeadTree ? 0.85 : 1;
    this.costScale[i] = Math.round(Math.max(0, def.speedFactor * propPenalty) * 100);
  }

  recomputeAll(): void {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) this.recomputeTile(x, y);
    }
  }
}
