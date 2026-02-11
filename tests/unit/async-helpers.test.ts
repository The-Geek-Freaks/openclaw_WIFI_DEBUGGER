import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  withTimeout, 
  TimeoutError, 
  Semaphore, 
  CircularBuffer, 
  ExpiringMap 
} from '../../src/utils/async-helpers.js';

describe('withTimeout', () => {
  it('should resolve if promise completes within timeout', async () => {
    const result = await withTimeout(
      Promise.resolve('success'),
      1000,
      'test operation'
    );
    expect(result).toBe('success');
  });

  it('should throw TimeoutError if promise exceeds timeout', async () => {
    const slowPromise = new Promise((resolve) => {
      setTimeout(() => resolve('too late'), 500);
    });

    await expect(
      withTimeout(slowPromise, 50, 'slow operation')
    ).rejects.toThrow(TimeoutError);
  });

  it('should include operation name in timeout error message', async () => {
    const slowPromise = new Promise((resolve) => {
      setTimeout(() => resolve('too late'), 500);
    });

    try {
      await withTimeout(slowPromise, 50, 'custom operation');
    } catch (err) {
      expect(err).toBeInstanceOf(TimeoutError);
      expect((err as TimeoutError).message).toContain('custom operation');
    }
  });
});

describe('Semaphore', () => {
  it('should limit concurrent access', async () => {
    const semaphore = new Semaphore(2);
    let concurrent = 0;
    let maxConcurrent = 0;

    const task = async () => {
      await semaphore.acquire();
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 50));
      concurrent--;
      semaphore.release();
    };

    await Promise.all([task(), task(), task(), task()]);
    expect(maxConcurrent).toBe(2);
  });

  it('should work with withLock helper', async () => {
    const semaphore = new Semaphore(1);
    const results: number[] = [];

    await Promise.all([
      semaphore.withLock(async () => {
        results.push(1);
        await new Promise((r) => setTimeout(r, 20));
        results.push(2);
      }),
      semaphore.withLock(async () => {
        results.push(3);
        await new Promise((r) => setTimeout(r, 20));
        results.push(4);
      }),
    ]);

    expect(results).toEqual([1, 2, 3, 4]);
  });
});

describe('CircularBuffer', () => {
  it('should store items up to capacity', () => {
    const buffer = new CircularBuffer<number>(3);
    buffer.push(1);
    buffer.push(2);
    buffer.push(3);

    expect(buffer.size).toBe(3);
    expect(buffer.toArray()).toEqual([1, 2, 3]);
  });

  it('should overwrite oldest items when full', () => {
    const buffer = new CircularBuffer<number>(3);
    buffer.push(1);
    buffer.push(2);
    buffer.push(3);
    buffer.push(4);
    buffer.push(5);

    expect(buffer.size).toBe(3);
    expect(buffer.toArray()).toEqual([3, 4, 5]);
  });

  it('should clear correctly', () => {
    const buffer = new CircularBuffer<number>(3);
    buffer.push(1);
    buffer.push(2);
    buffer.clear();

    expect(buffer.size).toBe(0);
    expect(buffer.toArray()).toEqual([]);
  });
});

describe('ExpiringMap', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should store and retrieve values', () => {
    const map = new ExpiringMap<string, number>(10000, 60000);
    map.set('key1', 100);

    expect(map.get('key1')).toBe(100);
    expect(map.has('key1')).toBe(true);
    expect(map.size).toBe(1);

    map.destroy();
  });

  it('should return undefined for expired keys', () => {
    const map = new ExpiringMap<string, number>(100, 60000);
    map.set('key1', 100);

    vi.advanceTimersByTime(150);

    expect(map.get('key1')).toBeUndefined();
    expect(map.has('key1')).toBe(false);

    map.destroy();
  });

  it('should delete keys', () => {
    const map = new ExpiringMap<string, number>(10000, 60000);
    map.set('key1', 100);
    map.delete('key1');

    expect(map.get('key1')).toBeUndefined();
    expect(map.size).toBe(0);

    map.destroy();
  });

  it('should cleanup on destroy', () => {
    const map = new ExpiringMap<string, number>(10000, 60000);
    map.set('key1', 100);
    map.destroy();

    expect(map.size).toBe(0);
  });
});
