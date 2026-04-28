import {
  FastifyInstance,
  FastifyRequest,
} from 'fastify';
import { uuidv7 } from 'uuidv7';
import {
  TestSchema,
  EvalResponse,
  type TTestSchema,
  type TEvalResponse,
} from '../schemas';

import runTest from '../test';
import CONF from '../config';


/**
 * Handles evaluation requests by running a test and returning the test ID.
 * @param {FastifyRequest<{ Body: TTestSchema[] }>} request - The Fastify request object.
 * @returns {Promise<TEvalResponse>} The response containing the test ID.
 */
async function evalHandler(
  request: FastifyRequest<{ Body: TTestSchema[] }>,
): Promise<TEvalResponse> {
  const testConfigs = request.body;
  const testIds: string[] = [];

  for (const testConfig of testConfigs) {
    const testId = uuidv7();

    testConfig.test_id = testId;
    testIds.push(testId);
    // NOTE: backpressure management
    if (CONF.runningTestsAmount >= CONF.maxTestsAmount) {
      CONF.testsQueue.push(testConfig);
      continue;
    } else {
      runTest(testConfig); // NOTE: We don't await this, just return test_id[] to client for status tracking
      CONF.runningTestsAmount++;
    }
  }

  return { test_ids: testIds };
}

/**
 * Registers the /eval route on the Fastify instance.
 * @param {FastifyInstance} fastify - The Fastify server instance.
 */
export function registerEvalRoute(fastify: FastifyInstance) {
  fastify.post('/eval', {
    schema: {
      body: {
        type: 'array',
        items: TestSchema,
      },
      response: {
        200: EvalResponse,
      },
    },
    handler: evalHandler,
  });
}
