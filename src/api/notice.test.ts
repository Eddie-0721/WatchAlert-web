import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ http: vi.fn(), error: vi.fn() }));
vi.mock('../utils/http', () => ({ default: mocks.http }));
vi.mock('../utils/lib', () => ({ HandleApiError: mocks.error }));
vi.mock('antd', () => ({ message: { open: vi.fn() } }));
import { noticeRecordList } from './notice';

beforeEach(() => vi.clearAllMocks());

it('notification record reads retain their scope and pass AbortSignal', async () => {
  const controller = new AbortController();
  const params = { uuid: 'notice-1', query: 'a&b', index: 2, size: 10 };
  mocks.http.mockResolvedValue({ code: 200, data: {} });
  await noticeRecordList(params, controller.signal);
  expect(mocks.http).toHaveBeenCalledWith('get', '/api/w8t/notice/noticeRecordList', params, { signal: controller.signal });
});

it('intentional cancellation does not report a notification read failure', async () => {
  const controller = new AbortController(); controller.abort();
  const canceled = new Error('canceled'); mocks.http.mockRejectedValue(canceled);
  await expect(noticeRecordList({}, controller.signal)).rejects.toBe(canceled);
  expect(mocks.error).not.toHaveBeenCalled();
});

it('notification read failures preserve feedback for existing consumers', async () => {
  const failure = new Error('network failure'); mocks.http.mockRejectedValue(failure);
  expect(await noticeRecordList({})).toBe(failure);
  expect(mocks.error).toHaveBeenCalledWith(failure);
});
