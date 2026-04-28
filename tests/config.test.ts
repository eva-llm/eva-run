import CONF from '../src/config';

jest.mock('node:os', () => ({
  __esModule: true,
  default: {
      hostname: jest.fn(() => 'localhost'),
  },
}));

describe('Config module', () => {
  beforeEach(() => {
    CONF.isModelCached = true;
    CONF.restartModelCache();
  });

  it('should have a default export', () => {
    expect(CONF).toBeDefined();
  });

  describe('default values', () => {
    it('should have model caching enabled by default', () => {
      expect(CONF.isModelCached).toBe(true);
    });

    it('should have a modelCache', () => {
      expect(CONF.modelCache).toBeDefined();
    });
  });

  describe('model cache controls', () => {
    it('enableModelCache sets isModelCached to true', () => {
      CONF.isModelCached = false;
      CONF.enableModelCache();
      expect(CONF.isModelCached).toBe(true);
    });

    it('disableModelCache sets isModelCached to false', () => {
      CONF.disableModelCache();
      expect(CONF.isModelCached).toBe(false);
    });
  });

  describe('restartModelCache', () => {
    it('should create a new cache with default size', () => {
      const oldCache = CONF.modelCache;
      CONF.restartModelCache();
      expect(CONF.modelCache).not.toBe(oldCache);
      expect(CONF.modelCache.max).toBe(100);
    });

    it('should create a new cache with custom size', () => {
      CONF.restartModelCache(50);
      expect(CONF.modelCache.max).toBe(50);
    });
  });

  describe('modelCache operations', () => {
    it('should store and retrieve values', () => {
      const mockModel = { modelId: 'test' } as any;
      CONF.modelCache.set('test-key', mockModel);
      expect(CONF.modelCache.get('test-key')).toBe(mockModel);
    });

    it('should clear entries on restart', () => {
      const mockModel = { modelId: 'test' } as any;
      CONF.modelCache.set('test-key', mockModel);
      CONF.restartModelCache();
      expect(CONF.modelCache.get('test-key')).toBeUndefined();
    });
  });
});
