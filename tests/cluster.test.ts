const mockZadd = jest.fn().mockResolvedValue(1);
const mockLpush = jest.fn().mockResolvedValue(1);

const MockRedis = jest.fn().mockImplementation(() => ({
  zadd: mockZadd,
  lpush: mockLpush,
}));

jest.mock('ioredis', () => ({
  __esModule: true,
  default: MockRedis,
}));

jest.mock('../src/config', () => ({
  __esModule: true,
  default: {
    uuid: 'test-node-uuid',
    url: 'http://test-node:3000',
    clusterTick: 100,
  },
}));

import { QUEUE_NODE_PING, QUEUE_TEST_DONE } from '../src/constants';

describe('cluster module', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
  });

  describe('when CLUSTER_REDIS_URL is not set', () => {
    it('should export null', async () => {
      delete process.env.CLUSTER_REDIS_URL;
      const { default: cluster } = await import('../src/cluster');
      expect(cluster).toBeNull();
    });

    it('should not create a Redis client', async () => {
      delete process.env.CLUSTER_REDIS_URL;
      MockRedis.mockClear();
      await import('../src/cluster');
      expect(MockRedis).not.toHaveBeenCalled();
    });
  });

  describe('when CLUSTER_REDIS_URL is set', () => {
    beforeEach(() => {
      process.env.CLUSTER_REDIS_URL = 'redis://localhost:6379';
    });

    it('should export a non-null cluster object', async () => {
      const { default: cluster } = await import('../src/cluster');
      expect(cluster).not.toBeNull();
    });

    it('should create a Redis client with the provided URL', async () => {
      MockRedis.mockClear();
      await import('../src/cluster');
      expect(MockRedis).toHaveBeenCalledWith('redis://localhost:6379', expect.any(Object));
    });

    it('should expose startPinging and notifyTestDone methods', async () => {
      const { default: cluster } = await import('../src/cluster');
      expect(cluster).toHaveProperty('startPinging');
      expect(cluster).toHaveProperty('notifyTestDone');
      expect(typeof cluster!.startPinging).toBe('function');
      expect(typeof cluster!.notifyTestDone).toBe('function');
    });

    describe('notifyTestDone', () => {
      it('should call lpush with QUEUE_TEST_DONE and node URL + testId', async () => {
        const { default: cluster } = await import('../src/cluster');
        await cluster!.notifyTestDone('test-123');
        expect(mockLpush).toHaveBeenCalledWith(QUEUE_TEST_DONE, 'test-node-uuid|test-123');
      });

      it('should return the result of lpush', async () => {
        mockLpush.mockResolvedValue(5);
        const { default: cluster } = await import('../src/cluster');
        const result = await cluster!.notifyTestDone('test-456');
        expect(result).toBe(5);
      });
    });

    describe('startPinging', () => {
      it('should call zadd with QUEUE_NODE_PING and node URL', async () => {
        let resolveStop!: () => void;
        const stopPromise = new Promise<void>(resolve => { resolveStop = resolve; });
        let callCount = 0;
        const mockSleep = jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount >= 2) {
            resolveStop();
            return new Promise<void>(() => {}); // hang to avoid unhandled rejection
          }
          return Promise.resolve();
        });
        jest.doMock('../src/utils', () => ({
          redis: (url: string) => new MockRedis(url, {}),
          sleep: mockSleep,
        }));

        const { default: cluster } = await import('../src/cluster');
        cluster!.startPinging();
        await stopPromise;
        expect(mockZadd).toHaveBeenCalledWith(QUEUE_NODE_PING, expect.any(Number), 'test-node-uuid|http://test-node:3000');
      });

      it('should swallow errors from zadd and continue pinging', async () => {
        let resolveStop!: () => void;
        const stopPromise = new Promise<void>(resolve => { resolveStop = resolve; });
        let callCount = 0;
        const mockSleep = jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount >= 2) {
            resolveStop();
            return new Promise<void>(() => {}); // hang to avoid unhandled rejection
          }
          return Promise.resolve();
        });
        jest.doMock('../src/utils', () => ({
          redis: (url: string) => new MockRedis(url, {}),
          sleep: mockSleep,
        }));
        mockZadd.mockRejectedValueOnce(new Error('redis down'));

        const { default: cluster } = await import('../src/cluster');
        cluster!.startPinging();
        await stopPromise;
        expect(mockSleep).toHaveBeenCalledTimes(2);
      });
    });
  });
});
