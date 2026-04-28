import os from 'node:os';
import { LRUCache } from 'lru-cache';
import { type LanguageModel } from 'ai';

import { TTestSchema } from './schemas';

/**
 * Configuration object for model caching and related utilities.
 */
export default {
  host: os.hostname(),
  port: Number(process.env.EVA_RUN_PORT || 3000),
  url: `http://${os.hostname()}:${Number(process.env.EVA_RUN_PORT || 3000)}`,
  testsQueue: [] as TTestSchema[],
  runningTestsAmount: 0,
  maxTestsAmount: Number(process.env.MAX_TESTS_AMOUNT || 1000),
  clusterPingInterval: 10 * 1000, // 10 seconds
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
