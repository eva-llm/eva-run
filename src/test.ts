import { generateText } from 'ai';
import {
  llmRubric,
  gEval,
  bEval,
} from '@eva-llm/eva-judge';
import pLimit from 'p-limit';

import { getModel } from './registry';
import {
  ASSERT_NAMES,
  IAssertResult,
  type TestSchemaT,
  type AssertSchemaT,
} from './schemas';
import { saveTestResult } from './db';


const CONSERVATIVE_LIMIT = 200; // NOTE: To avoid overwhelming the system with too many concurrent requests, especially when using resource-intensive providers.
const limit = pLimit(CONSERVATIVE_LIMIT);

/**
 * Runs the assert for a given assert configuration and returns the result.
 * @param {string} prompt - The prompt string.
 * @param {string} output - The output string.
 * @param {AssertSchemaT} assert - The assert configuration.
 * @returns {Promise<IAssertResult>} The result of the assert.
 */
const getAssertResult = async (
  prompt: string,
  output: string,
  assert: AssertSchemaT,
): Promise<IAssertResult> => {
  const assertStartedAt = new Date();
  const { 
    name,
    criteria,
    threshold = 0.5,
    temperature = 0.0, // NOTE: Recommended for judging
    case_sensitive: caseSensitive = true,
    answer_only: answerOnly = false,
  } = assert;

  try {  
    let score: number;
    let reason: string;
    let passed: boolean;
    let metadata: Record<string, any> | undefined;

    switch(name) {
      case ASSERT_NAMES.EQUALS: {
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
        const pattern = new RegExp(String(criteria));

        passed = pattern.test(output);
        score = passed ? 1 : 0;
        reason = passed
          ? 'Output matches regex criteria.'
          : 'Output does not match regex criteria.';

        break;
      }
      case ASSERT_NAMES.BEVAL: {
        ({ score, reason } = await limit(() => bEval(
          answerOnly ? output : { query: prompt, answer: output },
          criteria,
          assert.provider!,
          assert.model!,
          { temperature },
        )));
        passed = score > threshold;
        metadata = {
          provider: assert.provider!,
          model: assert.model!,
          temperature,
        };

        if (assert.must_fail !== undefined) {
          metadata.must_fail = assert.must_fail;
        }

        break;
      }
      case ASSERT_NAMES.GEVAL: {
        ({ score, reason } = await limit(() => gEval(
          answerOnly ? output : { query: prompt, answer: output },
          criteria,
          assert.provider!,
          assert.model!,
          { temperature },
        )));
        passed = score > threshold;
        metadata = {
          provider: assert.provider!,
          model: assert.model!,
          temperature,
        };

        if (assert.must_fail !== undefined) {
          metadata.must_fail = assert.must_fail;
        }

        break;
      }
      case ASSERT_NAMES.LLM_RUBRIC: {
        const result = await limit(() => llmRubric(
          output,
          criteria,
          assert.provider!,
          assert.model!,
          { temperature },
        ));

        ({ score, reason } = result);
        passed = result.pass && score > threshold;
        metadata = {
          provider: assert.provider!,
          model: assert.model!,
          temperature,
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
 * @param {TestSchemaT} testConfig - The test configuration.
 * @returns {Promise<void>} Resolves when the test and all asserts are processed and saved.
 */
export default async function (testConfig: TestSchemaT): Promise<void> {
  const testStartedAt = new Date();
  const { prompt, provider, model } = testConfig;
  const { output } = await limit(() => generateText({
    model: getModel(provider, model),
    prompt,
  }));

  const assertStartedAt = new Date();
  const settledResults = await Promise.allSettled(
    testConfig.asserts.map(assert => getAssertResult(prompt, output, assert))
  );

  const results = settledResults.map((settled, idx) => {
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
  const isPassed = results.every(r => r.passed && (!r.metadata?.must_fail));

  await saveTestResult({
    id: testConfig.test_id!,
    run_id: testConfig.run_id,
    provider,
    model,
    prompt,
    output,
    passed: isPassed,
    started_at: testStartedAt,
    assert_started_at: assertStartedAt,
    finished_at: testFinishedAt,
    diff_ms: testFinishedAt.getTime() - testStartedAt.getTime(),
    assert_diff_ms: testFinishedAt.getTime() - assertStartedAt.getTime(),
    output_diff_ms: assertStartedAt.getTime() - testStartedAt.getTime(),
  }, results);
}
