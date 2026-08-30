import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Empty, Input, Select, Spin, message } from 'antd';
import { ArrowUp, Bot, Sparkles } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FaultCenterList } from '../../api/faultCenter';
import { getCurEventList } from '../../api/event';
import { ReqAiAnalyze } from '../../api/ai';
import MarkdownRenderer from '../../utils/MarkdownRenderer';
import './index.css';

const eventName = event => event?.rule_name || event?.ruleName || '未命名告警规则';

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
        if (!centerId) return;
        getCurEventList({ faultCenterId: centerId, index: 1, size: 30 })
            .then(res => { const nextEvents = res?.data?.list || []; setEvents(nextEvents); setSelectedEvent(current => nextEvents.find(item => item.fingerprint === current?.fingerprint) || nextEvents[0] || null); })
            .catch(() => setEvents([]));
    }, [centerId]);

    const evidence = useMemo(() => {
        if (!selectedEvent) return [];
        const labels = selectedEvent.labels && typeof selectedEvent.labels === 'object' ? Object.entries(selectedEvent.labels).slice(0, 4) : [];
        return [
            ['规则', eventName(selectedEvent)],
            ['数据源', selectedEvent.datasource_type || selectedEvent.datasourceType || '-'],
            ['级别', selectedEvent.severity || 'P2'],
            ...labels.map(([key, value]) => [key, String(value)]),
        ];
    }, [selectedEvent]);

    const send = async (question = input) => {
        const content = question.trim();
        if (!content) return;
        if (!selectedEvent) { message.warning('请先选择一条活跃告警，Copilot 才能获得可靠的分析上下文'); return; }
        setMessages(current => [...current, { role: 'user', content }]);
        setInput('');
        setLoading(true);
        try {
            const sourceContent = typeof selectedEvent.annotations === 'string' ? selectedEvent.annotations : JSON.stringify(selectedEvent.annotations || selectedEvent.log || selectedEvent.labels || {}, null, 2);
            const form = new FormData();
            form.append('ruleName', eventName(selectedEvent));
            form.append('ruleId', selectedEvent.rule_id || selectedEvent.ruleId || selectedEvent.fingerprint || 'watchalert-copilot');
            form.append('content', `${sourceContent}\n\n用户问题：${content}`);
            form.append('searchQL', selectedEvent.searchQL || '');
            form.append('deep', 'true');
            const response = await ReqAiAnalyze(form);
            setMessages(current => [...current, { role: 'assistant', content: response?.data || '暂未得到可用分析结果。请稍后重试。' }]);
        } catch (error) {
            console.error('Copilot request failed:', error);
            setMessages(current => [...current, { role: 'assistant', content: '分析请求失败，请检查 AI 配置及当前告警上下文后重试。' }]);
        } finally { setLoading(false); }
    };

    const shortcuts = ['生成处置步骤', '判断影响范围', '分析可能根因'];

    return (
        <div className="copilot-page">
            <aside className="copilot-context">
                <div className="copilot-context__head"><div><span>实时上下文</span><strong>活跃告警</strong></div><Button type="text" onClick={loadEvents}>刷新</Button></div>
                <Select value={centerId} onChange={setCenterId} placeholder="选择故障中心" options={centers.map(item => ({ label: item.name, value: item.id }))} />
                <div className="copilot-event-list">
                    {events.length ? events.map((event, index) => <button key={`${event.fingerprint}-${index}`} className={`copilot-event ${selectedEvent?.fingerprint === event.fingerprint ? 'is-selected' : ''}`} onClick={() => { setSelectedEvent(event); setMessages([{ role: 'assistant', content: `已切换到「${eventName(event)}」。我会用当前事件的标签、规则与原始内容作为分析依据。` }]); }}><span className={`copilot-event__dot ${event.severity === 'P0' ? 'critical' : event.severity === 'P1' ? 'warning' : ''}`} /><span><strong>{eventName(event)}</strong><small>{event.severity || 'P2'} · {event.datasource_type || '数据源'}</small></span></button>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无活跃告警" />}
                </div>
            </aside>
            <main className="copilot-chat">
                <header className="copilot-chat__head"><div><div className="copilot-chat__title"><span><Bot size={16} /></span><strong>WatchAlert Copilot</strong></div><p>以当前告警上下文为依据，辅助完成分析与处置。</p></div><Button onClick={() => navigate('/alerts')}>查看告警</Button></header>
                <div className="copilot-messages">
                    {!messages.length && <div className="copilot-welcome"><span><Sparkles size={20} /></span><h1>从一条活跃告警开始</h1><p>选择左侧事件后，Copilot 会关联规则、标签和告警内容，给出可验证的分析建议。</p></div>}
                    {messages.map((item, index) => <article key={index} className={`copilot-message copilot-message--${item.role}`}><div className="copilot-message__role"><span>{item.role === 'assistant' ? <Bot size={13} /> : '你'}</span><strong>{item.role === 'assistant' ? 'WatchAlert Copilot' : '你'}</strong></div><div className="copilot-message__body">{item.role === 'assistant' ? <MarkdownRenderer data={item.content} /> : item.content}</div></article>)}
                    {loading && <article className="copilot-message copilot-message--assistant"><div className="copilot-message__role"><span><Bot size={13} /></span><strong>WatchAlert Copilot</strong></div><div className="copilot-thinking"><Spin size="small" /> 正在检查事件上下文…</div></article>}
                </div>
                <div className="copilot-shortcuts">{shortcuts.map(shortcut => <button key={shortcut} onClick={() => send(shortcut)}>{shortcut}</button>)}</div>
                <div className="copilot-composer"><Input.TextArea value={input} onChange={event => setInput(event.target.value)} onPressEnter={event => { if (!event.shiftKey) { event.preventDefault(); send(); } }} placeholder="询问根因、影响范围或处置建议…" autoSize={{ minRows: 3, maxRows: 6 }} /><Button type="primary" shape="circle" icon={<ArrowUp size={16} />} loading={loading} onClick={() => send()} aria-label="发送" /></div>
                <p className="copilot-disclaimer">AI 输出仅用于辅助判断；执行变更前请人工确认。</p>
            </main>
            <aside className="copilot-evidence"><div className="copilot-evidence__head"><strong>分析证据</strong><span>{evidence.length} 项</span></div>{selectedEvent ? <><section><h2>当前事件</h2><strong className="copilot-evidence__event">{eventName(selectedEvent)}</strong><p>选择该事件作为本轮对话的分析范围。</p></section><section><h2>关联字段</h2>{evidence.map(([key, value]) => <div className="copilot-evidence__item" key={key}><span>{key}</span><strong>{value}</strong></div>)}</section><section><h2>下一步</h2><Button block onClick={() => navigate('/alerts')}>打开事件处置</Button></section></> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="选择告警后显示证据" />}</aside>
        </div>
    );
};
