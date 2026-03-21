import Fastify from 'fastify';

import { registerEvalRoute } from './handlers/eval';

const fastify = Fastify();

// Register /eval route
registerEvalRoute(fastify);

const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Server listening on http://localhost:3000');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
