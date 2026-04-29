import os from 'node:os';
import {
  LRUCache,
} from 'lru-cache';
import {
  type LanguageModel,
} from 'ai';

import {
  TTestSchema,
} from './schemas';
import {
  createNodeUuid,
} from './utils';

/**
 * Configuration object for model caching and related utilities.
 */
export default {
  uuid: createNodeUuid(),
  host: process.env.MY_POD_IP || os.hostname(),
  port: Number(process.env.EVA_RUN_PORT || 3000),
  get url() {
    const value = `http://${this.host}:${this.port}`;
    Object.defineProperty(this, 'url', {
      value,
      writable: false,
      configurable: true,
      enumerable: true,
    });
    return value;
  },
  testsQueue: [] as TTestSchema[],
  runningTestsAmount: 0,
  maxTestsAmount: Number(process.env.MAX_TESTS_AMOUNT || 1000),
  clusterTick: 10 * 1000, // 10 seconds
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
