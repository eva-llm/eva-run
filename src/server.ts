
import Fastify from 'fastify';
import { registerEvalRoute } from './handlers/eval';

/**
 * Main entry point for the Fastify server.
 * Registers routes and starts the server.
 */
const fastify = Fastify();

registerEvalRoute(fastify);

/**
 * Starts the Fastify server.
 * @async
 */
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
