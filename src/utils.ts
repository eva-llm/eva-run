import Redis from 'ioredis';

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export const yieldEventLoop = () => new Promise(resolve => setImmediate(resolve));
export const xnor = (a: boolean, b: boolean): boolean => a === b;
export const redis = (url: string) => new Redis(url, {
  retryStrategy: (times) => Math.min(times * 50, 2000),
});
