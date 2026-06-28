import {
  writeFileSync,
  readFileSync,
  existsSync,
  openSync,
  closeSync,
} from 'node:fs';

import Redis from 'ioredis';
import {
  uuidv7,
} from 'uuidv7';

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export const yieldEventLoop = () => new Promise(resolve => setImmediate(resolve));
export const xnor = (a: boolean, b: boolean): boolean => a === b;

export const redis = (url: string) => new Redis(url, {
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

const SHM_PATH = '/dev/shm/eva_run_node_uuid';

export const readNodeUuid = (): string => {
  if (!existsSync(SHM_PATH)) {
    throw new Error(`Identity file '${SHM_PATH}' not found`);
  }
  return readFileSync(SHM_PATH, 'utf8').trim();
}

export const createNodeUuid = (): string => {
  try {
    const fd = openSync(SHM_PATH, 'wx');
    const uuid = uuidv7();
    
    writeFileSync(fd, uuid, 'utf8');
    closeSync(fd);
    
    return uuid;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    if (err.code === 'EEXIST') {
      return readNodeUuid(); // NOTE: somehow created which shouldn't happen, but just in case
    }
    throw new Error('Failed to create identity in RAM', { cause: err });
  }
}
