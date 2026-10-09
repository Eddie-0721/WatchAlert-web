import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Collapse, Empty, Input, Modal, Select, Spin, Tag, message } from 'antd';
import { ArrowUp, Bot, Plus, Square } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getAgentCapabilities, listAgentSessions, getAgentSession, createAgentSession, confirmAgentAction, streamAgentMessage } from '../../api/agent';
import { getAlertScope, scopeName, scopeResource } from '../../utils/alertScope';
import MarkdownRenderer from '../../utils/MarkdownRenderer';
import './index.css';
import ConnectionDiagnostics from './ConnectionDiagnostics';
import { safeAlertReturn } from '../../utils/alertView';
import { coalescedUpdate } from '../../utils/coalescedUpdate';

const parseEvidence = value => { try { const parsed = Array.isArray(value) ? value : JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed.filter(item => item && typeof item === 'object') : []; } catch { return []; } };
const eventName = event => event?.rule_name || event?.ruleName || '当前告警';
const stamp = time => time ? new Date(time * 1000).toLocaleString('zh-CN') : '未记录';
const compactEvent = event => event ? {
  fingerprint: event.fingerprint, ruleId: event.rule_id || event.ruleId,
  faultCenterId: event.faultCenterId || event.fault_center_id,
  datasourceId: event.datasource_id || event.datasourceId,
} : undefined;
const actionSummary = raw => {
  let preview=raw;
  if(typeof raw==='string') {try{preview=JSON.parse(raw)}catch{return null}}
  if(!preview || typeof preview!=='object')return null;
  const target=preview.after || preview.before || preview;
  return <div className="copilot-action-summary">
    <p><strong>{preview.action || '待确认操作'}</strong> · {String(target.name || target.id || '')}</p>
    {target.faultCenterId && <p>故障中心：{String(target.faultCenterId)}</p>}
    {Array.isArray(target.labels) && <p>匹配条件：{target.labels.map(label=>`${label.key}${label.operator}${label.value}`).join('，')}</p>}
    {target.startsAt && <p>生效时间：{stamp(target.startsAt)} — {stamp(target.endsAt)}</p>}
    {target.comment && <p>原因：{String(target.comment)}</p>}
    {preview.before && preview.after && <p>这是对现有静默的修改，原配置与变更字段请展开核对。</p>}
    {preview.impact && <Alert type="warning" showIcon message={`当前匹配 ${preview.impact.total} 条告警`} description="生效期间新增的匹配告警也会静默；确认时将重新校验。范围变化或预览过期需要重新申请。" />}
  </div>;
};
const statusText = { completed: '查询成功', failed: '失败', pending_confirmation: '等待确认', executed: '已执行', expired: '已过期', executing: '执行中' };

export const Copilot = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const tenantId=localStorage.getItem('TenantID') || '';
  const initialEvent=location.state?.tenantId===tenantId ? location.state.event : undefined;
  const [selectedEvent,setSelectedEvent]=useState(initialEvent);
  const [windowMinutes,setWindowMinutes]=useState(30);
  const [queryWindow,setQueryWindow]=useState(null);
  const returnTo=safeAlertReturn(location.state?.returnTo,location.state?.tenantId,tenantId);
  const [capabilities, setCapabilities] = useState(null);
  const [capabilityError, setCapabilityError] = useState('');
  const [capabilityLoading, setCapabilityLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [sessionError, setSessionError] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [runError, setRunError] = useState('');
  const [runStatus, setRunStatus] = useState('');
  const abortRef = useRef(null);
  const busyRef = useRef(false);
  const sessionRequest = useRef(0);

  const loadCapabilities = useCallback(async () => {
    setCapabilityLoading(true); setCapabilityError('');
    try { setCapabilities(await getAgentCapabilities()); }
    catch (error) { setCapabilities(null); setCapabilityError(error.message); }
    finally { setCapabilityLoading(false); }
  }, []);
  const loadSessions = useCallback(async () => {
    try { setSessions(await listAgentSessions() || []); setSessionError(''); }
    catch { setSessionError('历史会话加载失败'); }
  }, []);
  useEffect(() => { loadCapabilities(); loadSessions(); return () => { abortRef.current?.abort(); sessionRequest.current++; }; }, [loadCapabilities, loadSessions]);
  const disabled = capabilityLoading || Boolean(capabilityError) || !capabilities?.enabled || restoring;
  const canPropose = capabilities?.canWrite && capabilities?.enabled;
  const newConversation = () => {
    if (busyRef.current) return;
    sessionRequest.current++; setSelectedEvent(initialEvent); setQueryWindow(null); setSessionId(null); setMessages([]); setRunError(''); setInput('');
  };
  const restore = async id => {
    if (busyRef.current) return;
    const sequence = ++sessionRequest.current;
    setRestoring(true); setRunError('');
    try {
      const result = await getAgentSession(id);
      if (sequence !== sessionRequest.current) return;
      setSelectedEvent(null); setQueryWindow(null); setSessionId(result.session.id);
      setMessages((result.messages || []).map(item => ({ ...item, evidence: parseEvidence(item.evidence) })));
    } catch (error) { setRunError(error.message); }
    finally { if (sequence === sessionRequest.current) setRestoring(false); }
  };

  const send = async (question = input) => {
    const content = question.trim();
    if (!content || disabled || busyRef.current) return;
    busyRef.current = true; setLoading(true); setRunError(''); setInput('');
    const end=Math.floor(Date.now()/1000);
    const timeRange={start:end-windowMinutes*60,end};
    setQueryWindow(timeRange);
    const replyId = crypto.randomUUID();
    setMessages(current => [...current, { id: crypto.randomUUID(), role: 'user', content }, { id: replyId, role: 'assistant', content: '', evidence: [] }]);
    const controller = new AbortController(); abortRef.current = controller;
    let finalReceived = false;
    const updateReply = patch => setMessages(current => current.map(item => item.id === replyId ? { ...item, ...patch } : item));
    const streamedReply = coalescedUpdate(content => updateReply({ content }));
    try {
      let activeId = sessionId;
      if (!activeId) { const created = await createAgentSession({ title: selectedEvent ? eventName(selectedEvent) : content }); activeId = created.id; setSessionId(activeId); }
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      let text = '';
      await streamAgentMessage({ sessionId: activeId, content, context: { selectedAlert: compactEvent(selectedEvent), timeRange } }, event => {
        if (event.type === 'status') setRunStatus(event.message || '正在分析…');
        if (event.type === 'delta') { text += event.delta || ''; streamedReply.push(text); }
        if (event.type === 'error') throw new Error(event.message || '分析失败');
        if (event.type === 'done') { finalReceived = true; streamedReply.cancel(); updateReply({ content: event.content || text, evidence: parseEvidence(event.evidence) }); }
      }, controller.signal);
      if (!finalReceived) throw new Error('连接中断，尚未收到完整分析结果。');
    } catch (error) {
      streamedReply.flush();
      const reason = error.name === 'AbortError' ? '已停止生成；本轮内容可能不完整。' : error.message;
      setRunError(reason); updateReply({ incomplete: true });
    } finally {
      streamedReply.cancel();
      busyRef.current = false; setLoading(false); setRunStatus(''); abortRef.current = null; loadSessions();
    }
  };

  const confirmAction = item => {
    if (!canPropose || !item.actionId || !item.payloadHash) return;
    Modal.confirm({
      title: '确认执行此操作？', okText: '确认执行', cancelText: '取消',
      okButtonProps: { danger: item.riskLevel === 'high' },
      content: <div><p>请核对目标、标签与有效时间。后端将重新检查当前权限和目标状态。</p>{actionSummary(item.preview)}<details><summary>查看完整操作参数与影响范围</summary><pre className="copilot-action-preview">{typeof item.preview === 'string' ? item.preview : JSON.stringify(item.preview, null, 2)}</pre></details></div>,
      onOk: async () => {
        try {
          const action = await confirmAgentAction({ actionId: item.actionId, payloadHash: item.payloadHash });
          if (action.status !== 'executed') throw new Error(action.result || '操作尚未成功执行');
          setMessages(current => current.map(msg => ({ ...msg, evidence: parseEvidence(msg.evidence).map(entry => entry.actionId === item.actionId ? { ...entry, status: 'executed', summary: 'WatchAlert 已执行此操作', result: action.result } : entry) })));
          message.success('操作已执行');
        } catch (error) { message.error(error.message); throw error; }
      },
    });
  };

  const evidenceView = items => items.map((item, index) => <div className="copilot-tool-evidence" key={item.actionId || index}>
    <div className="copilot-tool-evidence__title"><strong>{item.toolName}</strong><Tag color={item.status === 'failed' ? 'error' : item.status === 'pending_confirmation' ? 'warning' : 'default'}>{statusText[item.status] || item.status}</Tag></div>
    <p>{item.summary}</p>
    <p>查询时间：{stamp(item.queriedAt)}{item.truncated ? ' · 结果已截断，不能作为完整统计' : ''}</p>
    {item.source && <pre>{JSON.stringify(item.source, null, 2)}</pre>}
    {item.query && <pre>{JSON.stringify(item.query, null, 2)}</pre>}
    {item.status === 'executed' && <div><Button onClick={()=>navigate(returnTo)}>返回告警核对状态</Button>{item.toolName?.startsWith('silences.') && <Button onClick={()=>navigate('/silenceRules')}>查看静默规则</Button>}</div>}
    {item.status === 'pending_confirmation' && <Button disabled={!canPropose || loading || capabilityLoading || Boolean(capabilityError)} danger={item.riskLevel === 'high'} onClick={() => confirmAction(item)}>查看并确认</Button>}
  </div>);

  return <div className="copilot-workspace">
    <header className="copilot-workspace__header"><div><h1><Bot size={23} /> WatchAlert Copilot</h1><p>查询告警与指标，核对证据，再决定处置。</p></div><Button onClick={() => navigate(returnTo)}>{location.state?.returnTo ? '返回告警现场' : '查看告警'}</Button></header>
    <div className="copilot-session-bar">
      <Select aria-label="历史会话" placeholder="恢复历史会话" value={sessionId || undefined} options={sessions.map(session => ({ label: session.title || '未命名会话', value: session.id }))} onChange={restore} disabled={loading || restoring} showSearch optionFilterProp="label" />
      <Button icon={<Plus size={14} />} onClick={newConversation} disabled={loading || restoring}>新对话</Button>
      <span>{capabilityLoading ? '正在读取能力…' : capabilityError ? '能力不可用' : !capabilities?.enabled ? 'Agent 未启用' : canPropose ? '可查询 · 可申请操作，需确认' : '仅查询'}</span>
    </div>
    <ConnectionDiagnostics />
    {sessionError && <Alert type="warning" showIcon message={sessionError} action={<Button onClick={loadSessions}>重试</Button>} />}
    {capabilityError && <Alert type="error" showIcon message={capabilityError} action={<Button onClick={loadCapabilities}>重试</Button>} />}
    {!capabilityLoading && !capabilityError && !capabilities?.enabled && <Alert type="info" showIcon message="Copilot Agent 尚未启用" description="请联系管理员在系统设置中配置模型并启用 Agent。此页面不会自动切换到旧版 AI。" />}
    {selectedEvent && <div className="copilot-scope"><strong>当前线索：{eventName(selectedEvent)}</strong><span>{scopeName(getAlertScope(selectedEvent))} · {scopeResource(getAlertScope(selectedEvent))}</span><small>页面上下文仅作线索，分析需重新查询；历史消息保留原有证据。</small><Button size="small" disabled={loading} onClick={()=>setSelectedEvent(null)}>移除当前线索</Button></div>}
    {capabilities?.scope?.environments?.length > 0 && <p className="copilot-scope-note">授权环境：{capabilities.scope.environments.join('、')}</p>}
    <div className="copilot-time-window"><span>本轮分析范围</span><Select aria-label="分析时间范围" disabled={loading || restoring} value={windowMinutes} onChange={setWindowMinutes} options={[{value:30,label:'最近 30 分钟'},{value:60,label:'最近 1 小时'},{value:360,label:'最近 6 小时'}]} /><small>{queryWindow ? `最近发送：${stamp(queryWindow.start)} — ${stamp(queryWindow.end)}` : '发送时固定时间窗口，实际查询范围以证据为准'}</small></div>
    <main className="copilot-conversation" aria-label="Copilot 对话">
      {restoring ? <Spin /> : !messages.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="描述你要排查的问题，或从告警详情带入事件。" /> : messages.map((item, index) => <article className={`copilot-turn copilot-turn--${item.role}`} key={item.id || index}>
        <div className="copilot-turn__role">{item.role === 'user' ? '你' : 'Copilot'}{item.incomplete && <Tag>未完成</Tag>}</div>
        {item.role === 'user' ? <p>{item.content}</p> : <MarkdownRenderer data={item.content || (loading ? '正在查询…' : '未生成完整回复')} />}
        {parseEvidence(item.evidence).length > 0 && <Collapse className="copilot-message-evidence" items={[{ key: 'evidence', label: `数据来源与操作（${parseEvidence(item.evidence).length}）`, children: evidenceView(parseEvidence(item.evidence)) }]} />}
      </article>)}
      {loading && <div className="copilot-run-status" role="status"><Spin size="small" /> {runStatus || '正在分析受控数据…'}</div>}
    </main>
    {runError && <Alert type="warning" showIcon message={runError} />}
    <div className="copilot-workspace__composer">
      <div className="copilot-quick-actions">{['汇总当前告警', '分析当前告警并查询相关指标', '给出下一步排查建议'].map(text => <Button key={text} disabled={disabled || loading} onClick={() => send(text)}>{text}</Button>)}</div>
      <Input.TextArea aria-label="输入问题" value={input} disabled={disabled || loading} onChange={event => setInput(event.target.value)} onPressEnter={event => { if (!event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} placeholder="例如：生产环境 payment 服务最近半小时有哪些异常？" autoSize={{ minRows: 3, maxRows: 8 }} />
      <div className="copilot-composer-footer"><small>AI 判断需结合证据核对。静默与认领仅在授权且确认后执行。</small>{loading ? <Button icon={<Square size={14} />} onClick={() => abortRef.current?.abort()}>停止生成</Button> : <Button type="primary" icon={<ArrowUp size={15} />} disabled={disabled || !input.trim()} onClick={() => send()}>发送</Button>}</div>
    </div>
  </div>;
};
