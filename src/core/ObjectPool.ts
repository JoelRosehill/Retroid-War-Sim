/**
 * Fixed-shape object pool. Projectiles and particles churn hard during a
 * firefight; recycling them keeps the GC out of the frame budget.
 */
export interface Poolable {
  /** Reset to a clean state before the object is handed out again. */
  reset(): void;
}

export class ObjectPool<T extends Poolable> {
  private readonly free: T[] = [];
  private readonly factory: () => T;
  private liveCount = 0;

  constructor(factory: () => T, prewarm = 0) {
    this.factory = factory;
    for (let i = 0; i < prewarm; i++) this.free.push(factory());
  }

  acquire(): T {
    const obj = this.free.pop() ?? this.factory();
    this.liveCount++;
    return obj;
  }

  release(obj: T): void {
    obj.reset();
    this.liveCount--;
    this.free.push(obj);
  }

  get live(): number { return this.liveCount; }
  get pooled(): number { return this.free.length; }
}

/**
 * Dense array with swap-remove semantics. Iterating a firefight's worth of
 * projectiles stays cache-friendly and removal is O(1).
 */
export class SwapList<T> {
  readonly items: T[] = [];

  add(item: T): void {
    this.items.push(item);
  }

  /** Remove by index without preserving order. */
  removeAt(index: number): void {
    const last = this.items.length - 1;
    if (index !== last) this.items[index] = this.items[last];
    this.items.pop();
  }

  get length(): number { return this.items.length; }

  clear(): void { this.items.length = 0; }
}
