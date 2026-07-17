import { config } from '../../config/config';
import { logger } from '../logger/logger';
import type { CachePort } from './cache.port';
import { InMemoryCache } from './in-memory.cache';
import { RedisCache } from './redis.cache';

export type { CachePort } from './cache.port';
export { InMemoryCache } from './in-memory.cache';
export { RedisCache } from './redis.cache';

/**
 * Pick a cache implementation based on configuration. RedisCache is only
 * constructed when a redisUrl is present so dev/test never require Redis.
 */
export function createCache(): CachePort {
  if (config.redisUrl) {
    logger.info('Cache: using Redis');
    return new RedisCache(config.redisUrl);
  }
  logger.info('Cache: using in-memory adapter');
  return new InMemoryCache();
}

/** Singleton cache used across the app. */
export const cache: CachePort = createCache();
