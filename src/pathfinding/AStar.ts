/**
 * A* over the isometric tile grid with 8-way movement.
 *
 * Scratch arrays are allocated once and versioned with a generation counter, so
 * a search costs no allocation and no clearing — important because hundreds of
 * units re-path as the front line moves.
 */
import { MoveClass, type NavGrid } from './NavGrid';

const SQRT2 = Math.SQRT2;

/** Neighbour offsets: 4 cardinal first (cheaper), then 4 diagonal. */
const NEIGHBOURS: readonly (readonly [number, number, number])[] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];

/** Min-heap keyed on f-score, storing tile indices. */
class MinHeap {
  private readonly indices: Int32Array;
  private readonly keys: Float32Array;
  private size = 0;

  constructor(capacity: number) {
    this.indices = new Int32Array(capacity);
    this.keys = new Float32Array(capacity);
  }

  clear(): void { this.size = 0; }
  get length(): number { return this.size; }

  push(index: number, key: number): void {
    if (this.size >= this.indices.length) return;
    let i = this.size++;
    this.indices[i] = index;
    this.keys[i] = key;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.keys[parent] <= this.keys[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.indices[0];
    this.size--;
    if (this.size > 0) {
      this.indices[0] = this.indices[this.size];
      this.keys[0] = this.keys[this.size];
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let best = i;
        if (l < this.size && this.keys[l] < this.keys[best]) best = l;
        if (r < this.size && this.keys[r] < this.keys[best]) best = r;
        if (best === i) break;
        this.swap(i, best);
        i = best;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    const ti = this.indices[a]; this.indices[a] = this.indices[b]; this.indices[b] = ti;
    const tk = this.keys[a]; this.keys[a] = this.keys[b]; this.keys[b] = tk;
  }
}

export interface PathResult {
  /** Waypoints in tile coordinates, start excluded, goal last. Empty if unreachable. */
  waypoints: Int32Array;
  found: boolean;
  /** Tiles expanded — useful for budgeting and profiling. */
  expanded: number;
}

export class AStar {
  private readonly gScore: Float32Array;
  private readonly cameFrom: Int32Array;
  private readonly stamp: Int32Array;
  private readonly closed: Uint8Array;
  private readonly open: MinHeap;
  private generation = 0;

  constructor(private readonly grid: NavGrid) {
    const n = grid.size * grid.size;
    this.gScore = new Float32Array(n);
    this.cameFrom = new Int32Array(n);
    this.stamp = new Int32Array(n);
    this.closed = new Uint8Array(n);
    this.open = new MinHeap(n);
  }

  /**
   * @param maxExpansions Hard cap so one unreachable goal can't stall a tick.
   */
  search(
    sx: number, sy: number, gx: number, gy: number,
    moveClass: MoveClass, maxExpansions = 6000,
  ): PathResult {
    const grid = this.grid;
    const size = grid.size;

    if (!grid.inBounds(sx, sy) || !grid.inBounds(gx, gy)) {
      return { waypoints: new Int32Array(0), found: false, expanded: 0 };
    }

    // Slide the goal to the nearest reachable tile rather than failing outright.
    if (!grid.passable(gx, gy, moveClass)) {
      const alt = grid.nearestPassable(gx, gy, moveClass);
      if (!alt) return { waypoints: new Int32Array(0), found: false, expanded: 0 };
      gx = alt.x; gy = alt.y;
    }

    const startIdx = sy * size + sx;
    const goalIdx = gy * size + gx;
    if (startIdx === goalIdx) return { waypoints: new Int32Array(0), found: true, expanded: 0 };

    const gen = ++this.generation;
    this.open.clear();

    this.stamp[startIdx] = gen;
    this.gScore[startIdx] = 0;
    this.cameFrom[startIdx] = -1;
    this.closed[startIdx] = 0;
    this.open.push(startIdx, octile(sx, sy, gx, gy));

    let expanded = 0;

    while (this.open.length > 0) {
      const current = this.open.pop();
      if (this.closed[current] === 1 && this.stamp[current] === gen) continue;
      this.closed[current] = 1;

      if (current === goalIdx) {
        return { waypoints: this.reconstruct(current, gen), found: true, expanded };
      }
      if (++expanded > maxExpansions) break;

      const cx = current % size;
      const cy = (current / size) | 0;
      const currentG = this.gScore[current];

      for (let n = 0; n < NEIGHBOURS.length; n++) {
        const [dx, dy, base] = NEIGHBOURS[n];
        const nx = cx + dx;
        const ny = cy + dy;
        if (!grid.passable(nx, ny, moveClass)) continue;

        // No corner cutting: a diagonal needs both orthogonal neighbours open.
        if (dx !== 0 && dy !== 0) {
          if (!grid.passable(cx + dx, cy, moveClass)) continue;
          if (!grid.passable(cx, cy + dy, moveClass)) continue;
        }

        const nIdx = ny * size + nx;
        const climb = grid.elevationPenalty(current, nIdx);
        if (!Number.isFinite(climb)) continue;

        const tentative = currentG + base * grid.cost(nx, ny, moveClass) + climb;

        const fresh = this.stamp[nIdx] !== gen;
        if (fresh) {
          this.stamp[nIdx] = gen;
          this.closed[nIdx] = 0;
          this.gScore[nIdx] = Infinity;
        }
        if (tentative >= this.gScore[nIdx]) continue;

        this.gScore[nIdx] = tentative;
        this.cameFrom[nIdx] = current;
        this.open.push(nIdx, tentative + octile(nx, ny, gx, gy));
      }
    }

    return { waypoints: new Int32Array(0), found: false, expanded };
  }

  /** Walk `cameFrom` back to the start, then reverse and simplify. */
  private reconstruct(goalIdx: number, gen: number): Int32Array {
    const chain: number[] = [];
    let cursor = goalIdx;
    let guard = this.cameFrom.length;
    while (cursor !== -1 && guard-- > 0) {
      chain.push(cursor);
      if (this.stamp[cursor] !== gen) break;
      cursor = this.cameFrom[cursor];
    }
    chain.reverse();
    chain.shift(); // drop the start tile

    // Collapse runs that share a direction — fewer waypoints, smoother steering.
    const size = this.grid.size;
    const simplified: number[] = [];
    let lastDx = 0, lastDy = 0;
    for (let i = 0; i < chain.length; i++) {
      const prev = i === 0 ? -1 : chain[i - 1];
      if (prev === -1) { simplified.push(chain[i]); continue; }
      const dx = Math.sign((chain[i] % size) - (prev % size));
      const dy = Math.sign(((chain[i] / size) | 0) - ((prev / size) | 0));
      if (dx === lastDx && dy === lastDy && simplified.length > 0) {
        simplified[simplified.length - 1] = chain[i];
      } else {
        simplified.push(chain[i]);
      }
      lastDx = dx; lastDy = dy;
    }

    return Int32Array.from(simplified);
  }
}

/** Octile distance — the admissible heuristic for 8-way movement. */
function octile(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return (dx + dy) + (SQRT2 - 2) * Math.min(dx, dy);
}
