jest.mock('uuidv7', () => ({
  uuidv7: jest.fn(),
}));

jest.mock('../src/test', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../src/config', () => ({
  __esModule: true,
  default: {
    runningTestsAmount: 0,
    maxTestsAmount: 1000,
    testsQueue: [] as any[],
  },
}));

import { uuidv7 } from 'uuidv7';
import runTest from '../src/test';
import CONF from '../src/config';
import { registerEvalRoute } from '../src/handlers/eval';
import type { TTestSchema } from '../src/schemas';

const mockUuidv7 = uuidv7 as jest.MockedFunction<typeof uuidv7>;
const mockRunTest = runTest as jest.MockedFunction<typeof runTest>;

function makeTestConfig(overrides: Partial<TTestSchema> = {}): TTestSchema {
  return {
    run_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    provider: 'openai',
    model: 'gpt-4o',
    prompt: 'What is 2+2?',
    asserts: [],
    ...overrides,
  };
}

function buildHandler(): (request: { body: TTestSchema[] }) => Promise<{ test_ids: string[] }> {
  let capturedHandler: any;
  const mockFastify = {
    post: jest.fn((_path: string, opts: any) => {
      capturedHandler = opts.handler;
    }),
  } as any;
  registerEvalRoute(mockFastify);
  return capturedHandler;
}

describe('registerEvalRoute', () => {
  it('registers a POST /eval route on the fastify instance', () => {
    const mockFastify = { post: jest.fn() } as any;
    registerEvalRoute(mockFastify);
    expect(mockFastify.post).toHaveBeenCalledWith('/eval', expect.objectContaining({
      schema: expect.any(Object),
      handler: expect.any(Function),
    }));
    expect(mockFastify.post.mock.calls[0][0]).toBe('/eval');
  });
});

describe('evalHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    CONF.runningTestsAmount = 0;
    CONF.maxTestsAmount = 1000;
    CONF.testsQueue = [];
  });

  it('returns an array of test_ids equal in length to input', async () => {
    mockUuidv7
      .mockReturnValueOnce('id-1' as any)
      .mockReturnValueOnce('id-2' as any);

    const handler = buildHandler();
    const result = await handler({ body: [makeTestConfig(), makeTestConfig()] });

    expect(result.test_ids).toEqual(['id-1', 'id-2']);
  });

  it('assigns the generated test_id to each testConfig', async () => {
    mockUuidv7.mockReturnValueOnce('uuid-abc' as any);
    const config = makeTestConfig();
    const handler = buildHandler();

    await handler({ body: [config] });

    expect(config.test_id).toBe('uuid-abc');
  });

  it('calls runTest for each config when below maxTestsAmount', async () => {
    mockUuidv7.mockReturnValueOnce('id-a' as any).mockReturnValueOnce('id-b' as any);
    CONF.runningTestsAmount = 0;
    CONF.maxTestsAmount = 1000;

    const handler = buildHandler();
    await handler({ body: [makeTestConfig(), makeTestConfig()] });

    expect(mockRunTest).toHaveBeenCalledTimes(2);
  });

  it('increments runningTestsAmount for each test started', async () => {
    mockUuidv7.mockReturnValueOnce('id-1' as any).mockReturnValueOnce('id-2' as any);
    CONF.runningTestsAmount = 0;
    CONF.maxTestsAmount = 1000;

    const handler = buildHandler();
    await handler({ body: [makeTestConfig(), makeTestConfig()] });

    expect(CONF.runningTestsAmount).toBe(2);
  });

  it('queues tests instead of running them when at capacity', async () => {
    mockUuidv7.mockReturnValueOnce('id-q' as any);
    CONF.runningTestsAmount = 1000;
    CONF.maxTestsAmount = 1000;

    const config = makeTestConfig();
    const handler = buildHandler();
    await handler({ body: [config] });

    expect(mockRunTest).not.toHaveBeenCalled();
    expect(CONF.testsQueue).toContain(config);
  });

  it('does not increment runningTestsAmount for queued tests', async () => {
    mockUuidv7.mockReturnValueOnce('id-q' as any);
    CONF.runningTestsAmount = 1000;
    CONF.maxTestsAmount = 1000;

    const handler = buildHandler();
    await handler({ body: [makeTestConfig()] });

    expect(CONF.runningTestsAmount).toBe(1000);
  });

  it('returns empty test_ids array for empty input', async () => {
    const handler = buildHandler();
    const result = await handler({ body: [] });

    expect(result.test_ids).toEqual([]);
    expect(mockRunTest).not.toHaveBeenCalled();
  });

  it('runs tests that fit and queues the rest when mixed capacity', async () => {
    mockUuidv7
      .mockReturnValueOnce('fit-1' as any)
      .mockReturnValueOnce('queued-1' as any);
    CONF.runningTestsAmount = 999;
    CONF.maxTestsAmount = 1000;

    const config1 = makeTestConfig();
    const config2 = makeTestConfig();
    const handler = buildHandler();
    await handler({ body: [config1, config2] });

    expect(mockRunTest).toHaveBeenCalledTimes(1);
    expect(mockRunTest).toHaveBeenCalledWith(config1);
    expect(CONF.testsQueue).toContain(config2);
    expect(CONF.runningTestsAmount).toBe(1000);
  });
});
