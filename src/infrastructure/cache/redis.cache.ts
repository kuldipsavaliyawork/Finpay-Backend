import Redis from 'ioredis';
import type { CachePort } from './cache.port';
import { logger } from '../logger/logger';

/**
 * Redis-backed cache. Only constructed when config.redisUrl is set. Values are
 * JSON-serialized. Any Redis error is logged; get() degrades to null so a cache
 * outage never takes down a request path.
 */
export class RedisCache implements CachePort {
  private readonly client: Redis;

  constructor(redisUrl: string) {
    this.client = new Redis(redisUrl, { maxRetriesPerRequest: 2, lazyConnect: false });
    this.client.on('error', (err) => logger.error({ err }, 'Redis cache error'));
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch (err) {
      logger.error({ err, key }, 'RedisCache.get failed');
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const raw = JSON.stringify(value);
    if (ttlSeconds !== undefined && ttlSeconds > 0) {
      await this.client.set(key, raw, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, raw);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length > 0) await this.client.del(...keys);
  }

  async withCache<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const fresh = await loader();
    await this.set(key, fresh, ttlSeconds);
    return fresh;
  }

  async close(): Promise<void> {
    await this.client.quit();
  }
}
