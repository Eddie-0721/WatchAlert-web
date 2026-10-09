import { afterEach, expect, it, vi } from 'vitest';
import { coalescedUpdate } from './coalescedUpdate';

afterEach(() => vi.useRealTimers());
it('coalesces burst updates without losing the most recent text', () => {
  vi.useFakeTimers();
  const commit = vi.fn(); const stream = coalescedUpdate(commit);
  for (let i = 0; i < 1000; i++) stream.push(`response-${i}`);
  expect(commit).not.toHaveBeenCalled();
  vi.advanceTimersByTime(50);
  expect(commit).toHaveBeenCalledExactlyOnceWith('response-999');
});
it('flushes incomplete text and cancels pending work before a terminal response', () => {
  vi.useFakeTimers();
  const commit = vi.fn(); const stream = coalescedUpdate(commit);
  stream.push('partial'); stream.flush();
  expect(commit).toHaveBeenCalledExactlyOnceWith('partial');
  stream.push('stale'); stream.cancel(); vi.runAllTimers();
  expect(commit).toHaveBeenCalledTimes(1);
});
