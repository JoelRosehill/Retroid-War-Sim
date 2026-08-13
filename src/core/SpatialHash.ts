/**
 * Uniform-grid spatial index over the tile grid. Targeting queries run every
 * few ticks across hundreds of units, so a broad-phase is mandatory; the grid
 * is rebuilt each tick rather than incrementally maintained, which is both
 * faster and simpler at these entity counts.
 */
export class SpatialHash<T extends { gx: number; gy: number; alive: boolean }> {
  private readonly cells: T[][];
  private readonly cols: number;
  private readonly rows: number;
  private readonly cellSize: number;

  constructor(mapSize: number, cellSize = 8) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(mapSize / cellSize);
    this.rows = Math.ceil(mapSize / cellSize);
    this.cells = new Array(this.cols * this.rows);
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
  }

  clear(): void {
    for (let i = 0; i < this.cells.length; i++) this.cells[i].length = 0;
  }

  insert(item: T): void {
    const cx = Math.min(this.cols - 1, Math.max(0, (item.gx / this.cellSize) | 0));
    const cy = Math.min(this.rows - 1, Math.max(0, (item.gy / this.cellSize) | 0));
    this.cells[cy * this.cols + cx].push(item);
  }

  rebuild(items: readonly T[]): void {
    this.clear();
    for (let i = 0; i < items.length; i++) {
      if (items[i].alive) this.insert(items[i]);
    }
  }

  /**
   * Visit every item within `radius` tiles of (gx, gy). The callback may return
   * `false` to stop the sweep early.
   */
  query(gx: number, gy: number, radius: number, visit: (item: T) => boolean | void): void {
    const min = this.cellSize;
    const x0 = Math.max(0, ((gx - radius) / min) | 0);
    const x1 = Math.min(this.cols - 1, ((gx + radius) / min) | 0);
    const y0 = Math.max(0, ((gy - radius) / min) | 0);
    const y1 = Math.min(this.rows - 1, ((gy + radius) / min) | 0);
    const r2 = radius * radius;

    for (let cy = y0; cy <= y1; cy++) {
      const rowBase = cy * this.cols;
      for (let cx = x0; cx <= x1; cx++) {
        const bucket = this.cells[rowBase + cx];
        for (let i = 0; i < bucket.length; i++) {
          const item = bucket[i];
          const dx = item.gx - gx;
          const dy = item.gy - gy;
          if (dx * dx + dy * dy <= r2) {
            if (visit(item) === false) return;
          }
        }
      }
    }
  }
}
