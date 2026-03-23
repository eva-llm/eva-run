import {
  FastifyInstance,
  FastifyRequest,
} from 'fastify';
import { uuidv7 } from 'uuidv7';
import {
  TestSchema,
  EvalResponse,
  type TestSchemaT,
  type EvalResponseT,
} from '../schemas';

import runTest from '../test';


/**
 * Handles evaluation requests by running a test and returning the test ID.
 * @param {FastifyRequest<{ Body: TestSchemaT }>} request - The Fastify request object.
 * @returns {Promise<EvalResponseT>} The response containing the test ID.
 */
async function evalHandler(
  request: FastifyRequest<{ Body: TestSchemaT }>,
): Promise<EvalResponseT> {
  const testConfig = request.body;

  testConfig.test_id = uuidv7();
  runTest(testConfig); // NOTE: We don't await this, just return test_id to client for status tracking

  return { test_id: testConfig.test_id };
}

/**
 * Registers the /eval route on the Fastify instance.
 * @param {FastifyInstance} fastify - The Fastify server instance.
 */
export function registerEvalRoute(fastify: FastifyInstance) {
  fastify.post('/eval', {
    schema: {
      body: TestSchema,
      response: {
        200: EvalResponse,
      },
    },
    handler: evalHandler,
  });
}
