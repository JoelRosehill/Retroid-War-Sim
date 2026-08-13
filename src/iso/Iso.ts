/**
 * Isometric projection. Grid space is (gx, gy) in tiles with +x running
 * south-east on screen and +y south-west; elevation is a separate integer step
 * that only shifts screen Y, never depth ordering.
 *
 *   screenX = (gx - gy) * tileWidth  / 2
 *   screenY = (gx + gy) * tileHeight / 2 - elevation * ELEV_STEP
 */
import { HALF_W, HALF_H, ELEV_STEP } from '../core/Config';

export interface ScreenPoint { x: number; y: number; }
export interface GridPoint { gx: number; gy: number; }

/** Grid (fractional tiles) to screen pixels. Writes into `out` to avoid churn. */
export function gridToScreen(gx: number, gy: number, elevation = 0, out?: ScreenPoint): ScreenPoint {
  const p = out ?? { x: 0, y: 0 };
  p.x = (gx - gy) * HALF_W;
  p.y = (gx + gy) * HALF_H - elevation * ELEV_STEP;
  return p;
}

/** Screen pixels back to fractional grid coordinates, ignoring elevation. */
export function screenToGrid(sx: number, sy: number, out?: GridPoint): GridPoint {
  const p = out ?? { gx: 0, gy: 0 };
  const a = sx / HALF_W;
  const b = sy / HALF_H;
  p.gx = (a + b) * 0.5;
  p.gy = (b - a) * 0.5;
  return p;
}

/**
 * Depth key for painter's-algorithm sorting. Entities lower on screen must
 * overlap entities higher up, so the primary key is the tile's screen row
 * (gx + gy). `bias` separates co-located entities deterministically (shadows
 * below bodies, ground below air) and `layer` blocks out coarse bands.
 */
export function depthKey(gx: number, gy: number, layer: number, bias = 0): number {
  return layer * 1_000_000 + (gx + gy) * 1000 + bias;
}

/** Screen-space bounds of the whole map, used to clamp the camera. */
export function mapScreenBounds(mapSize: number): { minX: number; maxX: number; minY: number; maxY: number } {
  return {
    minX: -mapSize * HALF_W,
    maxX: mapSize * HALF_W,
    minY: -ELEV_STEP * 6,
    maxY: mapSize * 2 * HALF_H,
  };
}

/** The four corners of a tile's diamond, clockwise from the top vertex. */
export function tileDiamond(gx: number, gy: number, elevation = 0): ScreenPoint[] {
  const c = gridToScreen(gx, gy, elevation);
  return [
    { x: c.x, y: c.y },
    { x: c.x + HALF_W, y: c.y + HALF_H },
    { x: c.x, y: c.y + HALF_H * 2 },
    { x: c.x - HALF_W, y: c.y + HALF_H },
  ];
}
