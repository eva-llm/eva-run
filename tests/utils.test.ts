import { sleep, yieldEventLoop, xnor } from '../src/utils';

describe('utils module', () => {
  describe('sleep', () => {
    it('should resolve after the specified duration', async () => {
      const start = Date.now();
      await sleep(50);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(40);
    });

    it('should return a promise', () => {
      const result = sleep(0);
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('yieldEventLoop', () => {
    it('should resolve on the next tick', async () => {
      let flag = false;
      const promise = yieldEventLoop().then(() => {
        flag = true;
      });
      expect(flag).toBe(false);
      await promise;
      expect(flag).toBe(true);
    });

    it('should return a promise', () => {
      const result = yieldEventLoop();
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('xnor', () => {
    it('should return true when both are true', () => {
      expect(xnor(true, true)).toBe(true);
    });

    it('should return true when both are false', () => {
      expect(xnor(false, false)).toBe(true);
    });

    it('should return false when first is true and second is false', () => {
      expect(xnor(true, false)).toBe(false);
    });

    it('should return false when first is false and second is true', () => {
      expect(xnor(false, true)).toBe(false);
    });
  });
});
