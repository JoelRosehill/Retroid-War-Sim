/**
 * Depth sorting for the entity layer.
 *
 * Pixi's `sortableChildren` runs a comparison sort on the whole container every
 * frame. With ~2000 sprites that is measurable, and the keys here are bounded
 * and mostly-sorted between frames, so a counting sort over screen rows plus a
 * small insertion pass inside each row is both faster and stable.
 */
import type { Container } from 'pixi.js';

export interface Sortable {
  /** The display object whose child order we control. */
  view: Container;
  /** Painter's-algorithm key from `depthKey()`. */
  depth: number;
  visible: boolean;
}

export class DepthSorter {
  private readonly buckets: Sortable[][];
  private readonly bucketCount: number;
  private readonly minDepth: number;
  private readonly bucketSpan: number;

  /**
   * @param minDepth  Lowest depth key that can occur.
   * @param maxDepth  Highest depth key that can occur.
   * @param buckets   Number of coarse bins; one per screen row works well.
   */
  constructor(minDepth: number, maxDepth: number, buckets = 512) {
    this.minDepth = minDepth;
    this.bucketCount = buckets;
    this.bucketSpan = (maxDepth - minDepth) / buckets;
    this.buckets = new Array(buckets);
    for (let i = 0; i < buckets; i++) this.buckets[i] = [];
  }

  /**
   * Reorder `container.children` so that `items` are painted back-to-front.
   * Items are bucketed by depth, each bucket is insertion-sorted (cheap, since
   * buckets hold a handful of entities), then the container's child array is
   * rewritten in place.
   */
  sort(items: readonly Sortable[], container: Container): void {
    const buckets = this.buckets;
    for (let i = 0; i < this.bucketCount; i++) buckets[i].length = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.visible) continue;
      let idx = ((item.depth - this.minDepth) / this.bucketSpan) | 0;
      if (idx < 0) idx = 0;
      else if (idx >= this.bucketCount) idx = this.bucketCount - 1;
      buckets[idx].push(item);
    }

    const children = container.children;
    let write = 0;

    for (let b = 0; b < this.bucketCount; b++) {
      const bucket = buckets[b];
      const n = bucket.length;
      if (n === 0) continue;

      // Insertion sort: buckets are tiny and nearly ordered frame to frame.
      for (let i = 1; i < n; i++) {
        const item = bucket[i];
        const key = item.depth;
        let j = i - 1;
        while (j >= 0 && bucket[j].depth > key) {
          bucket[j + 1] = bucket[j];
          j--;
        }
        bucket[j + 1] = item;
      }

      for (let i = 0; i < n; i++) {
        children[write++] = bucket[i].view;
      }
    }

    // Trim anything left over from a previous, larger frame.
    if (children.length !== write) children.length = write;
  }
}
