import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseStreamBlock, streamAgentMessage } from './agent';

afterEach(() => vi.unstubAllGlobals());
describe('Agent SSE transport', () => {
  it('handles comments and multiline CRLF data', () => {
    expect(parseStreamBlock(': keepalive')).toBeNull();
    expect(parseStreamBlock('event: delta\r\ndata: {\r\ndata: "delta":"生产告警"}')).toEqual({type:'delta', delta:'生产告警'});
  });
  function mockStream() {
    const bytes = new TextEncoder().encode('event: delta\r\ndata: {"delta":"生产告警"}\r\n\r\nevent: done\ndata: {"content":"完成"}\n\n');
    vi.stubGlobal('localStorage', {getItem: () => 'test'});
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); }}), {headers:{'content-type':'text/event-stream'}})));
  }
  it('retains UTF-8 across one-byte network chunks', async () => {
    mockStream(); const events: unknown[] = [];
    await streamAgentMessage({}, event => events.push(event));
    expect(events).toEqual([{type:'delta',delta:'生产告警'}, {type:'done',content:'完成'}]);
  });
  it('does not swallow callback failures', async () => {
    mockStream();
    await expect(streamAgentMessage({}, () => {throw new Error('render failure');})).rejects.toThrow('render failure');
  });
  it('rejects a JSON error masquerading as a successful stream', async () => {
    vi.stubGlobal('localStorage', {getItem: () => 'test'});
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', {headers:{'content-type':'application/json'}})));
    await expect(streamAgentMessage({}, () => {})).rejects.toThrow('流式服务不可用');
  });
});
