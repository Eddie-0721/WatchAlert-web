import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Drawer, Empty, Input, Select, Spin, Tag, message } from 'antd';
import { BellOff, Check, ChevronRight, Filter, Search, Sparkles, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { FaultCenterList } from '../../api/faultCenter';
import { getCurEventList, getHisEventList, ProcessAlertEvent } from '../../api/event';
import { FormatTime } from '../../utils/lib';
import './index.css';

const levelClass = value => ({ P0: 'critical', P1: 'warning', P2: 'info' }[value] || 'info');
const lifecycleText = value => ({ alerting: '告警中', pending_recovery: '待恢复', recovered: '已恢复', pre_alert: '预告警' }[value] || '告警中');
const lifecycleOf = event => event?.lifecycle_status || event?.lifecycleStatus || (['pre_alert', 'alerting', 'pending_recovery', 'recovered'].includes(event?.status) ? event.status : 'alerting');
const acknowledgedOf = event => event?.acknowledged ?? event?.confirmState?.isOk ?? event?.status === 'processing';
const silencedOf = event => event?.silenced ?? event?.status === 'muting';
const isRecovered = event => lifecycleOf(event) === 'recovered' || Boolean(event?.recover_time);

const queueDefinitions = [
    { key: 'attention', label: '需处理' },
    { key: 'processing', label: '处理中' },
    { key: 'suppressed', label: '已抑制' },
    { key: 'observing', label: '观察中' },
    { key: 'all', label: '全部活跃' },
    { key: 'history', label: '历史事件' },
];

const belongsToQueue = (event, queue) => {
    const lifecycle = lifecycleOf(event);
    const acknowledged = acknowledgedOf(event);
    const silenced = silencedOf(event);
    if (queue === 'all') return lifecycle !== 'recovered';
    if (queue === 'suppressed') return lifecycle !== 'recovered' && silenced;
    if (queue === 'observing') return lifecycle === 'pre_alert' && !silenced;
    if (queue === 'processing') return lifecycle !== 'recovered' && lifecycle !== 'pre_alert' && acknowledged && !silenced;
    return lifecycle !== 'recovered' && lifecycle !== 'pre_alert' && !acknowledged && !silenced;
};

const StateBadges = ({ event }) => (
    <span className="alert-state-badges">
        <span className={`alert-state-badge alert-state-badge--${lifecycleOf(event)}`}>{lifecycleText(lifecycleOf(event))}</span>
        {acknowledgedOf(event) && <span className="alert-state-badge alert-state-badge--acknowledged">已认领</span>}
        {silencedOf(event) && <span className="alert-state-badge alert-state-badge--silenced">已静默</span>}
    </span>
);

export const AlertStream = () => {
    const navigate = useNavigate();
    const [centers, setCenters] = useState([]);
    const [centerId, setCenterId] = useState();
    const [events, setEvents] = useState([]);
    const [historyEvents, setHistoryEvents] = useState([]);
    const [selected, setSelected] = useState(null);
    const [queue, setQueue] = useState('attention');
    const [query, setQuery] = useState('');
    const [severity, setSeverity] = useState();
    const [loading, setLoading] = useState(true);
    const [historyLoading, setHistoryLoading] = useState(false);

    const loadCenters = useCallback(async () => {
        const res = await FaultCenterList();
        const list = res?.data || [];
        setCenters(list);
        setCenterId(current => current || list[0]?.id);
    }, []);

    const loadEvents = useCallback(async () => {
        if (!centerId) { setEvents([]); setLoading(false); return; }
        try {
            setLoading(true);
            const res = await getCurEventList({ faultCenterId: centerId, index: 1, size: 100, query: query || undefined, severity: severity || undefined });
            setEvents((res?.data?.list || []).filter(event => !isRecovered(event)));
        } catch (error) {
            console.error('Unable to load alert stream:', error);
            message.error('加载告警失败');
        } finally { setLoading(false); }
    }, [centerId, query, severity]);

    const loadHistory = useCallback(async () => {
        if (!centerId) { setHistoryEvents([]); return; }
        try {
            setHistoryLoading(true);
            const res = await getHisEventList({ faultCenterId: centerId, index: 1, size: 100, query: query || undefined, severity: severity || undefined });
            setHistoryEvents((res?.data?.list || []).map(event => ({ ...event, lifecycle_status: 'recovered' })));
        } catch (error) {
            console.error('Unable to load alert history:', error);
            message.error('加载历史事件失败');
        } finally { setHistoryLoading(false); }
    }, [centerId, query, severity]);

    useEffect(() => { loadCenters().catch(() => message.error('加载故障中心失败')); }, [loadCenters]);
    useEffect(() => { loadEvents(); }, [loadEvents]);
    useEffect(() => { if (queue === 'history') loadHistory(); }, [loadHistory, queue]);
    useEffect(() => { setSelected(null); }, [queue]);

    const counts = useMemo(() => queueDefinitions.reduce((result, item) => {
        result[item.key] = item.key === 'history' ? historyEvents.length : events.filter(event => belongsToQueue(event, item.key)).length;
        return result;
    }, {}), [events, historyEvents]);

    const visibleEvents = useMemo(() => queue === 'history' ? historyEvents : events.filter(event => belongsToQueue(event, queue)), [events, historyEvents, queue]);
    const currentLoading = queue === 'history' ? historyLoading : loading;

    const refresh = () => {
        loadEvents();
        if (queue === 'history') loadHistory();
    };

    const claimEvent = async () => {
        if (!selected) return;
        try {
            await ProcessAlertEvent({ state: 1, faultCenterId: selected.faultCenterId || centerId, fingerprints: [selected.fingerprint] });
            message.success('告警已确认并分配给当前用户');
            setSelected(current => ({ ...current, acknowledged: true, status: 'processing' }));
            setEvents(current => current.map(event => event.fingerprint === selected.fingerprint ? { ...event, acknowledged: true, status: 'processing' } : event));
        } catch (error) { message.error('确认告警失败'); }
    };

    return (
        <div className="alert-stream-page">
            <header className="alert-stream-header">
                <div><h1>告警</h1><p>按信号状态、处置进度和抑制策略组织当前事件。</p></div>
                <div className="alert-stream-actions"><Button onClick={refresh}>刷新</Button><Button type="primary" icon={<Sparkles size={15} />} onClick={() => navigate('/copilot')}>在 Copilot 中分析</Button></div>
            </header>
            <nav className="alert-queue-tabs" aria-label="告警工作队列">
                {queueDefinitions.map(item => <button key={item.key} className={queue === item.key ? 'is-active' : ''} onClick={() => setQueue(item.key)}><span>{item.label}</span>{item.key !== 'history' || counts.history > 0 ? <strong>{counts[item.key] || 0}</strong> : null}</button>)}
            </nav>
            <div className="alert-stream-toolbar">
                <Input prefix={<Search size={15} />} allowClear placeholder="搜索告警、规则或标签" value={query} onChange={event => setQuery(event.target.value)} onPressEnter={queue === 'history' ? loadHistory : loadEvents} />
                <Select value={centerId} onChange={setCenterId} placeholder="故障中心" options={centers.map(item => ({ label: item.name, value: item.id }))} />
                <Select value={severity} allowClear onChange={setSeverity} placeholder="全部级别" suffixIcon={<Filter size={14} />} options={[{ label: 'P0 · 严重', value: 'P0' }, { label: 'P1 · 警告', value: 'P1' }, { label: 'P2 · 提示', value: 'P2' }]} />
            </div>
            <div className="alert-stream-meta"><span>{queue === 'history' ? '历史事件' : '当前队列'}</span><strong>{visibleEvents.length}</strong><span>{queue === 'suppressed' ? '告警仍然存在，但通知已被静默策略抑制' : queue === 'history' ? '已恢复事件不会再进入活跃告警计数' : '点击任意事件查看证据与处置操作'}</span></div>
            <section className="alert-stream-list">
                {currentLoading ? <div className="alert-stream-loading"><Spin /></div> : visibleEvents.length ? visibleEvents.map((event, index) => (
                    <button className="alert-event-row" key={`${event.fingerprint || event.eventId}-${index}`} onClick={() => setSelected(event)}>
                        <span className={`alert-event-dot ${levelClass(event.severity)}`} />
                        <span className="alert-event-main"><strong>{event.rule_name || event.ruleName || '未命名告警规则'}</strong><small>{event.datasource_type || event.datasourceType || '数据源'} · {event.fingerprint || '未生成指纹'}</small></span>
                        <span className="alert-event-cell"><strong>{event.severity || 'P2'}</strong><small>级别</small></span>
                        <StateBadges event={event} />
                        <span className="alert-event-cell"><strong>{FormatTime(queue === 'history' ? event.recover_time : event.first_trigger_time || event.tiggerTime)}</strong><small>{queue === 'history' ? '恢复时间' : '首次发生'}</small></span>
                        <ChevronRight className="alert-event-arrow" size={16} />
                    </button>
                )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={queue === 'history' ? '当前筛选条件下没有历史事件' : '当前队列没有需要展示的告警'} />}
            </section>
            <Drawer title={null} open={Boolean(selected)} onClose={() => setSelected(null)} width={620} className="alert-detail-drawer">
                {selected && <div className="alert-detail">
                    <div className="alert-detail-kicker"><Tag color={selected.severity === 'P0' ? 'error' : selected.severity === 'P1' ? 'warning' : 'processing'}>{selected.severity || 'P2'}</Tag><StateBadges event={selected} /></div>
                    <h2>{selected.rule_name || selected.ruleName}</h2>
                    <p>{selected.annotations || '该事件暂未提供额外说明。'}</p>
                    {queue !== 'history' && <div className="alert-detail-actions"><Button type="primary" icon={<Check size={15} />} onClick={claimEvent} disabled={acknowledgedOf(selected)}>{acknowledgedOf(selected) ? '已认领' : '确认告警'}</Button><Button icon={<UserPlus size={15} />}>指派</Button><Button icon={<BellOff size={15} />} onClick={() => navigate('/silenceRules')}>创建静默</Button></div>}
                    <section className="alert-ai-summary"><div><Sparkles size={15} /><strong>AI 分析入口</strong></div><p>将当前告警的规则、标签与事件上下文交给 Copilot，生成根因推断和下一步处置建议。</p><Button onClick={() => navigate('/copilot', { state: { event: selected } })}>继续分析</Button></section>
                    <section className="alert-detail-section"><h3>事件上下文</h3><div className="alert-detail-grid"><div><span>数据源</span><strong>{selected.datasource_type || selected.datasourceType || '-'}</strong></div><div><span>规则 ID</span><strong>{selected.rule_id || selected.ruleId || '-'}</strong></div><div><span>指纹</span><strong>{selected.fingerprint || '-'}</strong></div><div><span>{queue === 'history' ? '恢复时间' : '首次发生'}</span><strong>{FormatTime(queue === 'history' ? selected.recover_time : selected.first_trigger_time || selected.tiggerTime)}</strong></div></div></section>
                    <section className="alert-detail-section"><h3>处置时间线</h3><div className="alert-timeline"><div><time>{FormatTime(selected.first_trigger_time || selected.tiggerTime)}</time><span /><p><strong>告警触发</strong>规则达到当前阈值。</p></div>{isRecovered(selected) ? <div><time>{FormatTime(selected.recover_time)}</time><span /><p><strong>告警恢复</strong>事件已离开活跃队列并进入历史记录。</p></div> : <div><time>现在</time><span /><p><strong>{silencedOf(selected) ? '通知已抑制' : acknowledgedOf(selected) ? '正在处理' : '等待处置'}</strong>{silencedOf(selected) ? '告警仍然存在，静默仅影响通知投递。' : '可以确认、指派、静默或交给 Copilot 分析。'}</p></div>}</div></section>
                </div>}
            </Drawer>
        </div>
    );
};
