export interface AgentScope { datasourceIds: string[]; environmentLabelKey: string; environments: string[] }
export interface Capabilities { enabled: boolean; allowedTools: string[]; canWrite: boolean; scope: AgentScope }
export interface Evidence {
  toolName: string; status: string; summary: string; queriedAt?: number;
  source?: Record<string, unknown>; query?: Record<string, unknown>; truncated?: boolean;
  actionId?: string; payloadHash?: string; preview?: unknown; riskLevel?: string;
}
export interface AgentMessage { id?: string; role: string; content: string; evidence?: string | Evidence[]; createdAt?: number }
export interface AgentSession { id: string; title: string; updatedAt: number }
interface Envelope<T> { code: number; data: T; msg: string }
export interface StreamEvent { type: string; delta?: string; content?: string; evidence?: string; message?: string }
const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('Authorization') || ''}`, TenantID: localStorage.getItem('TenantID') || '' });

async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/w8t/agent/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: headers(), body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(response.status === 403 ? '无权访问 Copilot，请联系管理员配置权限。' : `Copilot 请求失败（${response.status}）`);
  const result: Envelope<T> = await response.json();
  if (result.code !== 200 && result.code !== 0) throw new Error(typeof result.data === 'string' ? result.data : result.msg || 'Copilot 请求失败');
  return result.data;
}
export const getAgentCapabilities = () => request<Capabilities>('capabilities');
export const listAgentSessions = () => request<AgentSession[]>('sessionList');
export const getAgentSession = (id: string) => request<{ session: AgentSession; messages: AgentMessage[] }>(`sessionGet?sessionId=${encodeURIComponent(id)}`);
export const createAgentSession = (body: {title: string}) => request<AgentSession>('sessionCreate', body);
export const confirmAgentAction = (body: { actionId: string; payloadHash: string }) => request<{status: string; result?: string}>('actionConfirm', body);

export function parseStreamBlock(block: string): StreamEvent | null {
  const lines = block.split(/\r?\n/);
  const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim() || 'message';
  const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
  if (!data) return null;
  return { ...JSON.parse(data), type: event };
}

export async function streamAgentMessage(body: unknown, onEvent: (event: StreamEvent) => void, signal?: AbortSignal) {
  const response = await fetch('/api/w8t/agent/sessionMessageStream', { method: 'POST', headers: headers(), body: JSON.stringify(body), signal });
  if (!response.ok || !response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw new Error(`Copilot 流式服务不可用（${response.status}）`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      let separator;
      while ((separator = buffer.search(/\r?\n\r?\n/)) >= 0) {
        const block = buffer.slice(0, separator);
        buffer = buffer.slice(separator + (buffer[separator] === '\r' ? 4 : 2));
        const event = parseStreamBlock(block);
        if (event) onEvent(event);
      }
      if (done) break;
    }
    if (buffer.trim()) { const event = parseStreamBlock(buffer); if (event) onEvent(event); }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export interface AgentDiagnostics { checkedAt: number; checks: {id: string; status: string}[] }
export const diagnoseAgent = () => request<AgentDiagnostics>('diagnostics', {});
