/**
 * Passability view over the map, combining static terrain with the dynamic
 * footprints of buildings, walls and defences.
 *
 * Units are deliberately *not* in this grid: treating every unit as an obstacle
 * makes paths thrash as the formation moves. Unit-to-unit spacing is handled by
 * local avoidance in MovementSystem instead, which is how RTS games of this era
 * behaved and why their armies flow rather than deadlock.
 */
import type { GameMap } from '../map/GameMap';

export const enum MoveClass {
  /** Ordinary ground: blocked by water, mountains, buildings. */
  Ground = 0,
  /** Hovercraft: water is traversable, everything else the same. */
  Amphibious = 1,
  /** Aircraft: ignores the grid entirely. */
  Air = 2,
}

export class NavGrid {
  readonly size: number;
  /** Non-zero when a structure occupies the tile. Stores the owning entity id. */
  readonly occupancy: Int32Array;
  /** Structures that ground units may walk through (gates). */
  readonly passableStructure: Uint8Array;

  constructor(private readonly map: GameMap) {
    this.size = map.size;
    this.occupancy = new Int32Array(this.size * this.size);
    this.passableStructure = new Uint8Array(this.size * this.size);
  }

  idx(x: number, y: number): number {
    return y * this.size + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }

  /** Claim a rectangular footprint for a structure. */
  occupy(gx: number, gy: number, fw: number, fh: number, entityId: number, passable: boolean): void {
    for (let y = gy; y < gy + fh; y++) {
      for (let x = gx; x < gx + fw; x++) {
        if (!this.inBounds(x, y)) continue;
        const i = this.idx(x, y);
        this.occupancy[i] = entityId;
        this.passableStructure[i] = passable ? 1 : 0;
      }
    }
  }

  release(gx: number, gy: number, fw: number, fh: number): void {
    for (let y = gy; y < gy + fh; y++) {
      for (let x = gx; x < gx + fw; x++) {
        if (!this.inBounds(x, y)) continue;
        const i = this.idx(x, y);
        this.occupancy[i] = 0;
        this.passableStructure[i] = 0;
      }
    }
  }

  occupantAt(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 0;
    return this.occupancy[this.idx(x, y)];
  }

  passable(x: number, y: number, moveClass: MoveClass): boolean {
    if (moveClass === MoveClass.Air) return true;
    if (!this.inBounds(x, y)) return false;
    const i = this.idx(x, y);

    if (this.occupancy[i] !== 0 && this.passableStructure[i] === 0) return false;

    if (this.map.blocked[i]) {
      // Amphibious units treat water as open, but not cliffs or mountains.
      return moveClass === MoveClass.Amphibious && this.map.isWater(x, y);
    }
    return true;
  }

  /** Traversal cost multiplier; 1.0 is open ground. Higher is slower. */
  cost(x: number, y: number, moveClass: MoveClass): number {
    const i = this.idx(x, y);
    if (moveClass === MoveClass.Amphibious && this.map.isWater(x, y)) return 1;
    const scale = this.map.costScale[i];
    if (scale <= 0) return 6;
    return 100 / scale;
  }

  /** Elevation change penalty — units prefer to skirt ridges rather than climb. */
  elevationPenalty(fromIdx: number, toIdx: number): number {
    const diff = Math.abs(this.map.elevation[toIdx] - this.map.elevation[fromIdx]);
    return diff > 1 ? Number.POSITIVE_INFINITY : diff * 1.6;
  }

  /** Nearest passable tile to (x, y), searched outward. */
  nearestPassable(x: number, y: number, moveClass: MoveClass, maxRadius = 12): { x: number; y: number } | null {
    if (this.passable(x, y, moveClass)) return { x, y };
    for (let r = 1; r <= maxRadius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const nx = x + dx, ny = y + dy;
          if (this.passable(nx, ny, moveClass)) return { x: nx, y: ny };
        }
      }
    }
    return null;
  }
}
