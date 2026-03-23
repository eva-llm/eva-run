import { LRUCache } from 'lru-cache';
import { type LanguageModel } from 'ai';


export default {
  isModelCached: true,
  modelCache: new LRUCache<string, LanguageModel>({ max: 100 }),

  restartModelCache(size: number = 100) {
    this.modelCache = new LRUCache<string, LanguageModel>({ max: size });
  },

  enableModelCache() {
    this.isModelCached = true;
  },

  disableModelCache() {
    this.isModelCached = false;
  },
};
