import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Empty, Input, Modal, Select, Spin, message } from 'antd';
import { ArrowUp, Bot, DatabaseZap, ShieldCheck, Sparkles } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FaultCenterList } from '../../api/faultCenter';
import { getCurEventList } from '../../api/event';
import { ReqAiAnalyze } from '../../api/ai';
import { confirmAgentAction, createAgentSession, getAgentCapabilities, streamAgentMessage } from '../../api/agent';
import MarkdownRenderer from '../../utils/MarkdownRenderer';
import './index.css';

const eventName = event => event?.rule_name || event?.ruleName || '未命名告警规则';
const parseEvidence = value => { try { return value ? (Array.isArray(value) ? value : JSON.parse(value)) : []; } catch (_) { return []; } };
const compactEvent = event => event ? ({
    fingerprint: event.fingerprint,
    ruleId: event.rule_id || event.ruleId,
    ruleName: eventName(event),
    faultCenterId: event.faultCenterId || event.fault_center_id,
    datasourceId: event.datasource_id || event.datasourceId,
    datasourceType: event.datasource_type || event.datasourceType,
    severity: event.severity,
    lifecycleStatus: event.lifecycle_status || event.lifecycleStatus || event.status,
    labels: event.labels || {},
    annotations: event.annotations || '',
}) : {};

export const Copilot = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [centers, setCenters] = useState([]);
    const [centerId, setCenterId] = useState();
    const [events, setEvents] = useState([]);
    const [selectedEvent, setSelectedEvent] = useState(location.state?.event || null);
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState(() => location.state?.event ? [{ role: 'assistant', content: `已载入「${eventName(location.state.event)}」的实时上下文。你可以让我分析根因、影响范围或建议处置步骤。` }] : []);
    const [loading, setLoading] = useState(false);
    const [capabilities, setCapabilities] = useState(null);
    const [sessionId, setSessionId] = useState(null);
    const [toolEvidence, setToolEvidence] = useState([]);

    const loadEvents = useCallback(async () => {
        try {
            const centersRes = await FaultCenterList();
            const list = centersRes?.data || [];
            setCenters(list);
            const activeCenter = centerId || list[0]?.id;
            setCenterId(activeCenter);
            if (!activeCenter) return;
            const eventsRes = await getCurEventList({ faultCenterId: activeCenter, index: 1, size: 30 });
            const nextEvents = eventsRes?.data?.list || [];
            setEvents(nextEvents);
            setSelectedEvent(current => current || nextEvents[0] || null);
        } catch (error) { console.error('Unable to load Copilot context:', error); }
    }, [centerId]);

    useEffect(() => { loadEvents(); }, [loadEvents]);
    useEffect(() => {
        getAgentCapabilities().then(response => setCapabilities(response?.data || null)).catch(() => setCapabilities({ enabled: false }));
    }, []);
    useEffect(() => {
        if (!centerId) return;
        getCurEventList({ faultCenterId: centerId, index: 1, size: 30 })
            .then(res => { const nextEvents = res?.data?.list || []; setEvents(nextEvents); setSelectedEvent(current => nextEvents.find(item => item.fingerprint === current?.fingerprint) || nextEvents[0] || null); })
            .catch(() => setEvents([]));
    }, [centerId]);

    const evidence = useMemo(() => {
        if (!selectedEvent) return [];
        const labels = selectedEvent.labels && typeof selectedEvent.labels === 'object' ? Object.entries(selectedEvent.labels).slice(0, 4) : [];
        return [['规则', eventName(selectedEvent)], ['数据源', selectedEvent.datasource_type || selectedEvent.datasourceType || '-'], ['级别', selectedEvent.severity || 'P2'], ...labels.map(([key, value]) => [key, String(value)])];
    }, [selectedEvent]);

    const sendLegacyMessage = async content => {
        if (!selectedEvent) throw new Error('旧版 AI 需要先选择一条活跃告警；请启用新版 Copilot。');
        const sourceContent = typeof selectedEvent.annotations === 'string' ? selectedEvent.annotations : JSON.stringify(selectedEvent.annotations || selectedEvent.log || selectedEvent.labels || {}, null, 2);
        const form = new FormData();
        form.append('ruleName', eventName(selectedEvent));
        form.append('ruleId', selectedEvent.rule_id || selectedEvent.ruleId || selectedEvent.fingerprint || 'watchalert-copilot');
        form.append('content', `${sourceContent}\n\n用户问题：${content}`);
        form.append('searchQL', selectedEvent.searchQL || '');
        form.append('deep', 'true');
        const response = await ReqAiAnalyze(form);
        return { content: response?.data || '暂未得到可用分析结果。请稍后重试。', evidence: [] };
    };

    const send = async (question = input) => {
        const content = question.trim();
        if (!content || loading) return;
        setMessages(current => [...current, { role: 'user', content }]);
        setInput('');
        setLoading(true);
        try {
            let reply;
            let streamed = false;
            if (capabilities?.enabled) {
                let activeSessionId = sessionId;
                if (!activeSessionId) {
                    const created = await createAgentSession({ title: selectedEvent ? eventName(selectedEvent) : content });
                    activeSessionId = created?.data?.id;
                    if (!activeSessionId) throw new Error('Copilot 会话创建失败');
                    setSessionId(activeSessionId);
                }
                streamed = true;
                let streamedContent = '';
                let streamedReply = null;
                let streamError = '';
                setMessages(current => [...current, { role: 'assistant', content: '' }]);
                await streamAgentMessage({ sessionId: activeSessionId, content, context: { selectedAlert: compactEvent(selectedEvent) } }, event => {
                    if (event.type === 'delta' && event.delta) {
                        streamedContent += event.delta;
                        setMessages(current => current.map((item, index) => index === current.length - 1 ? { ...item, content: streamedContent } : item));
                    } else if (event.type === 'done') {
                        streamedReply = { content: event.content || streamedContent || '暂未得到可用分析结果。请稍后重试。', evidence: parseEvidence(event.evidence) };
                    } else if (event.type === 'error') {
                        streamError = event.message || 'Copilot 流式分析失败';
                    }
                });
                if (streamError) throw new Error(streamError);
                if (!streamedReply) throw new Error('Copilot 流式服务未返回完成结果');
                reply = streamedReply;
                if (!streamedContent) setMessages(current => current.map((item, index) => index === current.length - 1 ? { ...item, content: reply.content } : item));
            } else {
                reply = await sendLegacyMessage(content);
            }
            setToolEvidence(reply.evidence || []);
            if (!streamed) setMessages(current => [...current, { role: 'assistant', content: reply.content, evidence: reply.evidence }]);
        } catch (error) {
            console.error('Copilot request failed:', error);
            message.error(error?.message || '分析请求失败，请检查 Copilot 配置。');
            setMessages(current => current[current.length - 1]?.role === 'assistant' && !current[current.length - 1]?.content ? current.map((item, index) => index === current.length - 1 ? { ...item, content: '分析请求失败。请检查 Copilot 配置、权限及当前数据源后重试。' } : item) : [...current, { role: 'assistant', content: '分析请求失败。请检查 Copilot 配置、权限及当前数据源后重试。' }]);
        } finally { setLoading(false); }
    };

    const confirmAction = item => {
        if (!item.actionId || !item.payloadHash) return;
        const preview = item.preview ? (typeof item.preview === 'string' ? item.preview : JSON.stringify(item.preview, null, 2)) : '未提供操作预览';
        Modal.confirm({
            title: '确认执行此操作？',
            content: <div><p>该操作将由 WatchAlert 后端执行。{item.riskLevel === 'high' ? '这是高风险操作，请再次核对目标范围。' : ''}</p><pre className="copilot-action-preview">{preview}</pre></div>,
            okText: '确认执行',
            cancelText: '取消',
            okButtonProps: { danger: item.riskLevel === 'high' },
            onOk: async () => {
                const response = await confirmAgentAction({ actionId: item.actionId, payloadHash: item.payloadHash });
                const action = response?.data;
                if (action?.status !== 'executed') throw new Error(action?.result || '操作未成功执行');
                setToolEvidence(current => current.map(entry => entry.actionId === item.actionId ? { ...entry, status: 'executed', summary: '已由 WatchAlert 后端执行' } : entry));
                message.success('操作已执行');
            },
        });
    };

    const shortcuts = ['汇总当前告警', '生成处置步骤', '判断影响范围', '分析可能根因'];

    return (
        <div className="copilot-page">
            <aside className="copilot-context">
                <div className="copilot-context__head"><div><span>实时上下文</span><strong>活跃告警</strong></div><Button type="text" onClick={loadEvents}>刷新</Button></div>
                <Select value={centerId} onChange={setCenterId} placeholder="选择故障中心" options={centers.map(item => ({ label: item.name, value: item.id }))} />
                <div className="copilot-event-list">
                    {events.length ? events.map((event, index) => <button key={`${event.fingerprint}-${index}`} className={`copilot-event ${selectedEvent?.fingerprint === event.fingerprint ? 'is-selected' : ''}`} onClick={() => { setSelectedEvent(event); setToolEvidence([]); setSessionId(null); setMessages([{ role: 'assistant', content: `已切换到「${eventName(event)}」。我会将它作为本轮分析线索，并通过受控 Tool 验证事实。` }]); }}><span className={`copilot-event__dot ${event.severity === 'P0' ? 'critical' : event.severity === 'P1' ? 'warning' : ''}`} /><span><strong>{eventName(event)}</strong><small>{event.severity || 'P2'} · {event.datasource_type || '数据源'}</small></span></button>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无活跃告警" />}
                </div>
            </aside>
            <main className="copilot-chat">
                <header className="copilot-chat__head"><div><div className="copilot-chat__title"><span><Bot size={16} /></span><strong>WatchAlert Copilot</strong>{capabilities?.enabled && <small className="copilot-live"><ShieldCheck size={11} /> 受控 Tool</small>}</div><p>{capabilities?.enabled ? '基于受控数据查询，结论会附带证据。' : '以当前告警上下文为依据，辅助完成分析与处置。'}</p></div><Button onClick={() => navigate('/alerts')}>查看告警</Button></header>
                <div className="copilot-messages">
                    {!messages.length && <div className="copilot-welcome"><span><Sparkles size={20} /></span><h1>{capabilities?.enabled ? '从问题开始，而不只是从一条告警开始' : '从一条活跃告警开始'}</h1><p>{capabilities?.enabled ? 'Copilot 可在你的权限范围内查询告警、规则、故障中心和 Prometheus，并展示实际使用的证据。' : '选择左侧事件后，Copilot 会关联规则、标签和告警内容，给出可验证的分析建议。'}</p></div>}
                    {messages.map((item, index) => <article key={index} className={`copilot-message copilot-message--${item.role}`}><div className="copilot-message__role"><span>{item.role === 'assistant' ? <Bot size={13} /> : '你'}</span><strong>{item.role === 'assistant' ? 'WatchAlert Copilot' : '你'}</strong></div><div className="copilot-message__body">{item.role === 'assistant' ? <MarkdownRenderer data={item.content} /> : item.content}</div></article>)}
                    {loading && <article className="copilot-message copilot-message--assistant"><div className="copilot-message__role"><span><Bot size={13} /></span><strong>WatchAlert Copilot</strong></div><div className="copilot-thinking"><Spin size="small" /> {capabilities?.enabled ? '正在查询受控数据源…' : '正在检查事件上下文…'}</div></article>}
                </div>
                <div className="copilot-shortcuts">{shortcuts.map(shortcut => <button key={shortcut} onClick={() => send(shortcut)}>{shortcut}</button>)}</div>
                <div className="copilot-composer"><Input.TextArea value={input} onChange={event => setInput(event.target.value)} onPressEnter={event => { if (!event.shiftKey) { event.preventDefault(); send(); } }} placeholder={capabilities?.enabled ? '例如：生产环境 payment 服务有哪些 P1 告警？' : '询问根因、影响范围或处置建议…'} autoSize={{ minRows: 3, maxRows: 6 }} /><Button type="primary" shape="circle" icon={<ArrowUp size={16} />} loading={loading} onClick={() => send()} aria-label="发送" /></div>
                <p className="copilot-disclaimer">AI 输出仅用于辅助判断；操作变更必须经人工确认。{capabilities?.enabled ? ' 当前页面仅开放查询 Tool。' : ''}</p>
            </main>
            <aside className="copilot-evidence"><div className="copilot-evidence__head"><strong>分析证据</strong><span>{toolEvidence.length || evidence.length} 项</span></div>{selectedEvent && <section><h2>当前事件</h2><strong className="copilot-evidence__event">{eventName(selectedEvent)}</strong><p>选择该事件作为本轮分析线索。</p></section>}{toolEvidence.length > 0 ? <section><h2>本轮数据查询</h2>{toolEvidence.map((item, index) => <div className="copilot-tool-evidence" key={`${item.toolName}-${index}`}><span><DatabaseZap size={12} /> {item.toolName}</span><strong className={item.status === 'completed' || item.status === 'executed' ? 'is-success' : item.status === 'pending_confirmation' ? 'is-pending' : 'is-failed'}>{item.status === 'completed' ? '已验证' : item.status === 'pending_confirmation' ? '等待确认' : item.status === 'executed' ? '已执行' : '失败'}</strong><p>{item.summary}</p>{item.status === 'pending_confirmation' && <Button size="small" danger={item.riskLevel === 'high'} onClick={() => confirmAction(item)}>查看并确认</Button>}</div>)}</section> : selectedEvent ? <section><h2>关联字段</h2>{evidence.map(([key, value]) => <div className="copilot-evidence__item" key={key}><span>{key}</span><strong>{value}</strong></div>)}</section> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="提问后显示查询证据" />}{selectedEvent && <section><h2>下一步</h2><Button block onClick={() => navigate('/alerts')}>打开事件处置</Button></section>}</aside>
        </div>
    );
};
