/**
 * CachePort — the cache abstraction every module depends on. Implementations:
 * InMemoryCache (default) and RedisCache (when config.redisUrl is set).
 */
export interface CachePort {
  /** Returns the parsed value, or null if missing/expired. */
  get<T>(key: string): Promise<T | null>;
  /** Store a value with an optional TTL in seconds. */
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  /** Delete one or more keys. */
  del(...keys: string[]): Promise<void>;
  /**
   * Read-through helper: return the cached value if present, otherwise run
   * the loader, cache its result (with ttlSeconds), and return it.
   */
  withCache<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T>;
  /** Optional close hook for graceful shutdown. */
  close?(): Promise<void>;
}
