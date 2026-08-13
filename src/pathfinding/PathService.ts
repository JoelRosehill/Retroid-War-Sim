/**
 * Path request queue with a per-tick expansion budget.
 *
 * Without a budget, a single order given to eighty units produces eighty full
 * searches inside one tick and the frame drops visibly. Requests are queued,
 * de-duplicated per unit, and served until the tick's expansion budget is
 * spent; a unit keeps moving on its previous path meanwhile.
 */
import { AStar, type PathResult } from './AStar';
import { MoveClass, type NavGrid } from './NavGrid';

export interface PathRequest {
  requesterId: number;
  sx: number;
  sy: number;
  gx: number;
  gy: number;
  moveClass: MoveClass;
  /** Higher runs first. */
  priority: number;
  onComplete: (result: PathResult) => void;
}

export class PathService {
  private readonly astar: AStar;
  private queue: PathRequest[] = [];
  private readonly pending = new Set<number>();

  /** Tiles of A* expansion allowed per simulation tick. */
  budgetPerTick = 9000;

  private lastServed = 0;

  constructor(grid: NavGrid) {
    this.astar = new AStar(grid);
  }

  /** Replaces any outstanding request from the same unit. */
  request(req: PathRequest): void {
    if (this.pending.has(req.requesterId)) {
      const i = this.queue.findIndex((q) => q.requesterId === req.requesterId);
      if (i >= 0) this.queue[i] = req;
      return;
    }
    this.pending.add(req.requesterId);
    this.queue.push(req);
  }

  cancel(requesterId: number): void {
    if (!this.pending.delete(requesterId)) return;
    const i = this.queue.findIndex((q) => q.requesterId === requesterId);
    if (i >= 0) this.queue.splice(i, 1);
  }

  /** Immediate, unbudgeted search — for one-off queries such as base placement. */
  searchNow(
    sx: number, sy: number, gx: number, gy: number, moveClass: MoveClass, maxExpansions = 4000,
  ): PathResult {
    return this.astar.search(sx, sy, gx, gy, moveClass, maxExpansions);
  }

  update(): void {
    if (this.queue.length === 0) { this.lastServed = 0; return; }

    // Highest priority first; ties keep insertion order.
    this.queue.sort((a, b) => b.priority - a.priority);

    let spent = 0;
    let served = 0;

    while (this.queue.length > 0 && spent < this.budgetPerTick) {
      const req = this.queue.shift()!;
      this.pending.delete(req.requesterId);

      const remaining = this.budgetPerTick - spent;
      const result = this.astar.search(
        req.sx, req.sy, req.gx, req.gy, req.moveClass,
        Math.max(400, Math.min(6000, remaining)),
      );
      spent += result.expanded;
      served++;
      req.onComplete(result);
    }

    this.lastServed = served;
  }

  get queueLength(): number { return this.queue.length; }
  get servedLastTick(): number { return this.lastServed; }
}
