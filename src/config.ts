import { LRUCache } from 'lru-cache';
import { type LanguageModel } from 'ai';

import { redis } from './utils';

/**
 * Configuration object for model caching and related utilities.
 */
export default {
  port: Number(process.env.EVA_RUN_PORT || 3000),
  clusterPing: 10 * 1000, // 10 seconds
  clusterRedis: process.env.CLUSTER_REDIS_URL
    ? redis(process.env.CLUSTER_REDIS_URL)
    : undefined,
  /** Whether model caching is enabled. */
  isModelCached: true,
  /** LRU cache for LanguageModel instances. */
  modelCache: new LRUCache<string, LanguageModel>({ max: 100 }),
  /**
   * Restart the model cache with a new size.
   * @param {number} [size=100] - The maximum size of the cache.
   */
  restartModelCache(size: number = 100) {
    this.modelCache = new LRUCache<string, LanguageModel>({ max: size });
  },
  /**
   * Enable model caching.
   */
  enableModelCache() {
    this.isModelCached = true;
  },
  /**
   * Disable model caching.
   */
  disableModelCache() {
    this.isModelCached = false;
  },
};
