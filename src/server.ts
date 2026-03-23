import Fastify from 'fastify';

import { registerEvalRoute } from './handlers/eval';


const fastify = Fastify();

registerEvalRoute(fastify);

const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    fastify.log.info('Server listening on http://localhost:3000');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
