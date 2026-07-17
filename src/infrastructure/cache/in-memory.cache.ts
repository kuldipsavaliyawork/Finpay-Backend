import type { CachePort } from './cache.port';

interface Entry {
  value: unknown;
  /** epoch ms when the entry expires; undefined = never. */
  expiresAt?: number;
}

/**
 * Process-local cache backed by a Map with lazy TTL expiry. Suitable for a
 * single-node dev/test environment; production should provide REDIS_URL.
 */
export class InMemoryCache implements CachePort {
  private readonly store = new Map<string, Entry>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const expiresAt =
      ttlSeconds !== undefined && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : undefined;
    this.store.set(key, { value, expiresAt });
  }

  async del(...keys: string[]): Promise<void> {
    for (const key of keys) this.store.delete(key);
  }

  async withCache<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const fresh = await loader();
    await this.set(key, fresh, ttlSeconds);
    return fresh;
  }

  async close(): Promise<void> {
    this.store.clear();
  }
}
