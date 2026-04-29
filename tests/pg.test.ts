import { QUEUE_TEST_RESULT } from '../src/constants';

const QUEUE_TEST_RESULT_UNIQ = `${QUEUE_TEST_RESULT}:mock-node-uuid`;
const mockRpop = jest.fn();
const mockLpush = jest.fn();
const mockSleep = jest.fn();

const mockCreateManyAssert = jest.fn();
const mockCreateManyTest = jest.fn();
const mockTransaction = jest.fn();
const mockDisconnect = jest.fn();

const MockRedis = jest.fn().mockImplementation(() => ({
  rpop: mockRpop,
  lpush: mockLpush,
}));

const MockPrismaClient = jest.fn().mockImplementation(() => ({
  assertResult: { createMany: mockCreateManyAssert },
  testResult: { createMany: mockCreateManyTest },
  $transaction: mockTransaction,
  $disconnect: mockDisconnect,
}));

jest.mock('ioredis', () => ({
  __esModule: true,
  default: MockRedis,
}));

jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: jest.fn(),
}));

jest.mock('@prisma/client', () => ({
  Prisma: {},
  PrismaClient: MockPrismaClient,
}));

jest.mock('utils', () => ({
  sleep: mockSleep,
  readNodeUuid: jest.fn(() => 'mock-node-uuid'),
  redis: MockRedis,
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

describe('pg module', () => {
  const originalEnv = process.env;
  let processListeners: Record<string, Function>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSleep.mockResolvedValue(undefined);
    mockTransaction.mockResolvedValue(undefined);
    // Default: suspend loop immediately so tests don't spin
    mockRpop.mockImplementation(hang);
    process.env = {
      ...originalEnv,
      DATA_REDIS_URL: 'redis://localhost:6379',
      DATABASE_URL: 'postgresql://localhost:5432/eva',
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
    it('should create a Redis instance with DATA_REDIS_URL', () => {
      jest.isolateModules(() => {
        require('../src/control/pg');
      });

      expect(MockRedis).toHaveBeenCalledWith('redis://localhost:6379');
    });

    it('should create a PrismaClient', () => {
      jest.isolateModules(() => {
        require('../src/control/pg');
      });

      expect(MockPrismaClient).toHaveBeenCalled();
    });

    it('should register a SIGTERM handler', () => {
      jest.isolateModules(() => {
        require('../src/control/pg');
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
        require('../src/control/pg');
      });

      await flushMicrotasks();

      expect(mockRpop).toHaveBeenCalledWith(QUEUE_TEST_RESULT_UNIQ, 500);
      expect(mockSleep).toHaveBeenCalledWith(1000);
    });

    it('should parse data and insert asserts then tests via transaction', async () => {
      const rawItem = JSON.stringify({
        id: 'test-1',
        name: 'test',
        asserts: [{ id: 'assert-1', result: true }],
      });

      mockRpop
        .mockResolvedValueOnce([rawItem])
        .mockImplementation(hang);

      let capturedOps: any[];
      mockTransaction.mockImplementation((ops: any[]) => {
        capturedOps = ops;
        return Promise.resolve();
      });

      jest.isolateModules(() => {
        require('../src/control/pg');
      });

      await flushMicrotasks();

      expect(mockCreateManyAssert).toHaveBeenCalledWith({
        data: [{ id: 'assert-1', result: true }],
      });

      expect(mockCreateManyTest).toHaveBeenCalledWith({
        data: [{ id: 'test-1', name: 'test' }],
      });

      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });

    it('should sleep FLUSH_INTERVAL when batch is smaller than BATCH_SIZE', async () => {
      const rawItem = JSON.stringify({
        id: 'test-1',
        asserts: [{ id: 'assert-1' }],
      });

      mockRpop
        .mockResolvedValueOnce([rawItem])
        .mockImplementation(hang);

      jest.isolateModules(() => {
        require('../src/control/pg');
      });

      await flushMicrotasks();

      expect(mockSleep).toHaveBeenCalledWith(5000);
    });

    it('should push data back to redis on transaction error', async () => {
      const rawItem = JSON.stringify({
        id: 'test-1',
        asserts: [{ id: 'assert-1' }],
      });

      mockRpop
        .mockResolvedValueOnce([rawItem])
        .mockImplementation(hang);
      mockTransaction.mockRejectedValueOnce(new Error('Postgres down'));
      mockLpush.mockResolvedValue(1);

      jest.isolateModules(() => {
        require('../src/control/pg');
      });

      await flushMicrotasks();

      expect(mockLpush).toHaveBeenCalledWith(QUEUE_TEST_RESULT_UNIQ, rawItem);
      expect(mockSleep).toHaveBeenCalledWith(5000);
    });

    it('should sleep FLUSH_INTERVAL and continue on JSON parse error', async () => {
      mockRpop
        .mockResolvedValueOnce(['not valid json'])
        .mockImplementation(hang);

      jest.isolateModules(() => {
        require('../src/control/pg');
      });

      await flushMicrotasks();

      expect(mockSleep).toHaveBeenCalledWith(5000);
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it('should handle multiple items in a single batch', async () => {
      const items = [
        JSON.stringify({ id: 't1', asserts: [{ id: 'a1' }, { id: 'a2' }] }),
        JSON.stringify({ id: 't2', asserts: [{ id: 'a3' }] }),
      ];

      mockRpop
        .mockResolvedValueOnce(items)
        .mockImplementation(hang);

      jest.isolateModules(() => {
        require('../src/control/pg');
      });

      await flushMicrotasks();

      expect(mockCreateManyTest).toHaveBeenCalledWith({
        data: [{ id: 't1' }, { id: 't2' }],
      });

      expect(mockCreateManyAssert).toHaveBeenCalledWith({
        data: [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }],
      });

      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('SIGTERM handler', () => {
    it('should run flushLoop(0), disconnect prisma and exit', async () => {
      jest.isolateModules(() => {
        require('../src/control/pg');
      });

      await flushMicrotasks();

      mockRpop.mockResolvedValueOnce(null);
      mockDisconnect.mockResolvedValue(undefined);

      await processListeners['SIGTERM']();

      expect(mockDisconnect).toHaveBeenCalled();
      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });

    it('should drain remaining data on SIGTERM', async () => {
      const rawItem = JSON.stringify({
        id: 'test-drain',
        asserts: [{ id: 'assert-drain' }],
      });

      jest.isolateModules(() => {
        require('../src/control/pg');
      });

      await flushMicrotasks();

      mockRpop.mockResolvedValueOnce([rawItem]);
      mockDisconnect.mockResolvedValue(undefined);

      await processListeners['SIGTERM']();

      expect(mockCreateManyAssert).toHaveBeenCalledWith({
        data: [{ id: 'assert-drain' }],
      });
      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(mockDisconnect).toHaveBeenCalled();
      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });
  });
});
