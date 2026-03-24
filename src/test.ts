import { generateText } from 'ai';
import {
  llmRubric,
  gEval,
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

  try {
    const name = assert.name;
    const threshold = assert.threshold ?? 0.5;

    let score: number;
    let reason: string;
    let passed: boolean;

    switch(name) {
      case ASSERT_NAMES.GEVAL: {
        ({ score, reason } = await limit(() => gEval(
          prompt,
          output,
          assert.criteria,
          assert.provider,
          assert.model,
        )));
        passed = score > threshold;

        break;
      }
      case ASSERT_NAMES.LLM_RUBRIC: {
        const result = await limit(() => llmRubric(
          output,
          assert.criteria,
          assert.provider,
          assert.model,
        ));

        ({ score, reason } = result);
        passed = result.pass && score > threshold;

        break;
      }
      default:
        throw new Error(`Unsupported matcher: ${name}`);
    }

    const assertFinishedAt = new Date();
    const assertDiffMs = assertFinishedAt.getTime() - assertStartedAt.getTime();

    return {
      name,
      score,
      reason,
      passed,
      started_at: assertStartedAt,
      finished_at: assertFinishedAt,
      diff_ms: assertDiffMs,
    };

  } catch (e) {
    const assertFinishedAt = new Date();
    const assertDiffMs = assertFinishedAt.getTime() - assertStartedAt.getTime();

    return {
      name: assert.name,
      passed: false,
      score: 0,
      reason: `Assert failed with error: ${e instanceof Error ? e.message : String(e)}`,
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
  const { prompt } = testConfig;
  const { output } = await limit(() => generateText({
    model: getModel(testConfig.provider, testConfig.model),
    prompt,
  }));

  const results: IAssertResult[] = [];
  const assertStartedAt = new Date();
  const settledResults = await Promise.allSettled(
    testConfig.asserts.map(assert => getAssertResult(prompt, output, assert))
  );

  settledResults.forEach((settled, idx) => {
    if (settled.status === 'fulfilled') {
      results.push(settled.value);
    } else { // NOTE: Fatal error
      results.push({
        name: testConfig.asserts[idx].name,
        passed: false,
        score: 0,
        reason: `Critical Runtime Error: ${settled.reason}`,
        started_at: new Date(),
        finished_at: new Date(),
        diff_ms: 0
      });
    }
  });

  const isPassed = results.every(r => r.passed);
  const testFinishedAt = new Date();
  const testDiffMs = testFinishedAt.getTime() - testStartedAt.getTime();
  const assertDiffMs = testFinishedAt.getTime() - assertStartedAt.getTime();
  const outputDiffMs = assertStartedAt.getTime() - testStartedAt.getTime();

  await saveTestResult(
    testConfig.run_id,
    testConfig.test_id!,
    prompt,
    output,
    isPassed,
    testStartedAt,
    testFinishedAt,
    testDiffMs,
    assertStartedAt,
    assertDiffMs,
    outputDiffMs,
    results,
  );
}
