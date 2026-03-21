import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Type, Static } from '@sinclair/typebox';

import { run } from '../test';


export const EvalRequest = Type.Object({
  input: Type.String(),
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
  const { input } = request.body;
  run();
  return { result: `Received: ${input}` };
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
