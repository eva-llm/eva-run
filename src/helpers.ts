import CONF from './config';
import {
    QUEUE_TEST_RESULT,
} from './constants';

export const QUEUE_TEST_RESULT_UNIQ = `${QUEUE_TEST_RESULT}:${CONF.uuid}`;
