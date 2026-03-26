
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
        ignore: 'pid,hostname',
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

const formatError = (err: unknown): { message: string; stack?: string } => {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack };
  }

  if (typeof err === 'object' && err !== null) {
    try {
      return { message: JSON.stringify(err) };
    } catch {
      return { message: 'Circular or unstringifiable object' };
    }
  }

  return { message: String(err) };
};

process.on('unhandledRejection', (err) => {
  const { message, stack } = formatError(err);

  fastify.log.error({ msg: 'Unhandled Rejection', error: message, stack });
});

process.on('uncaughtException', (err) => {
  const { message, stack } = formatError(err);

  fastify.log.error({ msg: 'Uncaught Exception', error: message, stack });
});

start();
