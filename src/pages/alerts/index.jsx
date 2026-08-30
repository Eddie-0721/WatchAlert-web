import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Drawer, Empty, Input, Select, Spin, Tag, message } from 'antd';
import { BellOff, Check, ChevronRight, Filter, Search, Sparkles, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { FaultCenterList } from '../../api/faultCenter';
import { getCurEventList, ProcessAlertEvent } from '../../api/event';
import { FormatTime } from '../../utils/lib';
import './index.css';

const levelClass = value => ({ P0: 'critical', P1: 'warning', P2: 'info' }[value] || 'info');
const statusText = value => ({ alerting: '告警中', processing: '处理中', pending_recovery: '待恢复', recovered: '已恢复', muting: '静默中', pre_alert: '预告警' }[value] || '告警中');

export const AlertStream = () => {
    const navigate = useNavigate();
    const [centers, setCenters] = useState([]);
    const [centerId, setCenterId] = useState();
    const [events, setEvents] = useState([]);
    const [selected, setSelected] = useState(null);
    const [query, setQuery] = useState('');
    const [severity, setSeverity] = useState();
    const [loading, setLoading] = useState(true);

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
            setEvents(res?.data?.list || []);
        } catch (error) {
            console.error('Unable to load alert stream:', error);
            message.error('加载告警失败');
        } finally { setLoading(false); }
    }, [centerId, query, severity]);

    useEffect(() => { loadCenters().catch(() => message.error('加载故障中心失败')); }, [loadCenters]);
    useEffect(() => { loadEvents(); }, [loadEvents]);

    const visibleEvents = useMemo(() => events, [events]);

    const claimEvent = async () => {
        if (!selected) return;
        try {
            await ProcessAlertEvent({ state: 1, faultCenterId: selected.faultCenterId || centerId, fingerprints: [selected.fingerprint] });
            message.success('告警已确认并分配给当前用户');
            setSelected(current => ({ ...current, status: 'processing' }));
            loadEvents();
        } catch (error) { message.error('确认告警失败'); }
    };

    return (
        <div className="alert-stream-page">
            <header className="alert-stream-header">
                <div><h1>告警</h1><p>按影响范围和紧急程度完成分诊、指派与处置。</p></div>
                <div className="alert-stream-actions"><Button onClick={() => loadEvents()}>刷新</Button><Button type="primary" icon={<Sparkles size={15} />} onClick={() => navigate('/copilot')}>在 Copilot 中分析</Button></div>
            </header>
            <div className="alert-stream-toolbar">
                <Input prefix={<Search size={15} />} allowClear placeholder="搜索告警、规则或标签" value={query} onChange={event => setQuery(event.target.value)} onPressEnter={loadEvents} />
                <Select value={centerId} onChange={setCenterId} placeholder="故障中心" options={centers.map(item => ({ label: item.name, value: item.id }))} />
                <Select value={severity} allowClear onChange={setSeverity} placeholder="全部级别" suffixIcon={<Filter size={14} />} options={[{ label: 'P0 · 严重', value: 'P0' }, { label: 'P1 · 警告', value: 'P1' }, { label: 'P2 · 提示', value: 'P2' }]} />
            </div>
            <div className="alert-stream-meta"><span>活跃事件</span><strong>{visibleEvents.length}</strong><span>点击任意事件查看证据与处置操作</span></div>
            <section className="alert-stream-list">
                {loading ? <div className="alert-stream-loading"><Spin /></div> : visibleEvents.length ? visibleEvents.map((event, index) => (
                    <button className="alert-event-row" key={`${event.fingerprint}-${index}`} onClick={() => setSelected(event)}>
                        <span className={`alert-event-dot ${levelClass(event.severity)}`} />
                        <span className="alert-event-main"><strong>{event.rule_name || event.ruleName || '未命名告警规则'}</strong><small>{event.datasource_type || event.datasourceType || '数据源'} · {event.fingerprint || '未生成指纹'}</small></span>
                        <span className="alert-event-cell"><strong>{event.severity || 'P2'}</strong><small>级别</small></span>
                        <span className="alert-event-cell"><strong>{statusText(event.status)}</strong><small>状态</small></span>
                        <span className="alert-event-cell"><strong>{FormatTime(event.first_trigger_time || event.tiggerTime)}</strong><small>首次发生</small></span>
                        <ChevronRight className="alert-event-arrow" size={16} />
                    </button>
                )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前筛选条件下没有活跃告警" />}
            </section>
            <Drawer title={null} open={Boolean(selected)} onClose={() => setSelected(null)} width={620} className="alert-detail-drawer">
                {selected && <div className="alert-detail">
                    <div className="alert-detail-kicker"><Tag color={selected.severity === 'P0' ? 'error' : selected.severity === 'P1' ? 'warning' : 'processing'}>{selected.severity || 'P2'}</Tag><span>{statusText(selected.status)}</span></div>
                    <h2>{selected.rule_name || selected.ruleName}</h2>
                    <p>{selected.annotations || '该事件暂未提供额外说明。'}</p>
                    <div className="alert-detail-actions"><Button type="primary" icon={<Check size={15} />} onClick={claimEvent} disabled={selected.status === 'processing'}>{selected.status === 'processing' ? '处理中' : '确认告警'}</Button><Button icon={<UserPlus size={15} />}>指派</Button><Button icon={<BellOff size={15} />}>静默</Button></div>
                    <section className="alert-ai-summary"><div><Sparkles size={15} /><strong>AI 分析入口</strong></div><p>将当前告警的规则、标签与事件上下文交给 Copilot，生成根因推断和下一步处置建议。</p><Button onClick={() => navigate('/copilot', { state: { event: selected } })}>继续分析</Button></section>
                    <section className="alert-detail-section"><h3>事件上下文</h3><div className="alert-detail-grid"><div><span>数据源</span><strong>{selected.datasource_type || selected.datasourceType || '-'}</strong></div><div><span>规则 ID</span><strong>{selected.rule_id || selected.ruleId || '-'}</strong></div><div><span>指纹</span><strong>{selected.fingerprint || '-'}</strong></div><div><span>首次发生</span><strong>{FormatTime(selected.first_trigger_time || selected.tiggerTime)}</strong></div></div></section>
                    <section className="alert-detail-section"><h3>处置时间线</h3><div className="alert-timeline"><div><time>{FormatTime(selected.first_trigger_time || selected.tiggerTime)}</time><span /><p><strong>告警触发</strong>规则达到当前阈值。</p></div><div><time>现在</time><span /><p><strong>等待处置</strong>可以确认、指派、静默或交给 Copilot 分析。</p></div></div></section>
                </div>}
            </Drawer>
        </div>
    );
};
