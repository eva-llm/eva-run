import { QUEUE_TEST_RESULT } from '../src/constants';

const mockRpop = jest.fn();
const mockLpush = jest.fn();
const mockInsert = jest.fn();
const mockSleep = jest.fn();

const MockRedis = jest.fn().mockImplementation(() => ({
  rpop: mockRpop,
  lpush: mockLpush,
}));

jest.mock('ioredis', () => ({
  __esModule: true,
  default: MockRedis,
}));

jest.mock('@clickhouse/client', () => ({
  createClient: jest.fn(() => ({
    insert: mockInsert,
  })),
}));

jest.mock('utils', () => ({
  sleep: mockSleep,
}));

jest.mock('schemas', () => ({}));

const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation((() => {}) as never);

/** Returns a promise that never resolves, suspending the loop */
function hang() {
  return new Promise<never>(() => {});
}

/** Flush microtasks to let async loop iterations proceed */
async function flushMicrotasks(ticks = 10) {
  for (let i = 0; i < ticks; i++) {
    await new Promise(process.nextTick);
  }
}

describe('ch module', () => {
  const originalEnv = process.env;
  let processListeners: Record<string, Function>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSleep.mockResolvedValue(undefined);
    // Default: suspend loop immediately so tests don't spin
    mockRpop.mockImplementation(hang);
    process.env = {
      ...originalEnv,
      DATA_REDIS_URL: 'redis://localhost:6379',
      CLICKHOUSE_URL: 'http://localhost:8123',
    };

    processListeners = {};
    jest.spyOn(process, 'on').mockImplementation(((event: string, handler: Function) => {
      processListeners[event] = handler;
      return process;
    }) as any);
  });

  afterEach(() => {
    process.env = originalEnv;
    (process.on as unknown as jest.SpyInstance).mockRestore();
  });

  describe('initialization', () => {
    it('should create a Redis instance with DATA_REDIS_URL and retry strategy', () => {
      jest.isolateModules(() => {
        require('../src/ch');
      });

      expect(MockRedis).toHaveBeenCalledWith('redis://localhost:6379', {
        retryStrategy: expect.any(Function),
      });
    });

    it('should have a retryStrategy that caps at 2000ms', () => {
      jest.isolateModules(() => {
        require('../src/ch');
      });

      const call = MockRedis.mock.calls[0];
      const retryStrategy = call[1].retryStrategy;

      expect(retryStrategy(1)).toBe(50);
      expect(retryStrategy(10)).toBe(500);
      expect(retryStrategy(40)).toBe(2000);
      expect(retryStrategy(1000)).toBe(2000);
    });

    it('should create a ClickHouse client with CLICKHOUSE_URL', () => {
      const { createClient } = require('@clickhouse/client');

      jest.isolateModules(() => {
        require('../src/ch');
      });

      expect(createClient).toHaveBeenCalledWith({
        host: 'http://localhost:8123',
      });
    });

    it('should register a SIGTERM handler', () => {
      jest.isolateModules(() => {
        require('../src/ch');
      });

      expect(processListeners['SIGTERM']).toBeDefined();
    });
  });

  describe('flushLoop', () => {
    it('should sleep when redis returns no data', async () => {
      mockRpop
        .mockResolvedValueOnce(null) // first iteration: no data
        .mockImplementation(hang);   // suspend loop

      jest.isolateModules(() => {
        require('../src/ch');
      });

      await flushMicrotasks();

      expect(mockRpop).toHaveBeenCalledWith(QUEUE_TEST_RESULT, 5000);
      expect(mockSleep).toHaveBeenCalledWith(1000);
    });

    it('should parse data and insert asserts then tests into ClickHouse', async () => {
      const rawItem = JSON.stringify({
        id: 'test-1',
        name: 'test',
        asserts: [{ id: 'assert-1', result: true }],
      });

      mockRpop
        .mockResolvedValueOnce([rawItem])
        .mockImplementation(hang);
      mockInsert.mockResolvedValue(undefined);

      jest.isolateModules(() => {
        require('../src/ch');
      });

      await flushMicrotasks();

      expect(mockInsert).toHaveBeenCalledWith({
        table: 'assert_results',
        values: [{ id: 'assert-1', result: true }],
        format: 'JSONEachRow',
      });

      expect(mockInsert).toHaveBeenCalledWith({
        table: 'test_results',
        values: [{ id: 'test-1', name: 'test' }],
        format: 'JSONEachRow',
      });
    });

    it('should sleep FLUSH_INTERVAL when batch is smaller than BATCH_SIZE', async () => {
      const rawItem = JSON.stringify({
        id: 'test-1',
        asserts: [{ id: 'assert-1' }],
      });

      mockRpop
        .mockResolvedValueOnce([rawItem])
        .mockImplementation(hang);
      mockInsert.mockResolvedValue(undefined);

      jest.isolateModules(() => {
        require('../src/ch');
      });

      await flushMicrotasks();

      expect(mockSleep).toHaveBeenCalledWith(5000);
    });

    it('should push data back to redis on ClickHouse insert error', async () => {
      const rawItem = JSON.stringify({
        id: 'test-1',
        asserts: [{ id: 'assert-1' }],
      });

      mockRpop
        .mockResolvedValueOnce([rawItem])
        .mockImplementation(hang);
      mockInsert.mockRejectedValueOnce(new Error('ClickHouse down'));
      mockLpush.mockResolvedValue(1);

      jest.isolateModules(() => {
        require('../src/ch');
      });

      await flushMicrotasks();

      expect(mockLpush).toHaveBeenCalledWith(QUEUE_TEST_RESULT, rawItem);
      expect(mockSleep).toHaveBeenCalledWith(5000);
    });

    it('should sleep FLUSH_INTERVAL and continue on JSON parse error', async () => {
      mockRpop
        .mockResolvedValueOnce(['not valid json'])
        .mockImplementation(hang);

      jest.isolateModules(() => {
        require('../src/ch');
      });

      await flushMicrotasks();

      expect(mockSleep).toHaveBeenCalledWith(5000);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('should handle multiple items in a single batch', async () => {
      const items = [
        JSON.stringify({ id: 't1', asserts: [{ id: 'a1' }, { id: 'a2' }] }),
        JSON.stringify({ id: 't2', asserts: [{ id: 'a3' }] }),
      ];

      mockRpop
        .mockResolvedValueOnce(items)
        .mockImplementation(hang);
      mockInsert.mockResolvedValue(undefined);

      jest.isolateModules(() => {
        require('../src/ch');
      });

      await flushMicrotasks();

      expect(mockInsert).toHaveBeenCalledWith({
        table: 'test_results',
        values: [{ id: 't1' }, { id: 't2' }],
        format: 'JSONEachRow',
      });

      expect(mockInsert).toHaveBeenCalledWith({
        table: 'assert_results',
        values: [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }],
        format: 'JSONEachRow',
      });
    });
  });

  describe('SIGTERM handler', () => {
    it('should run flushLoop(0) and then exit', async () => {
      // Main loop hangs immediately (default mock)
      jest.isolateModules(() => {
        require('../src/ch');
      });

      await flushMicrotasks();

      // SIGTERM handler calls flushLoop(0) which does one pass
      mockRpop.mockResolvedValueOnce(null);

      await processListeners['SIGTERM']();

      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });

    it('should drain remaining data on SIGTERM', async () => {
      const rawItem = JSON.stringify({
        id: 'test-drain',
        asserts: [{ id: 'assert-drain' }],
      });

      // Main loop hangs immediately (default mock)
      jest.isolateModules(() => {
        require('../src/ch');
      });

      await flushMicrotasks();

      // SIGTERM handler's flushLoop(0) call finds data
      mockRpop.mockResolvedValueOnce([rawItem]);
      mockInsert.mockResolvedValue(undefined);

      await processListeners['SIGTERM']();

      expect(mockInsert).toHaveBeenCalledWith({
        table: 'assert_results',
        values: [{ id: 'assert-drain' }],
        format: 'JSONEachRow',
      });

      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });
  });
});
