import {
  PrismaPg,
} from '@prisma/adapter-pg';
import {
  Prisma,
  PrismaClient,
} from '@prisma/client';
import {
  QUEUE_TEST_RESULT,
} from '../constants';
import {
  type ITestResult,
} from '../schemas';
import {
  readNodeUuid,
  sleep,
  redis,
} from '../utils';

const QUEUE_TEST_RESULT_UNIQ = `${QUEUE_TEST_RESULT}:${readNodeUuid()}`; // NOTE: we don't use `./helpers` here.

const redisClient = redis(process.env.DATA_REDIS_URL!);
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const SEC = 1000;
const BATCH_SIZE = 500;
const FLUSH_INTERVAL = 5000; // Flush every 5 seconds if batch is not full

async function flushLoop(alwaysRun = 1) {
  let rawData: string[] | null;
  let pgTests: ITestResult[];
  let pgAsserts: Prisma.AssertResultCreateManyInput[];

  do {
    try {
      rawData = await redisClient.rpop(QUEUE_TEST_RESULT_UNIQ, BATCH_SIZE);

      if (!rawData?.length) {
        await sleep(SEC);

        continue;
      }

      pgTests = [];
      pgAsserts = [];

      rawData.forEach((item) => {
        const { asserts, ...test } = JSON.parse(item);

        pgTests.push(test);
        pgAsserts.push(...asserts);
      });
    } catch {
      await sleep(FLUSH_INTERVAL);
      // NOTE: Just trash data if error was on parsing
      continue;
    }

    try {
      await prisma.$transaction([
        prisma.assertResult.createMany({ data: pgAsserts }),
        prisma.testResult.createMany({ data: pgTests }),
      ]);

      if (rawData.length < BATCH_SIZE) {
        await sleep(FLUSH_INTERVAL);
      }

      rawData = null; // NOTE: Flush to avoid pull back old data on redis error
    } catch {
      // NOTE: Use always `LIMIT 1 BY id` (or unique constraint) in DB to avoid assert duplicates
      if (rawData?.length) {
        await redisClient.lpush(QUEUE_TEST_RESULT_UNIQ, ...rawData);
      }
      await sleep(FLUSH_INTERVAL);
    }
  } while (alwaysRun);
}

flushLoop();

process.on('SIGTERM', async () => {
  await flushLoop(0);
  await prisma.$disconnect();
  process.exit(0);
});
