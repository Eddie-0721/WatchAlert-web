import http from '../utils/http';

export const getAgentCapabilities = () => http('get', '/api/w8t/agent/capabilities');
export const createAgentSession = (params) => http('post', '/api/w8t/agent/sessionCreate', params);
export const sendAgentMessage = (params) => http('post', '/api/w8t/agent/sessionMessage', params);
export const confirmAgentAction = (params) => http('post', '/api/w8t/agent/actionConfirm', params);

// EventSource cannot send the active Authorization header with a POST body,
// so Copilot uses fetch and parses same-origin SSE itself.
export const streamAgentMessage = async (params, onEvent) => {
    const response = await fetch('/api/w8t/agent/sessionMessageStream', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('Authorization') || ''}`,
            TenantID: localStorage.getItem('TenantID') || '',
        },
        body: JSON.stringify(params),
    });
    if (!response.ok || !response.body) throw new Error(`Copilot 流式服务不可用（${response.status}）`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let eventName = 'message';
    const dispatch = block => {
        const lines = block.split(/\r?\n/);
        let data = '';
        lines.forEach(line => {
            if (line.startsWith('event:')) eventName = line.slice(6).trim();
            if (line.startsWith('data:')) data += line.slice(5).trim();
        });
        if (!data) return;
        try { onEvent({ type: eventName, ...JSON.parse(data) }); } catch (_) { onEvent({ type: 'error', message: 'Copilot 返回了无法识别的流事件' }); }
        eventName = 'message';
    };
    while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        let separator;
        while ((separator = buffer.search(/\r?\n\r?\n/)) >= 0) {
            const block = buffer.slice(0, separator);
            buffer = buffer.slice(separator + (buffer[separator] === '\r' ? 4 : 2));
            dispatch(block);
        }
        if (done) break;
    }
    if (buffer.trim()) dispatch(buffer);
};
