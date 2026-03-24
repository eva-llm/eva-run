
import Fastify from 'fastify';

import { registerEvalRoute } from './handlers/eval';


/**
 * Main entry point for the Fastify server.
 * Registers routes and starts the server.
 */
const fastify = Fastify({
  logger: {    
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname', // Убираем лишний шум
      },
    },
  },
});

registerEvalRoute(fastify);

/**
 * Starts the Fastify server.
 * @async
 */
const start = async () => {
  try {
    const address = await fastify.listen({ 
      port: 3000,
      host: '0.0.0.0',
    });

    fastify.log.info(`Server is up at ${address}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
