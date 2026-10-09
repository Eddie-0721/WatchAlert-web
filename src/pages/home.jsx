import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Empty, Select, Spin, Tooltip, message } from 'antd';
import { ArrowRight, Bot, CircleAlert, RefreshCw, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getDashboardInfo } from '../api/other';
import { FaultCenterList } from '../api/faultCenter';
import { noticeRecordMetric } from '../api/notice';
import { NoticeMetricChart } from './chart/noticeMetricChart';
import { FormatTime } from '../utils/lib';
import './home.css';

const checked = response => { if (![0, 200].includes(response?.code)) throw new Error('查询失败'); return response.data; };
const levelClass = level => ({ P0: 'critical', P1: 'warning', P2: 'info' }[level] || 'info');

export const Home = () => {
    const navigate = useNavigate();
    const [faultCenters, setFaultCenters] = useState([]);
    const [faultCenterId, setFaultCenterId] = useState();
    const [dashboard, setDashboard] = useState({});
    const [metricData, setMetricData] = useState({});
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);

    const sequence = useRef(0);
    const currentCenter = useRef();
    const load = useCallback(async (nextFaultCenterId = currentCenter.current, refreshMetadata = true) => {
        const request = ++sequence.current;
        try {
            setLoading(true);
            setLoadError(false);
            let activeId = nextFaultCenterId;
            if (refreshMetadata) {
                const [centersRes, metricRes] = await Promise.all([FaultCenterList(), noticeRecordMetric()]);
                const centers = checked(centersRes) || [];
                const metric = checked(metricRes);
                if (request !== sequence.current) return;
                activeId = nextFaultCenterId || centers[0]?.id;
                setFaultCenters(centers);
                setMetricData(metric || {});
            }
            setFaultCenterId(activeId);
            currentCenter.current = activeId;
            if (activeId) {
                const info = await getDashboardInfo({ faultCenterId: activeId });
                const data = checked(info);
                if (request !== sequence.current) return;
                setDashboard(data || {});
            } else {
                setDashboard({});
            }
        } catch (error) {
            if (request !== sequence.current) return;
            setLoadError(true);
            console.error('Unable to load overview:', error);
            message.error('加载态势数据失败');
        } finally {
            if (request === sequence.current) setLoading(false);
        }
    }, []);

    useEffect(() => { load(); return () => { sequence.current++; }; }, [load]);

    const distribution = dashboard?.alarmDistribution || {};
    const totalAlerts = (distribution.P0 || 0) + (distribution.P1 || 0) + (distribution.P2 || 0);
    const activeAlerts = dashboard?.curAlertList || [];
    const stats = useMemo(() => [
        { label: '活跃告警', value: totalAlerts, note: totalAlerts ? '需要关注' : '当前无活跃告警', tone: totalAlerts ? 'danger' : 'success' },
        { label: '告警规则', value: dashboard?.countAlertRules ?? 0, note: '已配置规则', tone: 'neutral' },
        { label: '故障中心', value: dashboard?.faultCenterNumber ?? 0, note: '服务边界', tone: 'neutral' },
        { label: '活跃用户', value: dashboard?.userNumber ?? 0, note: '当前工作区', tone: 'neutral' },
    ], [dashboard, totalAlerts]);

    const selectCenter = value => { setFaultCenterId(value); load(value, false); };

    return (
        <div className="ops-overview">
            <header className="ops-overview__header">
                <div>
                    <div className="ops-eyebrow"><span className="ops-live-dot" />实时态势</div>
                    <h1>{loading ? '正在加载告警态势' : loadError ? '告警态势暂不可用' : totalAlerts > 0 ? '有告警需要处理' : '当前范围暂无活跃告警'}</h1>
                    <p>从一个工作区查看告警、服务状态和处置上下文。</p>
                </div>
                <div className="ops-overview__actions">
                    <Tooltip title="刷新实时数据"><Button icon={<RefreshCw size={15} />} onClick={() => load()}>刷新</Button></Tooltip>
                    <Button type="primary" icon={<Sparkles size={15} />} onClick={() => navigate('/copilot')}>询问 Copilot</Button>
                </div>
            </header>

            {loadError && <Alert className="wa-page-error" showIcon type="error" message="加载失败，以下内容可能不是最新状态" action={<Button onClick={() => load()}>重试</Button>} />}

            <section className="ops-health-line">
                <div className="ops-health-state"><span className={totalAlerts || loadError ? 'ops-health-dot ops-health-dot--warning' : 'ops-health-dot'} /><div><strong>{loading || loadError ? '等待有效查询结果' : totalAlerts ? `${totalAlerts} 条活跃告警` : '当前故障中心无活跃告警'}</strong><span>基于已接入的告警数据，不代表所有服务的健康状态</span></div></div>
                <div className="ops-center-picker"><span>故障中心</span><Select value={faultCenterId} onChange={selectCenter} loading={loading} placeholder="选择故障中心" options={faultCenters.map(item => ({ label: item.name, value: item.id }))} /></div>
            </section>

            <section className="ops-stat-grid">
                {stats.map(stat => <div className="ops-stat" key={stat.label}><span>{stat.label}</span><strong>{loading || loadError ? '—' : stat.value}</strong><small className={`ops-stat__note ops-stat__note--${stat.tone}`}>{loading || loadError ? '等待有效数据' : stat.note}</small></div>)}
            </section>

            <section className="ops-overview__grid">
                <div className="ops-section ops-section--trend">
                    <div className="ops-section__head"><div><h2>告警通知趋势</h2><p>过去一段时间的通知发送量</p></div><span>实时聚合</span></div>
                    <div className="ops-chart-wrap">
                        <Spin spinning={loading}>
                            {metricData?.date?.length ? <NoticeMetricChart data={metricData} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无告警趋势数据" />}
                        </Spin>
                    </div>
                </div>

                <aside className="ops-ai-brief">
                    <div className="ops-ai-brief__title"><span><Bot size={16} /></span><strong>Copilot 分析入口</strong></div>
                    <p>选择告警或描述问题后，Copilot 可在授权范围内查询告警与指标。本区域是使用提示，尚未执行 AI 分析。</p>
                    <div className="ops-ai-finding"><strong>{activeAlerts.length || 0} 条近期告警</strong><span>可从事件流查看详情与处理状态</span></div>
                    <div className="ops-ai-finding"><strong>关注规则质量</strong><span>结合历史事件识别高频与低价值规则</span></div>
                    <Button type="primary" block onClick={() => navigate('/copilot')}>打开 Copilot <ArrowRight size={14} /></Button>
                </aside>
            </section>

            <section className="ops-section ops-section--alerts">
                <div className="ops-section__head"><div><h2>最近活跃告警</h2><p>优先处理影响范围更大的事件</p></div><Button type="text" onClick={() => navigate('/alerts')}>查看全部 <ArrowRight size={14} /></Button></div>
                <div className="ops-alert-list">
                    {loading ? <Spin /> : activeAlerts.length ? activeAlerts.slice(0, 5).map((alert, index) => (
                        <button className="ops-alert-row" key={`${alert?.fingerprint || alert?.ruleName}-${index}`} onClick={() => navigate('/alerts')}>
                            <span className={`ops-alert-row__dot ${levelClass(alert?.severity)}`} />
                            <span className="ops-alert-row__main"><strong>{alert?.ruleName || '未命名告警规则'}</strong><small>{alert?.severity || 'P2'} · {alert?.datasourceType || alert?.datasource_type || '数据源'} · {FormatTime(alert?.tiggerTime || alert?.first_trigger_time)}</small></span>
                            <span className="ops-alert-row__go"><CircleAlert size={15} /></span>
                        </button>
                    )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前没有活跃告警" />}
                </div>
            </section>
        </div>
    );
};
