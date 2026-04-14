const mockLog = {
  info: jest.fn(),
  error: jest.fn(),
};

const mockFastifyInstance = {
  listen: jest.fn(),
  log: mockLog,
};

const mockFastifyConstructor = jest.fn(() => mockFastifyInstance);

jest.mock('fastify', () => ({
  __esModule: true,
  default: mockFastifyConstructor,
}));

jest.mock('../src/handlers/eval', () => ({
  registerEvalRoute: jest.fn(),
}));

const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation((() => {}) as never);

describe('server module', () => {
  let processListeners: Record<string, Function>;

  beforeEach(() => {
    jest.clearAllMocks();

    processListeners = {};
    jest.spyOn(process, 'on').mockImplementation(((event: string, handler: Function) => {
      processListeners[event] = handler;
      return process;
    }) as any);
  });

  afterEach(() => {
    (process.on as unknown as jest.SpyInstance).mockRestore();
  });

  describe('server initialization', () => {
    it('should create a Fastify instance with pino-pretty logger', () => {
      jest.isolateModules(() => {
        require('../src/server');
      });

      expect(mockFastifyConstructor).toHaveBeenCalledWith({
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
    });

    it('should register the eval route', () => {
      const { registerEvalRoute } = require('../src/handlers/eval');

      jest.isolateModules(() => {
        require('../src/server');
      });

      expect(registerEvalRoute).toHaveBeenCalled();
    });
  });

  describe('start', () => {
    it('should listen on port 3000 and host 0.0.0.0', async () => {
      mockFastifyInstance.listen.mockResolvedValue('http://0.0.0.0:3000');

      jest.isolateModules(() => {
        require('../src/server');
      });

      // Allow the start() call to complete
      await new Promise(process.nextTick);

      expect(mockFastifyInstance.listen).toHaveBeenCalledWith({
        port: 3000,
        host: '0.0.0.0',
      });
    });

    it('should log the server address on success', async () => {
      const address = 'http://0.0.0.0:3000';
      mockFastifyInstance.listen.mockResolvedValue(address);

      jest.isolateModules(() => {
        require('../src/server');
      });

      await new Promise(process.nextTick);

      expect(mockLog.info).toHaveBeenCalledWith(`Server is up at ${address}`);
    });

    it('should log the error and exit with code 1 on failure', async () => {
      const error = new Error('listen failed');
      mockFastifyInstance.listen.mockRejectedValue(error);

      jest.isolateModules(() => {
        require('../src/server');
      });

      await new Promise(process.nextTick);

      expect(mockLog.error).toHaveBeenCalledWith(error);
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('formatError', () => {
    // formatError is not exported, so we test it via the process event handlers

    it('should format Error instances with message and stack', () => {
      jest.isolateModules(() => {
        require('../src/server');
      });

      const error = new Error('test error');
      processListeners['unhandledRejection'](error);

      expect(mockLog.error).toHaveBeenCalledWith({
        msg: 'Unhandled Rejection',
        error: 'test error',
        stack: error.stack,
      });
    });

    it('should format plain objects as JSON', () => {
      jest.isolateModules(() => {
        require('../src/server');
      });

      const error = { code: 'ERR_SOMETHING', detail: 'bad' };
      processListeners['unhandledRejection'](error);

      expect(mockLog.error).toHaveBeenCalledWith({
        msg: 'Unhandled Rejection',
        error: JSON.stringify(error),
        stack: undefined,
      });
    });

    it('should handle circular objects gracefully', () => {
      jest.isolateModules(() => {
        require('../src/server');
      });

      const circular: any = {};
      circular.self = circular;
      processListeners['unhandledRejection'](circular);

      expect(mockLog.error).toHaveBeenCalledWith({
        msg: 'Unhandled Rejection',
        error: 'Circular or unstringifiable object',
        stack: undefined,
      });
    });

    it('should convert primitive values to string', () => {
      jest.isolateModules(() => {
        require('../src/server');
      });

      processListeners['unhandledRejection']('string error');

      expect(mockLog.error).toHaveBeenCalledWith({
        msg: 'Unhandled Rejection',
        error: 'string error',
        stack: undefined,
      });
    });

    it('should convert numeric values to string', () => {
      jest.isolateModules(() => {
        require('../src/server');
      });

      processListeners['unhandledRejection'](42);

      expect(mockLog.error).toHaveBeenCalledWith({
        msg: 'Unhandled Rejection',
        error: '42',
        stack: undefined,
      });
    });

    it('should handle null values', () => {
      jest.isolateModules(() => {
        require('../src/server');
      });

      processListeners['unhandledRejection'](null);

      expect(mockLog.error).toHaveBeenCalledWith({
        msg: 'Unhandled Rejection',
        error: 'null',
        stack: undefined,
      });
    });
  });

  describe('process error handlers', () => {
    it('should register an unhandledRejection handler', () => {
      jest.isolateModules(() => {
        require('../src/server');
      });

      expect(processListeners['unhandledRejection']).toBeDefined();
    });

    it('should register an uncaughtException handler', () => {
      jest.isolateModules(() => {
        require('../src/server');
      });

      expect(processListeners['uncaughtException']).toBeDefined();
    });

    it('should log uncaughtException with correct msg label', () => {
      jest.isolateModules(() => {
        require('../src/server');
      });

      const error = new Error('uncaught!');
      processListeners['uncaughtException'](error);

      expect(mockLog.error).toHaveBeenCalledWith({
        msg: 'Uncaught Exception',
        error: 'uncaught!',
        stack: error.stack,
      });
    });
  });
});
