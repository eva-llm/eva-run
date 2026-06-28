import {
  createClient,
} from '@clickhouse/client';

import {
  QUEUE_TEST_RESULT,
} from '../constants';
import {
  type IAssertResult,
  type ITestResult,
} from '../schemas';
import {
  readNodeUuid,
  sleep,
  redis,
} from '../utils';

const QUEUE_TEST_RESULT_UNIQ = `${QUEUE_TEST_RESULT}:${readNodeUuid()}`; // NOTE: we don't use `./helpers` here.

const redisClient = redis(process.env.DATA_REDIS_URL!);
const clickHouse = createClient({
  host: process.env.CLICKHOUSE_URL!,
});

const SEC = 1000;
const BATCH_SIZE = 5000;
const FLUSH_INTERVAL = 5000; // Flush every 5 seconds if batch is not full
const TEST_TABLE = 'test_results';
const ASSERT_TABLE = 'assert_results';

async function flushLoop(alwaysRun = 1) {
  let rawData: string[] | null;
  let chTests: ITestResult[];
  let chAsserts: IAssertResult[];

  do {
    try {
      rawData = await redisClient.rpop(QUEUE_TEST_RESULT_UNIQ, BATCH_SIZE);
      
      if (!rawData?.length) {
        await sleep(SEC);

        continue;
      }

      chTests = [];
      chAsserts = [];

      rawData.forEach((item) => {
        const { asserts, ...test } = JSON.parse(item);

        chTests.push(test);
        chAsserts.push(...asserts);
      });
    } catch {
      await sleep(FLUSH_INTERVAL);
      // NOTE: Just trash data if error was on parsing
      continue;
    }

    try {
      await clickHouse.insert({
        table: ASSERT_TABLE,
        values: chAsserts,
        format: 'JSONEachRow',
      });
      // NOTE: Commit tests are finished as asserts are inserted
      await clickHouse.insert({
        table: TEST_TABLE,
        values: chTests,
        format: 'JSONEachRow',
      });

      if (rawData.length < BATCH_SIZE) {
        await sleep(FLUSH_INTERVAL);
      }

      rawData = null; // NOTE: Flush to avoid pull back old data on redis error
    } catch {
      // NOTE: Use always `LIMIT 1 BY id` in SQL query to avoid assert duplicates
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
  process.exit(0);
});
