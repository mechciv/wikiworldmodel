// Pure lifecycle helpers for living-scene retention, spatial hysteresis, and LRU caching.
// Kept free of DOM/WebGL imports so tests can verify caching and transition rules directly.

/**
 * Maximum horizontal distance (in metres) from an active living scene's origin before a neighboring
 * lattice cell is requested. Always exceeds half a 0.1° lattice cell (~5.55 km) so tiny cursor-anchored
 * zoom drifts across a cell border never trigger a rebuild, while staying comfortably inside the
 * 16 km scene extent (EXTENT = 16000 m) and scaling smoothly with altitude.
 */
export function lifeKeepRadius(range: number): number {
  const r = Number.isFinite(range) ? Math.max(0, range) : 0;
  return Math.max(7_500, Math.min(24_000, r * 0.5));
}

/**
 * Whether two `lifeKeyAt` keys share the same temporal, seasonal, human-landscape, and shore context
 * (everything except the spatial lattice cell `[lat, lon]`).
 *
 * Key format: `${binFrom}|${lat}|${lon}|${month}|${step}|${shore}`
 */
export function sameLifeContext(aKey: string, bKey: string): boolean {
  const a = aKey.split('|');
  const b = bKey.split('|');
  if (a.length < 6 || b.length < 6) return aKey === bKey;
  return a[0] === b[0] && a[3] === b[3] && a[4] === b[4] && a[5] === b[5];
}

/**
 * Bounded least-recently-used cache for standby local scenes so panning or zooming back across
 * a lattice border swaps instantaneously without re-running ground/settlement workers.
 */
export class SceneCache<T> {
  private entries = new Map<string, T>();

  constructor(
    readonly maxSize: number,
    private onEvict?: (value: T, key: string) => void,
  ) {
    if (maxSize < 0) throw new Error('SceneCache maxSize must be non-negative');
  }

  get size(): number {
    return this.entries.size;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  /** Retrieve an entry and mark it as most recently used. */
  get(key: string): T | undefined {
    const v = this.entries.get(key);
    if (v === undefined) return undefined;
    this.entries.delete(key);
    this.entries.set(key, v);
    return v;
  }

  /** Remove and return an entry without calling `onEvict` (used when promoting back to active). */
  take(key: string): T | undefined {
    const v = this.entries.get(key);
    if (v === undefined) return undefined;
    this.entries.delete(key);
    return v;
  }

  /** Insert or refresh an entry, evicting the least-recently-used entry if over capacity. */
  set(key: string, value: T): void {
    const existing = this.entries.get(key);
    if (existing !== undefined) {
      this.entries.delete(key);
      if (existing !== value) this.onEvict?.(existing, key);
    }
    if (this.maxSize === 0) {
      this.onEvict?.(value, key);
      return;
    }
    this.entries.set(key, value);
    while (this.entries.size > this.maxSize) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      const oldestVal = this.entries.get(oldestKey)!;
      this.entries.delete(oldestKey);
      this.onEvict?.(oldestVal, oldestKey);
    }
  }

  values(): IterableIterator<T> {
    return this.entries.values();
  }

  clear(): void {
    for (const [k, v] of this.entries) this.onEvict?.(v, k);
    this.entries.clear();
  }
}
