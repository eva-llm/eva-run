jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: jest.fn(),
}));

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('uuidv7', () => ({
  uuidv7: jest.fn(),
}));

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import type { IAssertResult, ITestResult } from '../src/schemas';
import { getPrisma, saveTestResultPg } from '../src/postgres';

function makeTestResult(overrides: Partial<ITestResult> = {}): ITestResult {
  return {
    id: 'test-id-1',
    run_id: 'run-id-1',
    provider: 'openai',
    model: 'gpt-4o',
    prompt: 'What is 2+2?',
    output: '4',
    passed: true,
    started_at: new Date('2026-01-01'),
    assert_started_at: new Date('2026-01-01'),
    finished_at: new Date('2026-01-01'),
    diff_ms: 100,
    assert_diff_ms: 50,
    output_diff_ms: 50,
    ...overrides,
  };
}

function makeAssertResult(overrides: Partial<IAssertResult> = {}): IAssertResult {
  return {
    name: 'accuracy',
    criteria: 'Answer should be correct',
    passed: true,
    score: 1.0,
    reason: 'Correct answer',
    threshold: 0.8,
    started_at: new Date('2026-01-01'),
    finished_at: new Date('2026-01-01'),
    diff_ms: 50,
    ...overrides,
  };
}

describe('pg module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getPrisma', () => {
    it('should create PrismaPg adapter with DATABASE_URL', () => {
      const originalUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';

      getPrisma();

      expect(PrismaPg).toHaveBeenCalledWith({
        connectionString: 'postgresql://localhost:5432/test',
      });

      process.env.DATABASE_URL = originalUrl;
    });

    it('should create PrismaClient with the adapter', () => {
      const originalUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      const mockAdapter = { __brand: 'adapter' };
      (PrismaPg as jest.Mock).mockReturnValue(mockAdapter);

      getPrisma();

      expect(PrismaClient).toHaveBeenCalledWith({ adapter: mockAdapter });

      process.env.DATABASE_URL = originalUrl;
    });

    it('should return a PrismaClient instance', () => {
      const originalUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'postgresql://localhost:5432/test';
      const mockClient = { __brand: 'client' };
      (PrismaClient as unknown as jest.Mock).mockImplementation(() => mockClient);

      const result = getPrisma();

      expect(result).toBe(mockClient);

      process.env.DATABASE_URL = originalUrl;
    });
  });

  describe('saveTestResultPg', () => {
    let mockPrisma: any;
    let processOnSpy: jest.SpyInstance;

    beforeEach(() => {
      mockPrisma = {
        $disconnect: jest.fn().mockResolvedValue(undefined),
        assertResult: {
          createMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        testResult: {
          create: jest.fn().mockResolvedValue({}),
        },
      };
      processOnSpy = jest.spyOn(process, 'on').mockImplementation(() => process);
    });

    afterEach(() => {
      processOnSpy.mockRestore();
    });

    it('should register SIGTERM and SIGINT handlers', () => {
      saveTestResultPg(mockPrisma);

      expect(processOnSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    });

    it('should return a function', () => {
      const saveFn = saveTestResultPg(mockPrisma);

      expect(typeof saveFn).toBe('function');
    });

    describe('graceful shutdown', () => {
      it('should disconnect prisma and exit on SIGTERM', async () => {
        const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        saveTestResultPg(mockPrisma);

        const sigtermHandler = processOnSpy.mock.calls.find(
          (call) => call[0] === 'SIGTERM'
        )![1];

        await sigtermHandler();

        expect(mockPrisma.$disconnect).toHaveBeenCalled();
        expect(exitSpy).toHaveBeenCalledWith(0);

        exitSpy.mockRestore();
      });

      it('should disconnect prisma and exit on SIGINT', async () => {
        const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);

        saveTestResultPg(mockPrisma);

        const sigintHandler = processOnSpy.mock.calls.find(
          (call) => call[0] === 'SIGINT'
        )![1];

        await sigintHandler();

        expect(mockPrisma.$disconnect).toHaveBeenCalled();
        expect(exitSpy).toHaveBeenCalledWith(0);

        exitSpy.mockRestore();
      });
    });

    describe('returned save function', () => {
      it('should save assert results with generated UUIDs', async () => {
        (uuidv7 as jest.Mock)
          .mockReturnValueOnce('uuid-1')
          .mockReturnValueOnce('uuid-2');

        const saveFn = saveTestResultPg(mockPrisma);
        const testResult = makeTestResult();
        const asserts = [
          makeAssertResult({ name: 'assert-1' }),
          makeAssertResult({ name: 'assert-2' }),
        ];

        await saveFn(testResult, asserts);

        expect(mockPrisma.assertResult.createMany).toHaveBeenCalledWith({
          data: [
            { id: 'uuid-1', run_id: 'run-id-1', test_id: 'test-id-1', ...asserts[0] },
            { id: 'uuid-2', run_id: 'run-id-1', test_id: 'test-id-1', ...asserts[1] },
          ],
        });
      });

      it('should save test result after assert results', async () => {
        const callOrder: string[] = [];
        mockPrisma.assertResult.createMany.mockImplementation(async () => {
          callOrder.push('createMany');
          return { count: 1 };
        });
        mockPrisma.testResult.create.mockImplementation(async () => {
          callOrder.push('create');
          return {};
        });

        const saveFn = saveTestResultPg(mockPrisma);
        const testResult = makeTestResult();

        await saveFn(testResult, [makeAssertResult()]);

        expect(callOrder).toEqual(['createMany', 'create']);
      });

      it('should save the test result with correct data', async () => {
        const saveFn = saveTestResultPg(mockPrisma);
        const testResult = makeTestResult({ id: 'my-test', run_id: 'my-run' });

        await saveFn(testResult, []);

        expect(mockPrisma.testResult.create).toHaveBeenCalledWith({
          data: testResult,
        });
      });

      it('should handle empty assert results', async () => {
        const saveFn = saveTestResultPg(mockPrisma);
        const testResult = makeTestResult();

        await saveFn(testResult, []);

        expect(mockPrisma.assertResult.createMany).toHaveBeenCalledWith({
          data: [],
        });
        expect(mockPrisma.testResult.create).toHaveBeenCalledWith({
          data: testResult,
        });
      });

      it('should propagate errors from assertResult.createMany', async () => {
        mockPrisma.assertResult.createMany.mockRejectedValue(new Error('DB error'));

        const saveFn = saveTestResultPg(mockPrisma);

        await expect(saveFn(makeTestResult(), [makeAssertResult()])).rejects.toThrow('DB error');
        expect(mockPrisma.testResult.create).not.toHaveBeenCalled();
      });

      it('should propagate errors from testResult.create', async () => {
        mockPrisma.testResult.create.mockRejectedValue(new Error('Insert failed'));

        const saveFn = saveTestResultPg(mockPrisma);

        await expect(saveFn(makeTestResult(), [])).rejects.toThrow('Insert failed');
      });
    });
  });
});
