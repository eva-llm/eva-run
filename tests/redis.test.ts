import { type ITestResult, type IAssertResult } from '../src/schemas';
import { QUEUE_TEST_RESULT } from '../src/constants';

const MockRedis = jest.fn().mockImplementation(() => ({
  lpush: jest.fn().mockResolvedValue(1),
  quit: jest.fn().mockResolvedValue('OK'),
}));

jest.mock('ioredis', () => ({
  __esModule: true,
  default: MockRedis,
}));

jest.mock('uuidv7', () => ({
  uuidv7: jest.fn().mockReturnValue('mock-uuid-v7'),
}));

import Redis from 'ioredis';
import { getRedis, saveTestResultRedis } from '../src/redis';

describe('redis module', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, DATA_REDIS_URL: 'redis://localhost:6379' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getRedis', () => {
    it('should create a Redis instance with DATA_REDIS_URL', () => {
      const redis = getRedis();
      expect(MockRedis).toHaveBeenCalledWith('redis://localhost:6379', {
        retryStrategy: expect.any(Function),
      });
    });

    it('should have a retryStrategy that caps at 2000ms', () => {
      getRedis();
      const call = MockRedis.mock.calls[0];
      const retryStrategy = call[1].retryStrategy;

      expect(retryStrategy(1)).toBe(50);
      expect(retryStrategy(10)).toBe(500);
      expect(retryStrategy(100)).toBe(2000);
      expect(retryStrategy(1000)).toBe(2000);
    });
  });

  describe('saveTestResultRedis', () => {
    let mockRedis: { lpush: jest.Mock; quit: jest.Mock };
    let processOnSpy: jest.SpyInstance;

    beforeEach(() => {
      mockRedis = {
        lpush: jest.fn().mockResolvedValue(1),
        quit: jest.fn().mockResolvedValue('OK'),
      };
      processOnSpy = jest.spyOn(process, 'on').mockImplementation(() => process);
    });

    afterEach(() => {
      processOnSpy.mockRestore();
    });

    it('should register SIGTERM and SIGINT handlers', () => {
      saveTestResultRedis(mockRedis as unknown as Redis);

      expect(processOnSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    });

    it('should return a function', () => {
      const saveFn = saveTestResultRedis(mockRedis as unknown as Redis);
      expect(typeof saveFn).toBe('function');
    });

    it('should push envelope to redis queue', async () => {
      const saveFn = saveTestResultRedis(mockRedis as unknown as Redis);

      const testResult: ITestResult = {
        id: 'test-id-1',
        run_id: 'run-id-1',
        provider: 'openai',
        model: 'gpt-4',
        prompt: 'Hello',
        output: 'World',
        passed: true,
        started_at: new Date('2026-01-01'),
        assert_started_at: new Date('2026-01-01'),
        finished_at: new Date('2026-01-01'),
        diff_ms: 100,
        assert_diff_ms: 50,
        output_diff_ms: 50,
      };

      const assertResults: IAssertResult[] = [
        {
          name: 'contains',
          criteria: 'output contains World',
          passed: true,
          score: 1,
          reason: 'matched',
          threshold: 0.5,
          started_at: new Date('2026-01-01'),
          finished_at: new Date('2026-01-01'),
          diff_ms: 10,
        },
      ];

      await saveFn(testResult, assertResults);

      expect(mockRedis.lpush).toHaveBeenCalledTimes(1);
      expect(mockRedis.lpush).toHaveBeenCalledWith(
        QUEUE_TEST_RESULT,
        expect.any(String),
      );

      const pushed = JSON.parse(mockRedis.lpush.mock.calls[0][1]);
      expect(pushed.id).toBe('test-id-1');
      expect(pushed.run_id).toBe('run-id-1');
      expect(pushed.provider).toBe('openai');
      expect(pushed.asserts).toHaveLength(1);
      expect(pushed.asserts[0]).toMatchObject({
        id: 'mock-uuid-v7',
        run_id: 'run-id-1',
        test_id: 'test-id-1',
        name: 'contains',
        passed: true,
        score: 1,
      });
    });

    it('should handle multiple assert results', async () => {
      const saveFn = saveTestResultRedis(mockRedis as unknown as Redis);

      const testResult: ITestResult = {
        id: 'test-id-2',
        run_id: 'run-id-2',
        provider: 'anthropic',
        model: 'claude',
        prompt: 'Hi',
        output: 'Hey',
        passed: false,
        started_at: new Date('2026-01-01'),
        assert_started_at: new Date('2026-01-01'),
        finished_at: new Date('2026-01-01'),
        diff_ms: 200,
        assert_diff_ms: 100,
        output_diff_ms: 100,
      };

      const assertResults: IAssertResult[] = [
        {
          name: 'assert-1',
          criteria: 'criteria-1',
          passed: true,
          score: 1,
          reason: 'ok',
          threshold: 0.5,
          started_at: new Date('2026-01-01'),
          finished_at: new Date('2026-01-01'),
          diff_ms: 5,
        },
        {
          name: 'assert-2',
          criteria: 'criteria-2',
          passed: false,
          score: 0,
          reason: 'failed',
          threshold: 0.8,
          started_at: new Date('2026-01-01'),
          finished_at: new Date('2026-01-01'),
          diff_ms: 8,
        },
      ];

      await saveFn(testResult, assertResults);

      const pushed = JSON.parse(mockRedis.lpush.mock.calls[0][1]);
      expect(pushed.asserts).toHaveLength(2);
      expect(pushed.asserts[0].run_id).toBe('run-id-2');
      expect(pushed.asserts[0].test_id).toBe('test-id-2');
      expect(pushed.asserts[1].run_id).toBe('run-id-2');
      expect(pushed.asserts[1].test_id).toBe('test-id-2');
    });

    it('should handle empty assert results', async () => {
      const saveFn = saveTestResultRedis(mockRedis as unknown as Redis);

      const testResult: ITestResult = {
        id: 'test-id-3',
        run_id: 'run-id-3',
        provider: 'openai',
        model: 'gpt-4',
        prompt: 'test',
        output: 'response',
        passed: true,
        started_at: new Date('2026-01-01'),
        assert_started_at: new Date('2026-01-01'),
        finished_at: new Date('2026-01-01'),
        diff_ms: 50,
        assert_diff_ms: 20,
        output_diff_ms: 30,
      };

      await saveFn(testResult, []);

      const pushed = JSON.parse(mockRedis.lpush.mock.calls[0][1]);
      expect(pushed.asserts).toEqual([]);
    });

    it('should call redis.quit on graceful shutdown', async () => {
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      saveTestResultRedis(mockRedis as unknown as Redis);

      const sigTermHandler = processOnSpy.mock.calls.find(
        (call: any[]) => call[0] === 'SIGTERM',
      )![1];

      await sigTermHandler();

      expect(mockRedis.quit).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith(0);

      exitSpy.mockRestore();
    });
  });
});
