import CONF from './config';
import {
  redis,
  sleep,
} from './utils';
import {
  QUEUE_NODE_PING,
  QUEUE_TEST_DONE,
} from './constants';
import {
  type ICluster,
} from './schemas';

let cluster: ICluster | null = null;

if (process.env.CLUSTER_REDIS_URL) {
  let isPinging = false;
  const client = redis(process.env.CLUSTER_REDIS_URL);

  cluster = {
    startPinging: (): void => {
      if (isPinging) return;
      isPinging = true;
      (async (): Promise<void> => {
        while (true) {
          try {
            await client.zadd(QUEUE_NODE_PING, Date.now(), `${CONF.uuid}|${CONF.url}`);
          // eslint-disable-next-line no-empty
          } catch {}
          await sleep(CONF.clusterTick);
        }
      })();
    },

    notifyTestDone: (testId: string): Promise<number> => { // NOTE: less async/await - more performance
      return client.lpush(QUEUE_TEST_DONE, `${CONF.uuid}|${testId}`);
    }
  };
}

export default cluster;
