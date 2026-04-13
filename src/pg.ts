import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { uuidv7 } from 'uuidv7';

import {
  type TSaveTestResult,
  type IAssertResult,
  type ITestResult,
} from './schemas';


export const getPrisma = () => {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });

  return new PrismaClient({ adapter });
}

export function saveTestResultPg(
  prisma: PrismaClient,
): TSaveTestResult {
  // NOTE: Should be called once only
  const gracefulShutdown = async () => {
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);

  return async function (
    testResult: ITestResult,
    assertResults: IAssertResult[]
  ) {
    const { run_id, id: test_id } = testResult;
    // NOTE: No transactions in hot path, any cleanup of orphans asserts only in control plane
    await prisma.assertResult.createMany({
      data: assertResults.map((result) => ({
        id: uuidv7(),
        run_id,
        test_id,
        ...result,
      })),
    });
    // NOTE: Save test header for tracking ONLY after asserts are saved, kinda Commit Message.
    await prisma.testResult.create({ data: testResult });
  }
}
