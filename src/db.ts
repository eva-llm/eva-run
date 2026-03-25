/**
 * Database operations are optimized for ClickHouse migration.
 * Test results are stored in append mode only.
 * For future: Redis in hot path, ClickHouse in control plane.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { uuidv7 } from 'uuidv7';

import {
  IAssertResult,
  ITestResult,
} from './schemas';


/**
 * Prisma client instance for database operations.
 */
const connectionString = `${process.env.DATABASE_URL}`;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

/**
 * Save the test result and all assert results to the database.
 * @param {ITestResult} testResult - The test result object.
 * @param {IAssertResult[]} assertResults - Array of assert results.
 */
export async function saveTestResult(
  testResult: ITestResult,
  assertResults: IAssertResult[]
) {
  const { run_id, id: test_id } = testResult;

  await prisma.assertResult.createMany({
    data: assertResults.map((result) => ({
      id: uuidv7(),
      run_id, // NOTE: For future, in ClickHouse this will allow to make filtration without Join.
      test_id,
      ...result,
    })),
  });
  // NOTE: Save test header for tracking ONLY after asserts are saved, kinda Commit Message.
  await prisma.testResult.create({ data: testResult });
  /**
   * NOTE! FOR FUTURE (Redis + ClickHouse Migration):
   * To maintain this consistency during batching, we will use the "Atomic Envelope Pattern".
   * Instead of pushing individual rows, the entire test (header + asserts) will be pushed 
   * to Redis as a single JSON object. This prevents race conditions where a header 
   * could be ingested into ClickHouse before its corresponding asserts due to batch splitting.
   */
}
