import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Type, Static } from '@sinclair/typebox';

import { run } from '../test';

export const MatcherNameEnum = Type.Union([
  Type.Literal('g-eval'),
  Type.Literal('llm-rubric'),
]);

export const MatcherSchema = Type.Object({
  name: MatcherNameEnum,
  provider: Type.String(),
  model: Type.String(),
  criteria: Type.String(),
  threshold: Type.Optional(Type.Number({ default: 0.5 })),
});
export type MatcherSchemaType = Static<typeof MatcherSchema>;

export const EvalRequest = Type.Object({
  run_id: Type.String({ format: 'uuid' }),
  test_id: Type.Optional(Type.String({ format: 'uuid' })),
  provider: Type.String(),
  model: Type.String(),
  prompt: Type.String(),
  asserts: Type.Array(MatcherSchema),
});
export type EvalRequestType = Static<typeof EvalRequest>;

export const EvalResponse = Type.Object({
  result: Type.String(),
});
export type EvalResponseType = Static<typeof EvalResponse>;


export async function evalHandler(
  request: FastifyRequest<{ Body: EvalRequestType }>,
  reply: FastifyReply
): Promise<EvalResponseType> {
  const testConfig = request.body;
  testConfig.test_id = await getTestId();
  run(testConfig);
  return { test_id: testConfig.test_id };
}

export function registerEvalRoute(fastify: FastifyInstance) {
  fastify.post('/eval', {
    schema: {
      body: EvalRequest,
      response: {
        200: EvalResponse,
      },
    },
    handler: evalHandler,
  });
}
