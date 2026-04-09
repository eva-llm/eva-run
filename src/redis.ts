import Redis from 'ioredis';
import { uuidv7 } from 'uuidv7';
import {
  type TSaveTestResult,
  type IAssertResult,
  type ITestResult,
} from './schemas';
import { QUEUE_NAME } from './constants';


export const getRedis = () => new Redis(process.env.REDIS_URL!, {
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

export function saveTestResultRedis(
  redis: Redis,
): TSaveTestResult {
  return async function saveTestResultRedis(
    testResult: ITestResult,
    assertResults: IAssertResult[]
  ) {
    const { run_id, id: test_id } = testResult;
    const envelope = {
      ...testResult,
      asserts: assertResults.map(result => ({
        id: uuidv7(),
        run_id,
        test_id,
        ...result,
      }))
    };

    await redis.lpush(QUEUE_NAME, JSON.stringify(envelope));
  }
}
