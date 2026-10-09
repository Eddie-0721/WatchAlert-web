import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ http: vi.fn(), error: vi.fn() }));
vi.mock('../utils/http', () => ({ default: mocks.http }));
vi.mock('../utils/lib', () => ({ HandleApiError: mocks.error }));
import { getCurEventList, getHisEventList } from './event';

beforeEach(() => vi.clearAllMocks());
for (const [name, load] of [['current', getCurEventList], ['history', getHisEventList]] as const) {
  it(`${name} forwards cancellation without changing query encoding`, async () => {
    const controller = new AbortController();
    mocks.http.mockResolvedValue({ code: 200 });
    await load({ query: 'a&b 中文', index: 1 }, controller.signal);
    const [method, path, params, options] = mocks.http.mock.calls[0];
    expect(method).toBe('get');
    expect(new URL(path, 'http://localhost').searchParams.get('query')).toBe('a&b 中文');
    expect(params).toBeUndefined();
    expect(options.signal).toBe(controller.signal);
  });
  it(`${name} does not notify on intentional cancellation`, async () => {
    const controller = new AbortController(); controller.abort();
    const canceled = new Error('canceled'); mocks.http.mockRejectedValue(canceled);
    await expect(load({}, controller.signal)).rejects.toBe(canceled);
    expect(mocks.error).not.toHaveBeenCalled();
  });
  it(`${name} preserves real failure feedback`, async () => {
    const failure = new Error('network failure'); mocks.http.mockRejectedValue(failure);
    expect(await load({})).toBe(failure);
    expect(mocks.error).toHaveBeenCalledWith(failure);
  });
}
