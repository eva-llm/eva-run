import crypto from 'node:crypto';
import { generateText } from 'ai';
import {
  llmRubric,
  gEval,
  bEval,
} from '@eva-llm/eva-judge';
import pLimit from 'p-limit';
import { LRUCache } from 'lru-cache';

import { getModel } from './registry';
import {
  ASSERT_NAMES,
  type IAssertResult,
  type TAssertSchema,
  type ITestResult,
  type TTestSchema,
} from './schemas';
import { saveTestResult } from './db';
import { yieldEventLoop, xnor } from './utils';


let syncOpsCounter = 0;
const SYNC_OPS_THRESHOLD = 1000; // NOTE: replace with env var if it needs
const regexCache = new LRUCache<string, RegExp>({ max: 1000 }); // NOTE: replace with env var if it needs
const limit = pLimit(Number(process.env.LLM_PROVIDER_CONCURRENCY || 200)); // NOTE: To avoid overwhelming the system with too many concurrent requests, especially when using resource-intensive providers.
const getHashId = () => crypto.randomBytes(16).toString('hex'); // NOTE: 16 bytes = 128 bits of entropy, should be sufficient for uniqueness in prompts

/**
 * Runs the assert for a given assert configuration and returns the result.
 * @param {string} prompt - The prompt string.
 * @param {string} output - The output string.
 * @param {TAssertSchema} assert - The assert configuration.
 * @returns {Promise<IAssertResult>} The result of the assert.
 */
const getAssertResult = async (
  prompt: string,
  output: string,
  assert: TAssertSchema,
): Promise<IAssertResult> => {
  const assertStartedAt = new Date();
  const { 
    name,
    criteria,
    threshold = 0.5,
    options = {},
    case_sensitive: caseSensitive = true,
    answer_only: answerOnly = false,
  } = assert;

  if (options.temperature === undefined) {
    options.temperature = 0.0; // NOTE: Recommended for judging
  }

  try {  
    let score: number;
    let reason: string;
    let passed: boolean;
    let metadata: Record<string, any> | undefined;

    switch(name) {
      case ASSERT_NAMES.EQUALS: {
        // NOTE: performance over elegance - no extra async function
        syncOpsCounter++;
        if (syncOpsCounter >= SYNC_OPS_THRESHOLD) {
          syncOpsCounter = 0;
          await yieldEventLoop();
        }
        // NOTE: if it will become complex, move to function.
        passed = caseSensitive
          ? output.trim() === String(criteria)
          : output.trim().toLowerCase() === String(criteria).toLowerCase();
        score = passed ? 1 : 0;
        reason = passed
          ? 'Output equals the criteria.'
          : 'Output does not equal the criteria.';
        metadata = {
          case_sensitive: caseSensitive,
        };

        break;
      }
      case ASSERT_NAMES.NOT_EQUALS: {
        syncOpsCounter++;
        if (syncOpsCounter >= SYNC_OPS_THRESHOLD) {
          syncOpsCounter = 0;
          await yieldEventLoop();
        }

        passed = caseSensitive
          ? output.trim() !== String(criteria)
          : output.trim().toLowerCase() !== String(criteria).toLowerCase();
        score = passed ? 1 : 0;
        reason = passed
          ? 'Output does not equal the criteria.'
          : 'Output equals the criteria.';
        metadata = {
          case_sensitive: caseSensitive,
        };

        break;
      }
      case ASSERT_NAMES.CONTAINS: {
        syncOpsCounter++;
        if (syncOpsCounter >= SYNC_OPS_THRESHOLD) {
          syncOpsCounter = 0;
          await yieldEventLoop();
        }

        passed = caseSensitive
          ? output.includes(String(criteria))
          : output.toLowerCase().includes(String(criteria).toLowerCase());
        score = passed ? 1 : 0;
        reason = passed
          ? 'Output contains the criteria.'
          : 'Output does not contain the criteria.';
        metadata = {
          case_sensitive: caseSensitive,
        };

        break;
      }
      case ASSERT_NAMES.NOT_CONTAINS: {
        syncOpsCounter++;
        if (syncOpsCounter >= SYNC_OPS_THRESHOLD) {
          syncOpsCounter = 0;
          await yieldEventLoop();
        }

        passed = caseSensitive
          ? !output.includes(String(criteria))
          : !output.toLowerCase().includes(String(criteria).toLowerCase());
        score = passed ? 1 : 0;
        reason = passed
          ? 'Output does not contain the criteria.'
          : 'Output contains the criteria.';
        metadata = {
          case_sensitive: caseSensitive,
        };

        break;
      }
      case ASSERT_NAMES.REGEX: {
        syncOpsCounter++;
        if (syncOpsCounter >= SYNC_OPS_THRESHOLD) {
          syncOpsCounter = 0;
          await yieldEventLoop();
        }

        const str = String(criteria);
        let pattern = regexCache.get(str);

        if (!pattern) {
          pattern = new RegExp(str);
          regexCache.set(str, pattern);
        }

        passed = pattern.test(output);
        score = passed ? 1 : 0;
        reason = passed
          ? 'Output matches regex criteria.'
          : 'Output does not match regex criteria.';

        break;
      }
      case ASSERT_NAMES.BEVAL: {
        syncOpsCounter = 0;
        ({ score, reason } = await limit(() => bEval(
          answerOnly ? output : { query: prompt, answer: output },
          criteria,
          assert.provider!,
          assert.model!,
          options,
        )));
        passed = score > threshold;
        metadata = {
          provider: assert.provider!,
          model: assert.model!,
          ...options,
        };

        if (assert.must_fail !== undefined) {
          metadata.must_fail = assert.must_fail;
        }

        break;
      }
      case ASSERT_NAMES.GEVAL: {
        syncOpsCounter = 0;
        ({ score, reason } = await limit(() => gEval(
          answerOnly ? output : { query: prompt, answer: output },
          criteria,
          assert.provider!,
          assert.model!,
          options,
        )));
        passed = score > threshold;
        metadata = {
          provider: assert.provider!,
          model: assert.model!,
          ...options,
        };

        if (assert.must_fail !== undefined) {
          metadata.must_fail = assert.must_fail;
        }

        break;
      }
      case ASSERT_NAMES.LLM_RUBRIC: {
        syncOpsCounter = 0;
        const result = await limit(() => llmRubric(
          output,
          criteria,
          assert.provider!,
          assert.model!,
          options,
        ));

        ({ score, reason } = result);
        passed = result.pass && score > threshold;
        metadata = {
          provider: assert.provider!,
          model: assert.model!,
          ...options,
        };

        if (assert.must_fail !== undefined) {
          metadata.must_fail = assert.must_fail;
        }

        break;
      }
      default:
        throw new Error(`Unsupported matcher: ${name}`);
    }

    const assertFinishedAt = new Date();
    const assertDiffMs = assertFinishedAt.getTime() - assertStartedAt.getTime();

    return {
      name,
      criteria,
      score,
      reason,
      passed,
      threshold,
      metadata,
      started_at: assertStartedAt,
      finished_at: assertFinishedAt,
      diff_ms: assertDiffMs,
    };

  } catch (e) {
    const assertFinishedAt = new Date();
    const assertDiffMs = assertFinishedAt.getTime() - assertStartedAt.getTime();

    return {
      name,
      criteria,
      passed: false,
      score: 0,
      reason: `Assert failed with error: ${e instanceof Error ? e.message : String(e)}`,
      threshold,
      started_at: assertStartedAt,
      finished_at: assertFinishedAt,
      diff_ms: assertDiffMs,
    };
  }
};

/**
 * Runs a test using the provided configuration, generates output, evaluates asserts, and saves results.
 * @param {TTestSchema} testConfig - The test configuration.
 * @returns {Promise<void>} Resolves when the test and all asserts are processed and saved.
 */
export default async function (testConfig: TTestSchema): Promise<void> {
  const testStartedAt = new Date();
  const { prompt } = testConfig;
  const testData: Record<string, any> = {};

  let metadata: Record<string, any>;
  let output: string;

  if ('output' in testConfig) {
    output = testConfig.output!;

    metadata = {
      output_override: true,
    };
  } else {
    const { provider, model, options = {} } = testConfig;

    ({ output } = await limit(() => generateText({
      ...options, // NOTE: Forward Vercel ai-sdk options can include temperature, max_tokens, etc.
      messages: undefined, // NOTE: for role-based scenarios `llm-as-a-jest` plugin should be used.
      tools: undefined, // NOTE: for tool-using scenarios `llm-as-a-jest` plugin should be used.
      model: getModel(provider, model),
      system: `Request #${getHashId()}`,
      prompt,
    })));

    testData.provider = provider;
    testData.model = model;
    metadata = options;
  }

  const assertStartedAt = new Date();
  const settledResults = await Promise.allSettled(
    testConfig.asserts.map(assert => getAssertResult(prompt, output, assert))
  );

  const assertResults = settledResults.map((settled, idx) => {
    if (settled.status === 'fulfilled') {
      return settled.value;
    }
    return { // NOTE: Abnormal error
      name: testConfig.asserts[idx].name,
      criteria: testConfig.asserts[idx].criteria,
      passed: false,
      score: 0,
      reason: `Critical Runtime Error: ${settled.reason}`,
      threshold: 0.0,
      started_at: new Date(),
      finished_at: new Date(),
      diff_ms: 0
    };
  });

  const testFinishedAt = new Date();
  const isPassed = assertResults.length
    ? assertResults.every(r => xnor(r.passed, !r.metadata?.must_fail))
    : false; // NOTE: philosophy: no asserts - not passed

  const testResult: ITestResult = {
    id: testConfig.test_id!,
    run_id: testConfig.run_id,
    ...testData,
    prompt,
    output,
    passed: isPassed,
    started_at: testStartedAt,
    assert_started_at: assertStartedAt,
    finished_at: testFinishedAt,
    diff_ms: testFinishedAt.getTime() - testStartedAt.getTime(),
    assert_diff_ms: testFinishedAt.getTime() - assertStartedAt.getTime(),
    output_diff_ms: assertStartedAt.getTime() - testStartedAt.getTime(),
  }

  if (Object.keys(metadata).length) { // NOTE: A bit quicker isEmpty = o => { for (const _ in o) return false; return true; }
    testResult.metadata = metadata;
  }

  saveTestResult(testResult, assertResults); // NOTE: await is useless, a) it adds minor performance overhead, b) we don't need to guarantee that the result is saved before proceeding, c) it can be done in background and doesn't affect the test result.
}
