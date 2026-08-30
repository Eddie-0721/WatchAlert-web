import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Empty, Select, Spin, Tooltip, message } from 'antd';
import { ArrowRight, Bot, CircleAlert, RefreshCw, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getDashboardInfo } from '../api/other';
import { FaultCenterList } from '../api/faultCenter';
import { noticeRecordMetric } from '../api/notice';
import { NoticeMetricChart } from './chart/noticeMetricChart';
import { FormatTime } from '../utils/lib';
import './home.css';

const levelClass = level => ({ P0: 'critical', P1: 'warning', P2: 'info' }[level] || 'info');

export const Home = () => {
    const navigate = useNavigate();
    const [faultCenters, setFaultCenters] = useState([]);
    const [faultCenterId, setFaultCenterId] = useState();
    const [dashboard, setDashboard] = useState({});
    const [metricData, setMetricData] = useState({});
    const [loading, setLoading] = useState(true);

    const load = useCallback(async (nextFaultCenterId = faultCenterId) => {
        try {
            setLoading(true);
            const [centersRes, metricRes] = await Promise.all([FaultCenterList(), noticeRecordMetric()]);
            const centers = centersRes?.data || [];
            const activeId = nextFaultCenterId || centers[0]?.id;
            setFaultCenters(centers);
            setFaultCenterId(activeId);
            setMetricData(metricRes?.data || {});
            if (activeId) {
                const info = await getDashboardInfo({ faultCenterId: activeId });
                setDashboard(info?.data || {});
            } else {
                setDashboard({});
            }
        } catch (error) {
            console.error('Unable to load overview:', error);
            message.error('加载态势数据失败');
        } finally {
            setLoading(false);
        }
    }, [faultCenterId]);

    useEffect(() => { load(); }, [load]);

    const distribution = dashboard?.alarmDistribution || {};
    const totalAlerts = (distribution.P0 || 0) + (distribution.P1 || 0) + (distribution.P2 || 0);
    const activeAlerts = dashboard?.curAlertList || [];
    const stats = useMemo(() => [
        { label: '活跃告警', value: totalAlerts, note: totalAlerts ? '需要关注' : '当前无活跃告警', tone: totalAlerts ? 'danger' : 'success' },
        { label: '告警规则', value: dashboard?.countAlertRules ?? 0, note: '正在运行', tone: 'neutral' },
        { label: '故障中心', value: dashboard?.faultCenterNumber ?? 0, note: '服务边界', tone: 'neutral' },
        { label: '活跃用户', value: dashboard?.userNumber ?? 0, note: '当前工作区', tone: 'neutral' },
    ], [dashboard, totalAlerts]);

    const selectCenter = async value => {
        setFaultCenterId(value);
        try {
            setLoading(true);
            const res = await getDashboardInfo({ faultCenterId: value });
            setDashboard(res?.data || {});
        } catch (error) {
            message.error('切换故障中心失败');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="ops-overview">
            <header className="ops-overview__header">
                <div>
                    <div className="ops-eyebrow"><span className="ops-live-dot" />实时态势</div>
                    <h1>{totalAlerts > 0 ? '有告警需要处理' : '系统运行稳定'}</h1>
                    <p>从一个工作区查看告警、服务状态和处置上下文。</p>
                </div>
                <div className="ops-overview__actions">
                    <Tooltip title="刷新实时数据"><Button icon={<RefreshCw size={15} />} onClick={() => load()}>刷新</Button></Tooltip>
                    <Button type="primary" icon={<Sparkles size={15} />} onClick={() => navigate('/copilot')}>询问 Copilot</Button>
                </div>
            </header>

            <section className="ops-health-line">
                <div className="ops-health-state"><span className={totalAlerts ? 'ops-health-dot ops-health-dot--warning' : 'ops-health-dot'} /><div><strong>{totalAlerts ? `${totalAlerts} 条活跃告警` : '所有服务正常'}</strong><span>{faultCenters.length} 个故障中心正在被持续监控</span></div></div>
                <div className="ops-center-picker"><span>故障中心</span><Select value={faultCenterId} onChange={selectCenter} loading={loading} placeholder="选择故障中心" options={faultCenters.map(item => ({ label: item.name, value: item.id }))} /></div>
            </section>

            <section className="ops-stat-grid">
                {stats.map(stat => <div className="ops-stat" key={stat.label}><span>{stat.label}</span><strong>{stat.value}</strong><small className={`ops-stat__note ops-stat__note--${stat.tone}`}>{stat.note}</small></div>)}
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
                    <div className="ops-ai-brief__title"><span><Bot size={16} /></span><strong>Copilot 今日简报</strong></div>
                    <p>{totalAlerts ? '我发现活跃告警主要集中在当前故障中心。可以通过事件上下文快速判断影响范围，并生成处置建议。' : '当前没有活跃告警。你可以让 Copilot 分析规则噪声、数据源健康度或最近的处置记录。'}</p>
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
