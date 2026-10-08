import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Drawer, Empty, Input, Pagination, Select, Spin, Tag, message } from 'antd';
import { BellOff, Check, ChevronRight, Filter, Search, Sparkles } from 'lucide-react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { FaultCenterList } from '../../api/faultCenter';
import { getCurEventList, getHisEventList, ProcessAlertEvent } from '../../api/event';
import { FormatTime } from '../../utils/lib';
import { buildSilenceContext, getAlertScope, importantScopeLabels, scopeName, scopeResource } from '../../utils/alertScope';
import { CreateSilenceModal } from '../silence/SilenceRuleCreateModal';
import {readAlertView, patchAlertView} from '../../utils/alertView';
import './index.css';

const levelClass = value => ({ P0: 'critical', P1: 'warning', P2: 'info' }[value] || 'info');
const lifecycleText = value => ({ alerting: '告警中', pending_recovery: '待恢复', recovered: '已恢复', pre_alert: '预告警' }[value] || '告警中');
const lifecycleOf = event => event?.lifecycle_status || event?.lifecycleStatus || (['pre_alert', 'alerting', 'pending_recovery', 'recovered'].includes(event?.status) ? event.status : 'alerting');
const acknowledgedOf = event => event?.acknowledged ?? event?.confirmState?.isOk ?? event?.status === 'processing';
const silencedOf = event => event?.silenced ?? event?.status === 'muting';
const isRecovered = event => lifecycleOf(event) === 'recovered' || Boolean(event?.recover_time);
const uniqueOptions = values => [...new Set(values.filter(Boolean))].sort().map(value => ({ label: value, value }));

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
    const location = useLocation();
    const [params, setParams] = useSearchParams();
    const {centerId, queue, query, severity, environment, service, page, pageSize} = readAlertView(params);
    const changeView = (patch, reset = true) => setParams(current => patchAlertView(current,patch,reset),{replace:true});
    const [loadedKey,setLoadedKey] = useState('');
    const [updatedAt,setUpdatedAt] = useState(null);
    const viewKey = JSON.stringify({centerId,queue,query,severity,environment,service,page,pageSize});
    const [centers, setCenters] = useState([]);

    const [events, setEvents] = useState([]);
    const [historyEvents, setHistoryEvents] = useState([]);
    const [selected, setSelected] = useState(null);

    const [loading, setLoading] = useState(true);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [silenceContext, setSilenceContext] = useState(null);
    const [silenceVisible, setSilenceVisible] = useState(false);

    const [total, setTotal] = useState(0);
    const [historyTotal, setHistoryTotal] = useState(0);
    const [summary, setSummary] = useState(null);
    const [loadError, setLoadError] = useState('');
    const [claiming, setClaiming] = useState(false);
    const requestSequence = useRef(0);
    const historySequence = useRef(0);
    const activeCenterId = centerId === 'all' ? undefined : centerId;

    const loadCenters = useCallback(async () => {
        const res = await FaultCenterList();
        if (res?.code !== 200) throw new Error('加载故障中心失败');
        setCenters(res?.data || []);
    }, []);

    const eventParams = useMemo(() => ({
        faultCenterId: activeCenterId,
        index: page,
        size: pageSize,
        query: query || undefined,
        severity: severity || undefined,
        environment: environment || undefined,
        service: service || undefined,
    }), [activeCenterId, query, severity, environment, service, page, pageSize]);

    const loadEvents = useCallback(async () => {
        const request = ++requestSequence.current;
        try {
            setLoading(true);
            setLoadError('');
            const res = await getCurEventList({ ...eventParams, queue: queue === 'history' ? 'all' : queue, includeSummary: true });
            if (request !== requestSequence.current) return;
            if (res?.code !== 200) throw new Error('加载告警失败');
            setEvents((res?.data?.list || []).filter(event => !isRecovered(event)));
            setTotal(res?.data?.total || 0);
            setSummary(res?.data?.summary || null);
            setLoadedKey(viewKey); setUpdatedAt(Date.now());
        } catch (error) {
            if (request !== requestSequence.current) return;
            console.error('Unable to load alert stream:', error);
            setLoadError('加载告警失败，请重试。');
        } finally { if (request === requestSequence.current) setLoading(false); }
    }, [eventParams, queue, viewKey]);

    const loadHistory = useCallback(async () => {
        const request = ++historySequence.current;
        try {
            setHistoryLoading(true);
            setLoadError('');
            const res = await getHisEventList({ ...eventParams, environment: undefined, service: undefined });
            if (request !== historySequence.current) return;
            if (res?.code !== 200) throw new Error('加载历史事件失败');
            setHistoryEvents((res?.data?.list || []).map(event => ({ ...event, lifecycle_status: 'recovered' })));
            setHistoryTotal(res?.data?.total || 0);
            setLoadedKey(viewKey); setUpdatedAt(Date.now());
        } catch (error) {
            if (request !== historySequence.current) return;
            console.error('Unable to load alert history:', error);
            setLoadError('加载历史事件失败，请重试。');
        } finally { if (request === historySequence.current) setHistoryLoading(false); }
    }, [eventParams,viewKey]);

    useEffect(() => { loadCenters().catch(() => message.error('加载故障中心失败')); }, [loadCenters]);
    useEffect(() => { if (queue !== 'history') loadEvents(); return () => { requestSequence.current++; }; }, [loadEvents, queue]);
    useEffect(() => { if (queue === 'history') loadHistory(); return () => { historySequence.current++; }; }, [loadHistory, queue]);
    const selectedKey = params.get('event');
    useEffect(() => { if(loadedKey !== viewKey) {setSelected(null);return;} const list = queue === 'history' ? historyEvents : events; setSelected(list.find(item => item.fingerprint === selectedKey) || null); }, [selectedKey,loadedKey,viewKey,events,historyEvents,queue]);

    const environmentOptions = useMemo(() => uniqueOptions([...(summary?.environments || events.map(event => getAlertScope(event).environment)), environment]), [events, summary, environment]);
    const serviceOptions = useMemo(() => uniqueOptions([...(summary?.services || events.map(event => getAlertScope(event).service)), service]), [events, summary, service]);
    const counts = useMemo(() => queueDefinitions.reduce((result, item) => {
        result[item.key] = item.key === 'history' ? historyTotal : summary?.queues?.[item.key];
        return result;
    }, {}), [summary, historyTotal]);
    const visibleEvents = useMemo(() => queue === 'history' ? historyEvents : events.filter(event => belongsToQueue(event, queue)), [events, historyEvents, queue]);
    const currentLoading = queue === 'history' ? historyLoading : loading;

    const refresh = () => queue === 'history' ? loadHistory() : loadEvents();

    const claimEvent = async () => {
        if (!selected || claiming) return;
        try {
            setClaiming(true);
            const response = await ProcessAlertEvent({ state: 1, faultCenterId: selected.faultCenterId || activeCenterId, fingerprints: [selected.fingerprint] });
            if (response?.code !== 200) throw new Error(typeof response?.data === 'string' ? response.data : '认领结果未确认，请刷新核对');
            message.success('告警已认领');
            setSelected(current => ({ ...current, acknowledged: true, status: 'processing', confirmState: { ...(current.confirmState || {}), isOk: true } }));
            setEvents(current => current.map(event => event.fingerprint === selected.fingerprint && event.faultCenterId === selected.faultCenterId ? { ...event, acknowledged: true, status: 'processing', confirmState: { ...(event.confirmState || {}), isOk: true } } : event));
            loadEvents();
        } catch (error) {
            message.error(typeof error?.response?.data?.data === 'string' ? error.response.data.data : error?.message || '认领结果未确认，请刷新核对');
            loadEvents();
        } finally { setClaiming(false); }
    };

    const openSilence = () => {
        if (!selected) return;
        setSilenceContext(buildSilenceContext(selected, {
            faultCenterId: selected.faultCenterId || activeCenterId,
            faultCenterName: selectedCenterName,
        }));
        setSilenceVisible(true);
    };

    const selectedScope = selected ? getAlertScope(selected) : {};
    const selectedCenterName = selected?.faultCenterName || centers.find(center => center.id === selected?.faultCenterId)?.name || '-';

    return (
        <div className="alert-stream-page">
            <header className="alert-stream-header">
                <div><h1>告警</h1><p>先定位环境、服务和资源，再决定是否需要处置。</p></div>
                <div className="alert-stream-actions"><Button onClick={refresh} loading={currentLoading}>刷新</Button><Button onClick={async () => {try {await navigator.clipboard.writeText(window.location.href); message.success('已复制当前筛选链接');} catch {message.warning('复制失败，请复制浏览器地址栏');}}}>分享视图</Button><Button type="primary" icon={<Sparkles size={15} />} onClick={() => navigate('/copilot', {state:{returnTo:location.pathname+location.search,tenantId:localStorage.getItem('TenantID')}})}>在 Copilot 中分析</Button></div>
            </header>
            <nav className="alert-queue-tabs" aria-label="告警工作队列">
                {queueDefinitions.map(item => <button key={item.key} aria-pressed={queue === item.key} className={queue === item.key ? 'is-active' : ''} onClick={() => { changeView({queue:item.key}); setLoadError(''); }}><span>{item.label}</span>{counts[item.key] !== undefined && item.key !== 'history' ? <strong>{counts[item.key] || 0}</strong> : null}</button>)}
            </nav>
            <div className="alert-stream-toolbar">
                <Input prefix={<Search size={15} />} allowClear aria-label="搜索告警" placeholder="搜索告警、规则或标签" value={query} onChange={event => { changeView({query:event.target.value}); }} onPressEnter={refresh} />
                <Select aria-label="故障中心" value={centerId} onChange={value => { changeView({center:value}); }} options={[{ label: '全部故障中心', value: 'all' }, ...centers.map(item => ({ label: item.name, value: item.id }))]} />
                <Select aria-label="环境" showSearch optionFilterProp="label" disabled={queue === 'history'} value={queue === 'history' ? undefined : environment} allowClear onChange={value => { changeView({environment:value}); }} placeholder="全部环境" options={environmentOptions} />
                <Select aria-label="服务" showSearch optionFilterProp="label" disabled={queue === 'history'} value={queue === 'history' ? undefined : service} allowClear onChange={value => { changeView({service:value}); }} placeholder="全部服务" options={serviceOptions} />
                <Select aria-label="级别" value={severity} allowClear onChange={value => { changeView({severity:value}); }} placeholder="全部级别" suffixIcon={<Filter size={14} />} options={[{ label: 'P0 · 严重', value: 'P0' }, { label: 'P1 · 警告', value: 'P1' }, { label: 'P2 · 提示', value: 'P2' }]} />
            </div>
            <div className="alert-stream-meta"><span>{queue === 'history' ? '历史事件' : '当前队列'}</span><strong>{currentLoading || loadError ? '—' : queue === 'history' ? historyTotal : total}</strong><span>{queue === 'suppressed' ? '告警仍然存在；静默只会抑制通知投递。' : queue === 'history' ? '历史查询暂不支持环境/服务筛选，可搜索标签关键字。' : '数量基于当前筛选条件；点击事件查看位置与处置状态。'}</span></div>
            {loadError && <Alert className="wa-page-error" type="error" showIcon message={loadError} action={<Button onClick={refresh}>重试</Button>} />}
            <div className="alert-refresh-status" role="status">{currentLoading ? <><Spin size="small" /> 正在刷新，已有数据暂时保留</> : updatedAt ? `最后更新 ${new Date(updatedAt).toLocaleTimeString()}` : null}</div>
            <section className="alert-stream-list" aria-busy={currentLoading}>
                {currentLoading && loadedKey !== viewKey ? <div className="alert-stream-loading"><Spin /></div> : loadedKey !== viewKey ? null : visibleEvents.length ? visibleEvents.map((event, index) => {
                    const scope = getAlertScope(event);
                    const centerName = event.faultCenterName || centers.find(center => center.id === event.faultCenterId)?.name;
                    return <button className="alert-event-row" key={`${event.fingerprint || event.eventId}-${index}`} onClick={() => {setSelected(event);changeView({event:event.fingerprint},false);}}>
                        <span className={`alert-event-dot ${levelClass(event.severity)}`} />
                        <span className="alert-event-main"><strong>{event.rule_name || event.ruleName || '未命名告警规则'}</strong><small>{scopeName(scope)} · {scopeResource(scope)}</small></span>
                        <span className="alert-event-scope"><strong>{centerName || '未归属故障中心'}</strong><small>{event.datasource_type || event.datasourceType || '数据源'}</small></span>
                        <span className="alert-event-cell"><strong>{event.severity || 'P2'}</strong><small>{acknowledgedOf(event) ? (event.confirmState?.confirmUsername || '已认领') : '无人认领'}</small></span>
                        <StateBadges event={event} />
                        <span className="alert-event-cell"><strong>{FormatTime(queue === 'history' ? event.recover_time : event.first_trigger_time || event.tiggerTime)}</strong><small>{queue === 'history' ? '恢复时间' : '首次发生'}</small></span>
                        <ChevronRight className="alert-event-arrow" size={16} />
                    </button>;
                }) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={queue === 'history' ? '当前筛选条件下没有历史事件' : '当前队列没有需要展示的告警'} />}
            </section>
            <div className="wa-pagination"><Pagination current={page} pageSize={pageSize} total={queue === 'history' ? historyTotal : total} disabled={currentLoading || Boolean(loadError)} showSizeChanger showTotal={value => `共 ${value} 条`} onChange={(nextPage, size) => { changeView({page:size !== pageSize ? 1 : nextPage,size,event:undefined},false); }} /></div>
            <Drawer title={null} open={Boolean(selected) && !silenceVisible} onClose={() => {setSelected(null);changeView({event:undefined},false);}} width={620} className="alert-detail-drawer">
                {selected && <div className="alert-detail">
                    <div className="alert-detail-kicker"><Tag color={selected.severity === 'P0' ? 'error' : selected.severity === 'P1' ? 'warning' : 'processing'}>{selected.severity || 'P2'}</Tag><StateBadges event={selected} /></div>
                    <h2>{selected.rule_name || selected.ruleName}</h2>
                    <p>{selected.annotations || '该事件暂未提供额外说明。'}</p>
                    {queue !== 'history' && <div className="alert-detail-actions"><Button type="primary" loading={claiming} icon={<Check size={15} />} onClick={claimEvent} disabled={acknowledgedOf(selected)}>{acknowledgedOf(selected) ? '已认领' : '认领告警'}</Button><Button icon={<BellOff size={15} />} onClick={openSilence}>创建静默</Button></div>}
                    <section className="alert-ai-summary"><div><Sparkles size={15} /><strong>AI 分析入口</strong></div><p>将当前告警的规则、标签与事件上下文交给 Copilot，生成根因推断和下一步处置建议。</p><Button onClick={() => navigate('/copilot', { state: { event: selected, returnTo: location.pathname + location.search, tenantId: localStorage.getItem('TenantID') } })}>继续分析</Button></section>
                    <section className="alert-detail-section"><h3>发生位置</h3><div className="alert-detail-grid">{[['环境', selectedScope.environment], ['服务', selectedScope.service], ['集群', selectedScope.cluster], ['命名空间', selectedScope.namespace], ['资源', selectedScope.resource], ['实例', selectedScope.instance], ['负责人', selectedScope.owner], ['故障中心', selectedCenterName]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value || '未标记'}</strong></div>)}</div></section>
                    <section className="alert-detail-section"><h3>事件上下文</h3><div className="alert-detail-grid"><div><span>数据源</span><strong>{selected.datasource_type || selected.datasourceType || '-'}</strong></div><div><span>规则 ID</span><strong>{selected.rule_id || selected.ruleId || '-'}</strong></div><div><span>指纹</span><strong>{selected.fingerprint || '-'}</strong></div><div><span>{queue === 'history' ? '恢复时间' : '首次发生'}</span><strong>{FormatTime(queue === 'history' ? selected.recover_time : selected.first_trigger_time || selected.tiggerTime)}</strong></div></div></section>
                    <section className="alert-detail-section"><h3>关键标签</h3><div className="alert-label-list">{importantScopeLabels(selected).length ? importantScopeLabels(selected).map(([key, value]) => <span key={key}><small>{key}</small><strong>{value}</strong></span>) : <span className="alert-label-list__empty">事件未提供可识别的环境、服务或资源标签。</span>}</div></section>
                    <section className="alert-detail-section"><h3>处置时间线</h3><div className="alert-timeline"><div><time>{FormatTime(selected.first_trigger_time || selected.tiggerTime)}</time><span /><p><strong>告警触发</strong>规则达到当前阈值。</p></div>{isRecovered(selected) ? <div><time>{FormatTime(selected.recover_time)}</time><span /><p><strong>告警恢复</strong>事件已离开活跃队列并进入历史记录。</p></div> : <div><time>现在</time><span /><p><strong>{silencedOf(selected) ? '通知已抑制' : acknowledgedOf(selected) ? '正在处理' : '等待处置'}</strong>{silencedOf(selected) ? '告警仍然存在，静默仅影响通知投递。' : '可以认领、创建静默或交给 Copilot 分析。'}</p></div>}</div></section>
                </div>}
            </Drawer>
            <CreateSilenceModal
                visible={silenceVisible}
                onClose={() => { setSilenceVisible(false); setSilenceContext(null); }}
                type="create"
                handleList={refresh}
                faultCenterId={silenceContext?.faultCenterId}
                silenceContext={silenceContext}
                faultCenters={centers}
            />
        </div>
    );
};
