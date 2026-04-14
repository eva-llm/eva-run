const mockSaveTestResultPg = jest.fn().mockReturnValue('pg-save-fn');
const mockSaveTestResultRedis = jest.fn().mockReturnValue('redis-save-fn');
const mockGetPrisma = jest.fn().mockReturnValue('prisma-client');
const mockGetRedis = jest.fn().mockReturnValue('redis-client');

jest.mock('../src/pg', () => ({
  saveTestResultPg: mockSaveTestResultPg,
  getPrisma: mockGetPrisma,
}));

jest.mock('../src/redis', () => ({
  saveTestResultRedis: mockSaveTestResultRedis,
  getRedis: mockGetRedis,
}));

describe('db module', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should use Redis when REDIS_URL is set', async () => {
    process.env = { ...originalEnv, REDIS_URL: 'redis://localhost:6379' };

    const { saveTestResult } = await import('../src/db');

    expect(mockGetRedis).toHaveBeenCalled();
    expect(mockSaveTestResultRedis).toHaveBeenCalledWith('redis-client');
    expect(saveTestResult).toBe('redis-save-fn');
    expect(mockGetPrisma).not.toHaveBeenCalled();
    expect(mockSaveTestResultPg).not.toHaveBeenCalled();
  });

  it('should use Postgres when REDIS_URL is not set', async () => {
    process.env = { ...originalEnv };
    delete process.env.REDIS_URL;

    const { saveTestResult } = await import('../src/db');

    expect(mockGetPrisma).toHaveBeenCalled();
    expect(mockSaveTestResultPg).toHaveBeenCalledWith('prisma-client');
    expect(saveTestResult).toBe('pg-save-fn');
    expect(mockGetRedis).not.toHaveBeenCalled();
    expect(mockSaveTestResultRedis).not.toHaveBeenCalled();
  });
});
