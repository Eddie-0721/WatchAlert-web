import { afterAll, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  post: vi.fn(), request: vi.fn(), response: vi.fn(),
}));
vi.mock('axios', () => ({ default: {
  defaults: {}, post: mocks.post,
  interceptors: { request: { use: mocks.request }, response: { use: mocks.response } },
} }));
vi.mock('antd', () => ({ message: {} }));
vi.stubGlobal('window', { location: { protocol: 'http:', hostname: 'localhost', port: '4187' } });
const { default: http, post } = await import('./http');
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => { mocks.post.mockReset(); });

it('forwards AbortSignal through the shared POST dispatcher', async () => {
  const signal = new AbortController().signal;
  const body = { value: 1 };
  const result = { code: 200 };
  mocks.post.mockResolvedValue({ data: result });
  expect(await http('post', '/fixture', body, { signal })).toBe(result);
  expect(mocks.post).toHaveBeenCalledWith('/fixture', body, { signal });
});

it('retains legacy POST response and body semantics without options', async () => {
  mocks.post.mockResolvedValue({ data: { code: 200 } });
  expect(await post('/fixture', { value: 2 })).toEqual({ code: 200 });
  expect(mocks.post).toHaveBeenCalledWith('/fixture', { value: 2 }, { signal: undefined });
});

it('preserves cancellation rejection instead of resolving an error as data', async () => {
  const canceled = new Error('canceled');
  mocks.post.mockRejectedValue(canceled);
  const outcome = await http('post', '/fixture', {}).then(
    value => ({ resolved: true, value }),
    error => ({ resolved: false, value: error }),
  );
  expect(outcome.resolved).toBe(false);
  expect(outcome.value).toBe(canceled);
});
