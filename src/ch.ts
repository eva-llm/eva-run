import Redis from 'ioredis';
import { createClient } from '@clickhouse/client';
import { QUEUE_NAME } from './constants';
import { IAssertResult, ITestResult } from 'schemas';
import { sleep } from 'utils';


const redis = new Redis(process.env.REDIS_URL!, {
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

const clickHouse = createClient({
  host: process.env.CLICKHOUSE_URL!,
});

const SEC = 1000;
const BATCH_SIZE = 5000;
const FLUSH_INTERVAL = 5000; // Flush every 5 seconds if batch is not full
const TEST_TABLE = 'test_results';
const ASSERT_TABLE = 'assert_results';

async function flushLoop(alwaysRun = 1) {
  let rawData: string[] | null = null;
  let tests: ITestResult[];
  let asserts: IAssertResult[];

  do {
    try {
      rawData = await redis.rpop(QUEUE_NAME, BATCH_SIZE);
      
      if (!rawData?.length) {
        await sleep(SEC);

        continue;
      }

      tests = [];
      asserts = [];

      rawData.forEach((item) => {
        const { asserts, ...test } = JSON.parse(item);

        tests.push(test);
        asserts.push(...asserts);
      });
    } catch (err) {
      await sleep(FLUSH_INTERVAL);
      // NOTE: Just trash data if error was on parsing
      continue;
    }

    try {
      await clickHouse.insert({
        table: ASSERT_TABLE,
        values: asserts,
        format: 'JSONEachRow',
      });
      // NOTE: Commit tests are finished as asserts are inserted
      await clickHouse.insert({
        table: TEST_TABLE,
        values: tests,
        format: 'JSONEachRow',
      });

      if (rawData.length < BATCH_SIZE) {
        await sleep(FLUSH_INTERVAL);
      }

      rawData = null; // NOTE: Flush to avoid pull back old data on redis error
    } catch (err) {
      // NOTE: Use always `LIMIT 1 BY id` in SQL query to avoid assert duplicates
      if (rawData?.length) {
        await redis.lpush(QUEUE_NAME, ...rawData);
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
