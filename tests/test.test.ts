jest.mock('node:crypto', () => ({
  __esModule: true,
  default: {
    randomBytes: jest.fn(() => ({
      toString: jest.fn(() => 'a'.repeat(32)),
    })),
  },
}));

jest.mock('p-limit', () => ({
  __esModule: true,
  default: jest.fn(() => (fn: Function) => fn()),
}));

jest.mock('lru-cache', () => ({
  LRUCache: jest.fn().mockImplementation(() => {
    const store = new Map();
    return {
      get: (key: string) => store.get(key),
      set: (key: string, val: any) => store.set(key, val),
    };
  }),
}));

import { generateText } from 'ai';
import { llmRubric, gEval, bEval } from '@eva-llm/eva-judge';
import { ASSERT_NAMES, type TestSchemaT, type AssertSchemaT } from '../src/schemas';
import { saveTestResult } from '../src/db';
import { getModel } from '../src/registry';
import runTest from '../src/test';

jest.mock('ai', () => ({
  generateText: jest.fn(),
}));

jest.mock('@eva-llm/eva-judge', () => ({
  llmRubric: jest.fn(),
  gEval: jest.fn(),
  bEval: jest.fn(),
}));

jest.mock('../src/db', () => ({
  saveTestResult: jest.fn(),
}));

jest.mock('../src/registry', () => ({
  getModel: jest.fn(() => ({ provider: 'openai', modelId: 'gpt-4o' })),
}));

const mockGenerateText = generateText as jest.MockedFunction<typeof generateText>;
const mockSaveTestResult = saveTestResult as jest.MockedFunction<typeof saveTestResult>;
const mockGetModel = getModel as jest.MockedFunction<typeof getModel>;
const mockLlmRubric = llmRubric as jest.MockedFunction<typeof llmRubric>;
const mockGEval = gEval as jest.MockedFunction<typeof gEval>;
const mockBEval = bEval as jest.MockedFunction<typeof bEval>;

function makeTestConfig(overrides: Partial<TestSchemaT> = {}): TestSchemaT {
  return {
    run_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    test_id: '11111111-2222-3333-4444-555555555555',
    provider: 'openai',
    model: 'gpt-4o',
    prompt: 'What is 2+2?',
    asserts: [],
    ...overrides,
  };
}

function makeAssert(overrides: Partial<AssertSchemaT> = {}): AssertSchemaT {
  return {
    name: ASSERT_NAMES.EQUALS,
    criteria: '4',
    ...overrides,
  } as AssertSchemaT;
}

describe('test module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateText.mockResolvedValue({ output: '', text: '4' } as any);
    mockGetModel.mockReturnValue({ provider: 'openai', modelId: 'gpt-4o' } as any);
  });

  describe('generateText invocation', () => {
    it('should call generateText with the correct provider model and prompt', async () => {
      mockGenerateText.mockResolvedValue({ output: 'hello' } as any);
      const config = makeTestConfig({ asserts: [] });

      await runTest(config);

      expect(mockGetModel).toHaveBeenCalledWith('openai', 'gpt-4o');
      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          model: { provider: 'openai', modelId: 'gpt-4o' },
          prompt: 'What is 2+2?',
        }),
      );
    });

    it('should pass options through to generateText', async () => {
      mockGenerateText.mockResolvedValue({ output: 'hi' } as any);
      const config = makeTestConfig({
        options: { temperature: 0.7 },
        asserts: [],
      });

      await runTest(config);

      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({ temperature: 0.7 }),
      );
    });

    it('should include a system message with a unique hash id', async () => {
      mockGenerateText.mockResolvedValue({ output: '' } as any);
      await runTest(makeTestConfig());

      const call = mockGenerateText.mock.calls[0][0];
      expect(call.system).toMatch(/^Request #[a-f0-9]{32}$/);
    });
  });

  describe('equals assert', () => {
    it('should pass when output matches criteria exactly', async () => {
      mockGenerateText.mockResolvedValue({ output: '4' } as any);
      const config = makeTestConfig({
        asserts: [makeAssert({ name: ASSERT_NAMES.EQUALS, criteria: '4' })],
      });

      await runTest(config);

      expect(mockSaveTestResult).toHaveBeenCalledWith(
        expect.objectContaining({ passed: true }),
        expect.arrayContaining([
          expect.objectContaining({ name: 'equals', passed: true, score: 1 }),
        ]),
      );
    });

    it('should fail when output does not match criteria', async () => {
      mockGenerateText.mockResolvedValue({ output: '5' } as any);
      const config = makeTestConfig({
        asserts: [makeAssert({ name: ASSERT_NAMES.EQUALS, criteria: '4' })],
      });

      await runTest(config);

      expect(mockSaveTestResult).toHaveBeenCalledWith(
        expect.objectContaining({ passed: false }),
        expect.arrayContaining([
          expect.objectContaining({ name: 'equals', passed: false, score: 0 }),
        ]),
      );
    });

    it('should trim output before comparing', async () => {
      mockGenerateText.mockResolvedValue({ output: '  4  ' } as any);
      const config = makeTestConfig({
        asserts: [makeAssert({ name: ASSERT_NAMES.EQUALS, criteria: '4' })],
      });

      await runTest(config);

      expect(mockSaveTestResult).toHaveBeenCalledWith(
        expect.objectContaining({ passed: true }),
        expect.arrayContaining([
          expect.objectContaining({ passed: true }),
        ]),
      );
    });

    it('should be case-sensitive by default', async () => {
      mockGenerateText.mockResolvedValue({ output: 'Hello' } as any);
      const config = makeTestConfig({
        asserts: [makeAssert({ name: ASSERT_NAMES.EQUALS, criteria: 'hello' })],
      });

      await runTest(config);

      expect(mockSaveTestResult).toHaveBeenCalledWith(
        expect.objectContaining({ passed: false }),
        expect.arrayContaining([
          expect.objectContaining({ passed: false }),
        ]),
      );
    });

    it('should support case-insensitive comparison', async () => {
      mockGenerateText.mockResolvedValue({ output: 'Hello' } as any);
      const config = makeTestConfig({
        asserts: [makeAssert({
          name: ASSERT_NAMES.EQUALS,
          criteria: 'hello',
          case_sensitive: false,
        })],
      });

      await runTest(config);

      expect(mockSaveTestResult).toHaveBeenCalledWith(
        expect.objectContaining({ passed: true }),
        expect.arrayContaining([
          expect.objectContaining({ passed: true }),
        ]),
      );
    });
  });

  describe('not-equals assert', () => {
    it('should pass when output does not match criteria', async () => {
      mockGenerateText.mockResolvedValue({ output: '5' } as any);
      const config = makeTestConfig({
        asserts: [makeAssert({ name: ASSERT_NAMES.NOT_EQUALS, criteria: '4' })],
      });

      await runTest(config);

      expect(mockSaveTestResult).toHaveBeenCalledWith(
        expect.objectContaining({ passed: true }),
        expect.arrayContaining([
          expect.objectContaining({ name: 'not-equals', passed: true, score: 1 }),
        ]),
      );
    });

    it('should fail when output matches criteria', async () => {
      mockGenerateText.mockResolvedValue({ output: '4' } as any);
      const config = makeTestConfig({
        asserts: [makeAssert({ name: ASSERT_NAMES.NOT_EQUALS, criteria: '4' })],
      });

      await runTest(config);

      expect(mockSaveTestResult).toHaveBeenCalledWith(
        expect.objectContaining({ passed: false }),
        expect.arrayContaining([
          expect.objectContaining({ name: 'not-equals', passed: false, score: 0 }),
        ]),
      );
    });

    it('should support case-insensitive comparison', async () => {
      mockGenerateText.mockResolvedValue({ output: 'Hello' } as any);
      const config = makeTestConfig({
        asserts: [makeAssert({
          name: ASSERT_NAMES.NOT_EQUALS,
          criteria: 'hello',
          case_sensitive: false,
        })],
      });

      await runTest(config);

      expect(mockSaveTestResult).toHaveBeenCalledWith(
        expect.objectContaining({ passed: false }),
        expect.arrayContaining([
          expect.objectContaining({ passed: false }),
        ]),
      );
    });
  });

  describe('contains assert', () => {
    it('should pass when output contains criteria', async () => {
      mockGenerateText.mockResolvedValue({ output: 'The answer is 4.' } as any);
      const config = makeTestConfig({
        asserts: [makeAssert({ name: ASSERT_NAMES.CONTAINS, criteria: '4' })],
      });

      await runTest(config);

      expect(mockSaveTestResult).toHaveBeenCalledWith(
        expect.objectContaining({ passed: true }),
        expect.arrayContaining([
          expect.objectContaining({ name: 'contains', passed: true, score: 1 }),
        ]),
      );
    });

    it('should fail when output does not contain criteria', async () => {
      mockGenerateText.mockResolvedValue({ output: 'No match here.' } as any);
      const config = makeTestConfig({
        asserts: [makeAssert({ name: ASSERT_NAMES.CONTAINS, criteria: 'xyz' })],
      });

      await runTest(config);

      expect(mockSaveTestResult).toHaveBeenCalledWith(
        expect.objectContaining({ passed: false }),
        expect.arrayContaining([
          expect.objectContaining({ name: 'contains', passed: false, score: 0 }),
        ]),
      );
    });

    it('should support case-insensitive contains', async () => {
      mockGenerateText.mockResolvedValue({ output: 'Hello World' } as any);
      const config = makeTestConfig({
        asserts: [makeAssert({
          name: ASSERT_NAMES.CONTAINS,
          criteria: 'hello',
          case_sensitive: false,
        })],
      });

      await runTest(config);

      expect(mockSaveTestResult).toHaveBeenCalledWith(
        expect.objectContaining({ passed: true }),
        expect.arrayContaining([
          expect.objectContaining({ passed: true }),
        ]),
      );
    });
  });

  describe('not-contains assert', () => {
    it('should pass when output does not contain criteria', async () => {
      mockGenerateText.mockResolvedValue({ output: 'Hello World' } as any);
      const config = makeTestConfig({
        asserts: [makeAssert({ name: ASSERT_NAMES.NOT_CONTAINS, criteria: 'xyz' })],
      });

      await runTest(config);

      expect(mockSaveTestResult).toHaveBeenCalledWith(
        expect.objectContaining({ passed: true }),
        expect.arrayContaining([
          expect.objectContaining({ name: 'not-contains', passed: true, score: 1 }),
        ]),
      );
    });

    it('should fail when output contains criteria', async () => {
      mockGenerateText.mockResolvedValue({ output: 'Hello World' } as any);
      const config = makeTestConfig({
        asserts: [makeAssert({ name: ASSERT_NAMES.NOT_CONTAINS, criteria: 'Hello' })],
      });

      await runTest(config);

      expect(mockSaveTestResult).toHaveBeenCalledWith(
        expect.objectContaining({ passed: false }),
        expect.arrayContaining([
          expect.objectContaining({ name: 'not-contains', passed: false, score: 0 }),
        ]),
      );
    });

    it('should support case-insensitive not-contains', async () => {
      mockGenerateText.mockResolvedValue({ output: 'Hello World' } as any);
      const config = makeTestConfig({
        asserts: [makeAssert({
          name: ASSERT_NAMES.NOT_CONTAINS,
          criteria: 'hello',
          case_sensitive: false,
        })],
      });

      await runTest(config);

      expect(mockSaveTestResult).toHaveBeenCalledWith(
        expect.objectContaining({ passed: false }),
        expect.arrayContaining([
          expect.objectContaining({ passed: false }),
        ]),
      );
    });
  });

  describe('regex assert', () => {
    it('should pass when output matches regex pattern', async () => {
      mockGenerateText.mockResolvedValue({ output: 'The answer is 42.' } as any);
      const config = makeTestConfig({
        asserts: [makeAssert({ name: ASSERT_NAMES.REGEX, criteria: '\\d+' })],
      });

      await runTest(config);

      expect(mockSaveTestResult).toHaveBeenCalledWith(
        expect.objectContaining({ passed: true }),
        expect.arrayContaining([
          expect.objectContaining({ name: 'regex', passed: true, score: 1 }),
        ]),
      );
    });

    it('should fail when output does not match regex pattern', async () => {
      mockGenerateText.mockResolvedValue({ output: 'no numbers here' } as any);
      const config = makeTestConfig({
        asserts: [makeAssert({ name: ASSERT_NAMES.REGEX, criteria: '^\\d+$' })],
      });

      await runTest(config);

      expect(mockSaveTestResult).toHaveBeenCalledWith(
        expect.objectContaining({ passed: false }),
        expect.arrayContaining([
          expect.objectContaining({ name: 'regex', passed: false, score: 0 }),
        ]),
      );
    });
  });

  describe('llm-rubric assert', () => {
    it('should pass when llmRubric returns passing score above threshold', async () => {
      mockGenerateText.mockResolvedValue({ output: 'Good answer' } as any);
      mockLlmRubric.mockResolvedValue({ score: 0.9, reason: 'Great', pass: true });

      const config = makeTestConfig({
        asserts: [makeAssert({
          name: ASSERT_NAMES.LLM_RUBRIC,
          criteria: 'Is the answer helpful?',
          provider: 'openai',
          model: 'gpt-4o',
          threshold: 0.5,
        })],
      });

      await runTest(config);

      expect(mockLlmRubric).toHaveBeenCalledWith(
        'Good answer',
        'Is the answer helpful?',
        'openai',
        'gpt-4o',
        expect.objectContaining({ temperature: 0.0 }),
      );
      expect(mockSaveTestResult).toHaveBeenCalledWith(
        expect.objectContaining({ passed: true }),
        expect.arrayContaining([
          expect.objectContaining({ name: 'llm-rubric', passed: true, score: 0.9 }),
        ]),
      );
    });

    it('should fail when llmRubric returns pass=false', async () => {
      mockGenerateText.mockResolvedValue({ output: 'Bad answer' } as any);
      mockLlmRubric.mockResolvedValue({ score: 0.8, reason: 'Not great', pass: false });

      const config = makeTestConfig({
        asserts: [makeAssert({
          name: ASSERT_NAMES.LLM_RUBRIC,
          criteria: 'Is the answer helpful?',
          provider: 'openai',
          model: 'gpt-4o',
          threshold: 0.5,
        })],
      });

      await runTest(config);

      expect(mockSaveTestResult).toHaveBeenCalledWith(
        expect.objectContaining({ passed: false }),
        expect.arrayContaining([
          expect.objectContaining({ name: 'llm-rubric', passed: false }),
        ]),
      );
    });

    it('should fail when score is below threshold', async () => {
      mockGenerateText.mockResolvedValue({ output: 'Bad answer' } as any);
      mockLlmRubric.mockResolvedValue({ score: 0.3, reason: 'Poor', pass: true });

      const config = makeTestConfig({
        asserts: [makeAssert({
          name: ASSERT_NAMES.LLM_RUBRIC,
          criteria: 'Is the answer helpful?',
          provider: 'openai',
          model: 'gpt-4o',
          threshold: 0.5,
        })],
      });

      await runTest(config);

      expect(mockSaveTestResult).toHaveBeenCalledWith(
        expect.objectContaining({ passed: false }),
        expect.arrayContaining([
          expect.objectContaining({ name: 'llm-rubric', passed: false, score: 0.3 }),
        ]),
      );
    });

    it('should include must_fail in metadata when set', async () => {
      mockGenerateText.mockResolvedValue({ output: 'answer' } as any);
      mockLlmRubric.mockResolvedValue({ score: 0.9, reason: 'Ok', pass: true });

      const config = makeTestConfig({
        asserts: [makeAssert({
          name: ASSERT_NAMES.LLM_RUBRIC,
          criteria: 'criteria',
          provider: 'openai',
          model: 'gpt-4o',
          must_fail: true,
        })],
      });

      await runTest(config);

      expect(mockSaveTestResult).toHaveBeenCalledWith(
        expect.objectContaining({ passed: false }),
        expect.arrayContaining([
          expect.objectContaining({
            metadata: expect.objectContaining({ must_fail: true }),
          }),
        ]),
      );
    });
  });

  describe('g-eval assert', () => {
    it('should pass when gEval returns score above threshold', async () => {
      mockGenerateText.mockResolvedValue({ output: 'Good answer' } as any);
      mockGEval.mockResolvedValue({ score: 0.8, reason: 'Good' });

      const config = makeTestConfig({
        asserts: [makeAssert({
          name: ASSERT_NAMES.GEVAL,
          criteria: 'Is coherent?',
          provider: 'openai',
          model: 'gpt-4o',
          threshold: 0.5,
        })],
      });

      await runTest(config);

      expect(mockGEval).toHaveBeenCalledWith(
        { query: 'What is 2+2?', answer: 'Good answer' },
        'Is coherent?',
        'openai',
        'gpt-4o',
        expect.objectContaining({ temperature: 0.0 }),
      );
      expect(mockSaveTestResult).toHaveBeenCalledWith(
        expect.objectContaining({ passed: true }),
        expect.arrayContaining([
          expect.objectContaining({ name: 'g-eval', passed: true }),
        ]),
      );
    });

    it('should use answer_only mode when set', async () => {
      mockGenerateText.mockResolvedValue({ output: 'Just the answer' } as any);
      mockGEval.mockResolvedValue({ score: 0.9, reason: 'Great' });

      const config = makeTestConfig({
        asserts: [makeAssert({
          name: ASSERT_NAMES.GEVAL,
          criteria: 'Is correct?',
          provider: 'openai',
          model: 'gpt-4o',
          answer_only: true,
        })],
      });

      await runTest(config);

      expect(mockGEval).toHaveBeenCalledWith(
        'Just the answer',
        'Is correct?',
        'openai',
        'gpt-4o',
        expect.any(Object),
      );
    });

    it('should fail when gEval score is below threshold', async () => {
      mockGenerateText.mockResolvedValue({ output: 'Bad' } as any);
      mockGEval.mockResolvedValue({ score: 0.2, reason: 'Poor' });

      const config = makeTestConfig({
        asserts: [makeAssert({
          name: ASSERT_NAMES.GEVAL,
          criteria: 'Is correct?',
          provider: 'openai',
          model: 'gpt-4o',
          threshold: 0.5,
        })],
      });

      await runTest(config);

      expect(mockSaveTestResult).toHaveBeenCalledWith(
        expect.objectContaining({ passed: false }),
        expect.arrayContaining([
          expect.objectContaining({ name: 'g-eval', passed: false }),
        ]),
      );
    });
  });

  describe('b-eval assert', () => {
    it('should pass when bEval returns score above threshold', async () => {
      mockGenerateText.mockResolvedValue({ output: 'Good answer' } as any);
      mockBEval.mockResolvedValue({ score: 0.8, reason: 'Good' });

      const config = makeTestConfig({
        asserts: [makeAssert({
          name: ASSERT_NAMES.BEVAL,
          criteria: 'Is fluent?',
          provider: 'openai',
          model: 'gpt-4o',
          threshold: 0.5,
        })],
      });

      await runTest(config);

      expect(mockBEval).toHaveBeenCalledWith(
        { query: 'What is 2+2?', answer: 'Good answer' },
        'Is fluent?',
        'openai',
        'gpt-4o',
        expect.objectContaining({ temperature: 0.0 }),
      );
      expect(mockSaveTestResult).toHaveBeenCalledWith(
        expect.objectContaining({ passed: true }),
        expect.arrayContaining([
          expect.objectContaining({ name: 'b-eval', passed: true }),
        ]),
      );
    });

    it('should use answer_only mode when set', async () => {
      mockGenerateText.mockResolvedValue({ output: 'Only answer' } as any);
      mockBEval.mockResolvedValue({ score: 0.9, reason: 'Great' });

      const config = makeTestConfig({
        asserts: [makeAssert({
          name: ASSERT_NAMES.BEVAL,
          criteria: 'Is correct?',
          provider: 'openai',
          model: 'gpt-4o',
          answer_only: true,
        })],
      });

      await runTest(config);

      expect(mockBEval).toHaveBeenCalledWith(
        'Only answer',
        'Is correct?',
        'openai',
        'gpt-4o',
        expect.any(Object),
      );
    });
  });

  describe('unsupported assert', () => {
    it('should handle unsupported assert names gracefully', async () => {
      mockGenerateText.mockResolvedValue({ output: 'test' } as any);
      const config = makeTestConfig({
        asserts: [makeAssert({ name: 'unknown-assert' as any, criteria: 'x' })],
      });

      await runTest(config);

      expect(mockSaveTestResult).toHaveBeenCalledWith(
        expect.objectContaining({ passed: false }),
        expect.arrayContaining([
          expect.objectContaining({
            passed: false,
            score: 0,
            reason: expect.stringContaining('Unsupported matcher'),
          }),
        ]),
      );
    });
  });

  describe('must_fail / xnor logic', () => {
    it('should invert pass result when must_fail is true and assert passes', async () => {
      mockGenerateText.mockResolvedValue({ output: '4' } as any);
      mockLlmRubric.mockResolvedValue({ score: 0.9, reason: 'Ok', pass: true });

      const config = makeTestConfig({
        asserts: [makeAssert({
          name: ASSERT_NAMES.LLM_RUBRIC,
          criteria: 'criteria',
          provider: 'openai',
          model: 'gpt-4o',
          must_fail: true,
        })],
      });

      await runTest(config);

      // assert itself passes but must_fail=true means test should fail
      expect(mockSaveTestResult).toHaveBeenCalledWith(
        expect.objectContaining({ passed: false }),
        expect.any(Array),
      );
    });

    it('should mark test as passed when must_fail is true and assert fails', async () => {
      mockGenerateText.mockResolvedValue({ output: 'bad' } as any);
      mockLlmRubric.mockResolvedValue({ score: 0.2, reason: 'Bad', pass: false });

      const config = makeTestConfig({
        asserts: [makeAssert({
          name: ASSERT_NAMES.LLM_RUBRIC,
          criteria: 'criteria',
          provider: 'openai',
          model: 'gpt-4o',
          must_fail: true,
        })],
      });

      await runTest(config);

      // assert fails and must_fail=true => xnor(false, true) = false... 
      // Actually xnor(passed=false, !must_fail=false) = xnor(false, false) = true
      expect(mockSaveTestResult).toHaveBeenCalledWith(
        expect.objectContaining({ passed: true }),
        expect.any(Array),
      );
    });
  });

  describe('multiple asserts', () => {
    it('should run all asserts and pass only if all pass', async () => {
      mockGenerateText.mockResolvedValue({ output: '4' } as any);
      const config = makeTestConfig({
        asserts: [
          makeAssert({ name: ASSERT_NAMES.EQUALS, criteria: '4' }),
          makeAssert({ name: ASSERT_NAMES.CONTAINS, criteria: '4' }),
        ],
      });

      await runTest(config);

      expect(mockSaveTestResult).toHaveBeenCalledWith(
        expect.objectContaining({ passed: true }),
        expect.arrayContaining([
          expect.objectContaining({ name: 'equals', passed: true }),
          expect.objectContaining({ name: 'contains', passed: true }),
        ]),
      );
    });

    it('should fail if any assert fails', async () => {
      mockGenerateText.mockResolvedValue({ output: '4' } as any);
      const config = makeTestConfig({
        asserts: [
          makeAssert({ name: ASSERT_NAMES.EQUALS, criteria: '4' }),
          makeAssert({ name: ASSERT_NAMES.CONTAINS, criteria: 'xyz' }),
        ],
      });

      await runTest(config);

      expect(mockSaveTestResult).toHaveBeenCalledWith(
        expect.objectContaining({ passed: false }),
        expect.any(Array),
      );
    });
  });

  describe('error handling', () => {
    it('should catch assert errors and return score 0 with error reason', async () => {
      mockGenerateText.mockResolvedValue({ output: 'test' } as any);
      mockLlmRubric.mockRejectedValue(new Error('API timeout'));

      const config = makeTestConfig({
        asserts: [makeAssert({
          name: ASSERT_NAMES.LLM_RUBRIC,
          criteria: 'criteria',
          provider: 'openai',
          model: 'gpt-4o',
        })],
      });

      await runTest(config);

      expect(mockSaveTestResult).toHaveBeenCalledWith(
        expect.objectContaining({ passed: false }),
        expect.arrayContaining([
          expect.objectContaining({
            passed: false,
            score: 0,
            reason: expect.stringContaining('API timeout'),
          }),
        ]),
      );
    });

    it('should handle non-Error thrown values', async () => {
      mockGenerateText.mockResolvedValue({ output: 'test' } as any);
      mockLlmRubric.mockRejectedValue('string error');

      const config = makeTestConfig({
        asserts: [makeAssert({
          name: ASSERT_NAMES.LLM_RUBRIC,
          criteria: 'c',
          provider: 'openai',
          model: 'gpt-4o',
        })],
      });

      await runTest(config);

      expect(mockSaveTestResult).toHaveBeenCalledWith(
        expect.any(Object),
        expect.arrayContaining([
          expect.objectContaining({
            reason: expect.stringContaining('string error'),
          }),
        ]),
      );
    });
  });

  describe('test result structure', () => {
    it('should save test result with correct timing fields', async () => {
      mockGenerateText.mockResolvedValue({ output: '4' } as any);
      const config = makeTestConfig({
        asserts: [makeAssert({ name: ASSERT_NAMES.EQUALS, criteria: '4' })],
      });

      await runTest(config);

      const testResult = mockSaveTestResult.mock.calls[0][0];
      expect(testResult.id).toBe('11111111-2222-3333-4444-555555555555');
      expect(testResult.run_id).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      expect(testResult.provider).toBe('openai');
      expect(testResult.model).toBe('gpt-4o');
      expect(testResult.prompt).toBe('What is 2+2?');
      expect(testResult.output).toBe('4');
      expect(testResult.started_at).toBeInstanceOf(Date);
      expect(testResult.assert_started_at).toBeInstanceOf(Date);
      expect(testResult.finished_at).toBeInstanceOf(Date);
      expect(testResult.diff_ms).toBeGreaterThanOrEqual(0);
      expect(testResult.assert_diff_ms).toBeGreaterThanOrEqual(0);
      expect(testResult.output_diff_ms).toBeGreaterThanOrEqual(0);
    });

    it('should include temperature in metadata when specified in options', async () => {
      mockGenerateText.mockResolvedValue({ output: '4' } as any);
      const config = makeTestConfig({
        options: { temperature: 0.5 },
        asserts: [makeAssert({ name: ASSERT_NAMES.EQUALS, criteria: '4' })],
      });

      await runTest(config);

      const testResult = mockSaveTestResult.mock.calls[0][0];
      expect(testResult.metadata).toEqual({ temperature: 0.5 });
    });

    it('should not include metadata when temperature is not in options', async () => {
      mockGenerateText.mockResolvedValue({ output: '4' } as any);
      const config = makeTestConfig({
        asserts: [makeAssert({ name: ASSERT_NAMES.EQUALS, criteria: '4' })],
      });

      await runTest(config);

      const testResult = mockSaveTestResult.mock.calls[0][0];
      expect(testResult.metadata).toBeUndefined();
    });
  });

  describe('assert result structure', () => {
    it('should include timing fields in assert results', async () => {
      mockGenerateText.mockResolvedValue({ output: '4' } as any);
      const config = makeTestConfig({
        asserts: [makeAssert({ name: ASSERT_NAMES.EQUALS, criteria: '4' })],
      });

      await runTest(config);

      const assertResults = mockSaveTestResult.mock.calls[0][1];
      expect(assertResults[0].started_at).toBeInstanceOf(Date);
      expect(assertResults[0].finished_at).toBeInstanceOf(Date);
      expect(assertResults[0].diff_ms).toBeGreaterThanOrEqual(0);
    });

    it('should include case_sensitive in metadata for text asserts', async () => {
      mockGenerateText.mockResolvedValue({ output: '4' } as any);
      const config = makeTestConfig({
        asserts: [makeAssert({ name: ASSERT_NAMES.EQUALS, criteria: '4' })],
      });

      await runTest(config);

      const assertResults = mockSaveTestResult.mock.calls[0][1];
      expect(assertResults[0].metadata).toEqual({ case_sensitive: true });
    });

    it('should include provider and model in metadata for llm asserts', async () => {
      mockGenerateText.mockResolvedValue({ output: 'answer' } as any);
      mockLlmRubric.mockResolvedValue({ score: 0.9, reason: 'Good', pass: true });

      const config = makeTestConfig({
        asserts: [makeAssert({
          name: ASSERT_NAMES.LLM_RUBRIC,
          criteria: 'criteria',
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
        })],
      });

      await runTest(config);

      const assertResults = mockSaveTestResult.mock.calls[0][1];
      expect(assertResults[0].metadata).toEqual(expect.objectContaining({
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        temperature: 0.0,
      }));
    });
  });

  describe('default options behavior', () => {
    it('should set temperature to 0.0 by default for asserts', async () => {
      mockGenerateText.mockResolvedValue({ output: 'test' } as any);
      mockGEval.mockResolvedValue({ score: 0.9, reason: 'Great' });

      const config = makeTestConfig({
        asserts: [makeAssert({
          name: ASSERT_NAMES.GEVAL,
          criteria: 'criteria',
          provider: 'openai',
          model: 'gpt-4o',
        })],
      });

      await runTest(config);

      expect(mockGEval).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ temperature: 0.0 }),
      );
    });

    it('should preserve custom temperature when provided in assert options', async () => {
      mockGenerateText.mockResolvedValue({ output: 'test' } as any);
      mockGEval.mockResolvedValue({ score: 0.9, reason: 'Great' });

      const config = makeTestConfig({
        asserts: [makeAssert({
          name: ASSERT_NAMES.GEVAL,
          criteria: 'criteria',
          provider: 'openai',
          model: 'gpt-4o',
          options: { temperature: 0.7 },
        })],
      });

      await runTest(config);

      expect(mockGEval).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ temperature: 0.7 }),
      );
    });

    it('should use default threshold of 0.5 when not specified', async () => {
      mockGenerateText.mockResolvedValue({ output: 'test' } as any);
      mockGEval.mockResolvedValue({ score: 0.6, reason: 'OK' });

      const config = makeTestConfig({
        asserts: [makeAssert({
          name: ASSERT_NAMES.GEVAL,
          criteria: 'criteria',
          provider: 'openai',
          model: 'gpt-4o',
        })],
      });

      await runTest(config);

      expect(mockSaveTestResult).toHaveBeenCalledWith(
        expect.objectContaining({ passed: true }),
        expect.arrayContaining([
          expect.objectContaining({ passed: true, threshold: 0.5 }),
        ]),
      );
    });
  });
});
