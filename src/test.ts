import { generateText } from 'ai';
import { llmRubric, gEval } from '@eva-llm/eva-judge';

import { getModel } from './registry';
import { type EvalRequestType, type MatcherSchemaType } from './handlers/eval';
import { saveTestResult } from './db';

interface MatcherResult {
  passed: boolean;
  score: number;
  reason: string;
}

const getMatcherResult = async (prompt: string, output: string, assert: MatcherSchemaType): Promise<MatcherResult> => {
  const threshold = assert.threshold ?? 0.5;

  switch(assert.name) {
    case 'g-eval': {
      const result = await gEval(
        prompt,
        output,
        assert.criteria,
        assert.provider,
        assert.model,
      );

      return {
        passed: result.score > threshold,
        score: result.score,
        reason: result.reason,
      };
    }
    case 'llm-rubric': {
      const result = await llmRubric(
        output,
        assert.criteria,
        assert.provider,
        assert.model,
      );

      return {
        passed: result.pass && result.score > threshold,
        score: result.score,
        reason: result.reason,
      };
    }
    default:
      throw new Error(`Unsupported matcher: ${assert.name}`);
  }
};

export default async function (testConfig: EvalRequestType): Promise<void> {
  const { output } = await generateText({
    model: getModel(testConfig.provider, testConfig.model),
    prompt: testConfig.prompt,
  });

  const results: (MatcherResult & { name: string })[] = [];
  const settledResults = await Promise.allSettled(testConfig.asserts.map(assert => getMatcherResult(testConfig.prompt, output, assert)));

  settledResults.forEach((settled, idx) => {
    const assert = testConfig.asserts[idx];

    if (settled.status === 'fulfilled') {
      results.push({ name: assert.name, ...settled.value });
    } else {
      results.push({
        name: assert.name,
        passed: false,
        score: 0,
        reason: `Matcher failed with error: ${settled.reason instanceof Error ? settled.reason.message : String(settled.reason)}`,
      });
    }
  });

  const isPassed = results.every(r => r.passed);

  await saveTestResult(testConfig.run_id, testConfig.test_id, output, isPassed, results);
}
