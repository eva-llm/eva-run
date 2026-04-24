import { uuidv7 } from 'uuidv7';
import {
  type TSaveTestResult,
  type IAssertResult,
  type ITestResult,
} from './schemas';
import { QUEUE_TEST_RESULT } from './constants';
import { redis } from './utils';


export const getRedis = () => redis(process.env.DATA_REDIS_URL!);

export function saveTestResultRedis(
  redis: ReturnType<typeof getRedis>,
): TSaveTestResult {
  // NOTE: Should be called once only
  const gracefulShutdown = async () => {
    await redis.quit(); // NOTE : quit() is better than disconnect() for graceful shutdown, it ensures all pending commands are processed before closing the connection.
    process.exit(0);
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);

  return async function (
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

    await redis.lpush(QUEUE_TEST_RESULT, JSON.stringify(envelope));
  }
}
