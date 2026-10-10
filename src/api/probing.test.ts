import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ http: vi.fn(), error: vi.fn(), message: vi.fn() }));
vi.mock('../utils/http', () => ({ default: mocks.http }));
vi.mock('../utils/lib', () => ({ HandleApiError: mocks.error }));
vi.mock('antd', () => ({ message: { open: mocks.message } }));
import { ProbingOnce } from './probing';

beforeEach(() => vi.clearAllMocks());

it('passes the immediate probe payload and cancellation signal unchanged', async () => {
  const controller = new AbortController();
  const params = { ruleType: 'TCP', probingEndpointConfig: { endpoint: 'example.com:80' } };
  const result = { code: 200, data: [] };
  mocks.http.mockResolvedValue(result);
  expect(await ProbingOnce(params, { signal: controller.signal })).toBe(result);
  expect(mocks.http).toHaveBeenCalledWith('post', '/api/w8t/probing/onceProbing', params, { signal: controller.signal });
  expect(mocks.message).not.toHaveBeenCalled();
});

it.each(['canceled', 'network failure'])('leaves %s feedback to the current page request', async (reason) => {
  const error = new Error(reason);
  mocks.http.mockRejectedValue(error);
  await expect(ProbingOnce({})).rejects.toBe(error);
  expect(mocks.error).not.toHaveBeenCalled();
  expect(mocks.message).not.toHaveBeenCalled();
});
