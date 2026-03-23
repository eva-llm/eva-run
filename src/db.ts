/**
 * Database operations are optimized for ClickHouse migration.
 * Test results are stored in append mode only.
 * For future: Redis in hot path, ClickHouse in control plane.
 */
import { uuidv7 } from 'uuidv7';

export async function saveTestResult(run_id, test_id, prompt, output, is_passed, results) {
  // NOTE: Save test details for each assert. This allows to have detailed insights and metrics on asserts performance.
  await Promise.allSettled(results.map(result =>
    prisma.testResultDetail.create({
      data: {
        id: uuidv7(),
        test_id,
        run_id, // NOTE: For future, in ClickHouse this will allow to make filtration without Join.
        name: result.name,
        passed: result.passed,
        score: result.score,
        reason: result.reason,
      }
    }))
  );
  // NOTE: Save test header for tracking and filtration.
  await prisma.testResult.create({
    data: {
      id: test_id,
      run_id,
      prompt,
      output,
      passed: is_passed,
    }
  });
}
