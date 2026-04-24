import { type TSaveTestResult } from './schemas';
import { saveTestResultPg, getPrisma } from './pg';
import { saveTestResultRedis, getRedis } from './redis';


let saveTestResult: TSaveTestResult;

if (process.env.DATA_REDIS_URL) {
  saveTestResult = saveTestResultRedis(getRedis());
} else {
  saveTestResult = saveTestResultPg(getPrisma());
}

export { saveTestResult };
