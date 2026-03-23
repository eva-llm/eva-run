import { generateText } from 'ai';
import {
  llmRubric,
  gEval,
} from '@eva-llm/eva-judge';

import { getModel } from './registry';
import {
  ASSERT_NAMES,
  IAssertResult,
  type TestSchemaT,
  type AssertSchemaT,
} from './schemas';
import { saveTestResult } from './db';


const getMatcherResult = async (
  prompt: string,
  output: string,
  assert: AssertSchemaT,
): Promise<IAssertResult> => {
  const threshold = assert.threshold ?? 0.5;

  switch(assert.name) {
    case ASSERT_NAMES.GEVAL: {
      const result = await gEval(
        prompt,
        output,
        assert.criteria,
        assert.provider,
        assert.model,
      );

      return {
        name: assert.name,
        score: result.score,
        reason: result.reason,
        passed: result.score > threshold,
      };
    }
    case ASSERT_NAMES.LLM_RUBRIC: {
      const result = await llmRubric(
        output,
        assert.criteria,
        assert.provider,
        assert.model,
      );

      return {
        name: assert.name,
        score: result.score,
        reason: result.reason,
        passed: result.pass && result.score > threshold,
      };
    }
    default:
      throw new Error(`Unsupported matcher: ${assert.name}`);
  }
};

export default async function (testConfig: TestSchemaT): Promise<void> {
  const { output } = await generateText({
    model: getModel(testConfig.provider, testConfig.model),
    prompt: testConfig.prompt,
  });

  const results: IAssertResult[] = [];
  const settledResults = await Promise.allSettled(
    testConfig.asserts.map(
      assert => getMatcherResult(testConfig.prompt, output, assert))
  );

  settledResults.forEach((settled, idx) => {
    if (settled.status === 'fulfilled') {
      results.push(settled.value);

    } else {
      results.push({
        name: testConfig.asserts[idx].name,
        passed: false,
        score: 0,
        reason: `Matcher failed with error: ${settled.reason instanceof Error ? settled.reason.message : String(settled.reason)}`,
      });
    }
  });

  const isPassed = results.every(r => r.passed);

  await saveTestResult(
    testConfig.run_id,
    testConfig.test_id!,
    testConfig.prompt,
    output,
    isPassed,
    results
  );
}
