import { useEffect, useMemo, useState } from 'react';
import { Button, Empty, Input, Select, Spin, Tag } from 'antd';
import { ArrowUpRight, Database, GitBranch, Plus, Search, Workflow } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getRuleGroupList, getRuleList } from '../../api/rule';
import { getDatasourceList } from '../../api/datasource';
import { getNoticeList } from '../../api/notice';
import { FaultCenterList } from '../../api/faultCenter';
import { getCurEventList } from '../../api/event';
import { FormatTime } from '../../utils/lib';
import { getAlertScope, scopeName } from '../../utils/alertScope';
import './index.css';

const iconByType = { Prometheus: 'P', Loki: 'L', Kubernetes: 'K', KubernetesEvent: 'K', AliCloudSLS: 'A', ElasticSearch: 'E', VictoriaLogs: 'V', ClickHouse: 'C' };
const asList = value => Array.isArray(value) ? value : value?.list || [];
const optionsFrom = values => [...new Set(values.filter(Boolean))].sort().map(value => ({ label: value, value }));

export const Manage = () => {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const tab = params.get('tab') || 'rules';
    const [loading, setLoading] = useState(true);
    const [ruleGroups, setRuleGroups] = useState([]);
    const [rules, setRules] = useState([]);
    const [sources, setSources] = useState([]);
    const [notices, setNotices] = useState([]);
    const [centers, setCenters] = useState([]);
    const [activeEvents, setActiveEvents] = useState([]);
    const [query, setQuery] = useState('');
    const [groupId, setGroupId] = useState();
    const [sourceType, setSourceType] = useState();
    const [centerId, setCenterId] = useState();
    const [status, setStatus] = useState();

    useEffect(() => {
        Promise.all([getRuleGroupList(), getDatasourceList(), getNoticeList(), getRuleList({ index: 1, size: 200, status: 'all' }), FaultCenterList(), getCurEventList({ index: 1, size: 200 })])
            .then(([groups, dataSources, noticeObjects, ruleResult, faultCenters, events]) => {
                setRuleGroups(asList(groups?.data)); setSources(asList(dataSources?.data)); setNotices(asList(noticeObjects?.data));
                setRules(asList(ruleResult?.data)); setCenters(asList(faultCenters?.data)); setActiveEvents(asList(events?.data));
            })
            .finally(() => setLoading(false));
    }, []);

    const changeTab = value => setParams({ tab: value });
    const tabs = [{ key: 'rules', label: '告警规则', icon: Workflow }, { key: 'routes', label: '通知与路由', icon: GitBranch }, { key: 'sources', label: '数据源', icon: Database }];
    const groupName = id => ruleGroups.find(group => group.id === id || group.ruleGroupId === id)?.name || ruleGroups.find(group => group.id === id || group.ruleGroupId === id)?.ruleGroupName || '未分组';
    const centerName = id => centers.find(center => center.id === id)?.name || '未归属故障中心';
    const activeByRule = useMemo(() => activeEvents.reduce((count, event) => ({ ...count, [event.rule_id || event.ruleId]: (count[event.rule_id || event.ruleId] || 0) + 1 }), {}), [activeEvents]);
    const filteredRules = useMemo(() => rules.filter(rule => {
        const text = `${rule.ruleName || ''} ${rule.ruleId || ''} ${rule.description || ''}`.toLowerCase();
        return (!query || text.includes(query.trim().toLowerCase())) && (!groupId || rule.ruleGroupId === groupId) && (!sourceType || rule.datasourceType === sourceType) && (!centerId || rule.faultCenterId === centerId) && (!status || (status === 'enabled' ? Boolean(rule.enabled) : !rule.enabled));
    }), [rules, query, groupId, sourceType, centerId, status]);
    const groupOptions = ruleGroups.map(group => ({ label: group.name || group.ruleGroupName, value: group.id || group.ruleGroupId }));
    const currentAlertRuleCount = rules.filter(rule => activeByRule[rule.ruleId]).length;

    return <div className="manage-page">
        <header className="manage-page__header"><div><h1>Manage</h1><p>规则维护从“覆盖什么、送到哪里、现在是否触发”开始，而不是先进入复杂表单。</p></div><Button type="primary" icon={<Plus size={15} />} onClick={() => navigate(tab === 'rules' ? '/ruleGroup' : tab === 'sources' ? '/datasource' : '/noticeObjects')}>创建{tab === 'rules' ? '规则' : tab === 'sources' ? '数据源' : '通知对象'}</Button></header>
        <nav className="manage-tabs">{tabs.map(item => { const Icon = item.icon; return <button key={item.key} className={tab === item.key ? 'is-active' : ''} onClick={() => changeTab(item.key)}><Icon size={15} />{item.label}</button>; })}</nav>
        {loading ? <div className="manage-loading"><Spin /></div> : <>
            {tab === 'rules' && <section>
                <div className="manage-summary"><div><span>规则总数</span><strong>{rules.length}</strong></div><div><span>规则分组</span><strong>{ruleGroups.length}</strong></div><div><span>正在触发的规则</span><strong className={currentAlertRuleCount ? 'manage-warning' : 'manage-good'}>{currentAlertRuleCount}</strong></div></div>
                <div className="manage-section-head"><div><h2>规则总览</h2><p>按环境、服务标签与配置归属定位规则；触发中的规则优先检查。</p></div><Button onClick={() => navigate('/ruleGroup')}>完整规则管理 <ArrowUpRight size={14} /></Button></div>
                <div className="manage-rule-filters"><Input prefix={<Search size={15} />} allowClear value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索规则名称、ID 或说明" /><Select allowClear value={groupId} onChange={setGroupId} options={groupOptions} placeholder="全部规则组" /><Select allowClear value={sourceType} onChange={setSourceType} options={optionsFrom(rules.map(rule => rule.datasourceType))} placeholder="全部数据源类型" /><Select allowClear value={centerId} onChange={setCenterId} options={centers.map(center => ({ label: center.name, value: center.id }))} placeholder="全部故障中心" /><Select allowClear value={status} onChange={setStatus} options={[{ label: '已启用', value: 'enabled' }, { label: '已停用', value: 'disabled' }]} placeholder="全部状态" /></div>
                <div className="manage-rule-result"><span>已显示 <strong>{filteredRules.length}</strong> 条规则</span><small>环境和服务来自外部标签；未标记的规则需要补充标签后才可被准确定位。</small></div>
                <div className="manage-list manage-rule-list">{filteredRules.length ? filteredRules.map(rule => { const scope = getAlertScope(rule); const activeCount = activeByRule[rule.ruleId] || 0; return <button className="manage-row manage-rule-row" key={rule.ruleId} onClick={() => navigate(`/ruleGroup/${rule.ruleGroupId}/rule/${rule.ruleId}/edit`)}><span className="manage-row__icon"><Workflow size={15} /></span><span className="manage-row__main"><strong>{rule.ruleName || '未命名规则'}</strong><small>{scopeName(scope)} · {groupName(rule.ruleGroupId)}</small></span><span className="manage-rule-routing"><small>{centerName(rule.faultCenterId)}</small><small>{rule.datasourceType || '未配置数据源'} · {(rule.datasourceId || rule.datasourceIdList || []).length || 0} 个连接</small></span><span className="manage-rule-state">{activeCount ? <Tag color="error">触发中 {activeCount}</Tag> : <Tag color={rule.enabled ? 'success' : 'default'}>{rule.enabled ? '已启用' : '已停用'}</Tag>}<small>{rule.updateAt ? FormatTime(rule.updateAt) : '暂无更新时间'}</small></span><ArrowUpRight size={15} /></button>; }) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有符合筛选条件的规则" />}</div>
                <div className="manage-section-head manage-group-head"><div><h2>规则组</h2><p>规则组用于组织与批量维护，不应替代环境、服务和故障中心的归属信息。</p></div></div>
                <div className="manage-list">{ruleGroups.length ? ruleGroups.map(group => { const id = group.id || group.ruleGroupId; const count = rules.filter(rule => rule.ruleGroupId === id).length; return <button className="manage-row" key={id} onClick={() => navigate(`/ruleGroup/${id}/rule/list`)}><span className="manage-row__icon"><Workflow size={15} /></span><span className="manage-row__main"><strong>{group.name || group.ruleGroupName || '未命名规则组'}</strong><small>{group.description || '查看、编辑、创建和批量维护规则'}</small></span><span className="manage-row__meta"><strong>{count}</strong><small>规则</small></span><ArrowUpRight size={15} /></button>; }) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无规则分组" />}</div>
            </section>}
            {tab === 'routes' && <section><div className="manage-summary"><div><span>通知对象</span><strong>{notices.length}</strong></div><div><span>路由条件</span><strong>按规则配置</strong></div><div><span>值班表</span><strong>可用</strong></div></div><div className="manage-section-head"><div><h2>通知与升级</h2><p>通知对象和告警规则共同决定告警的送达路径。</p></div><Button onClick={() => navigate('/noticeObjects')}>管理通知对象 <ArrowUpRight size={14} /></Button></div><div className="route-flow"><div><span>01</span><strong>规则命中</strong><small>依据服务、级别和标签触发</small></div><i /><div><span>02</span><strong>分组与静默</strong><small>抑制重复事件，减少噪声</small></div><i /><div><span>03</span><strong>通知与升级</strong><small>通知对象及值班表负责响应</small></div></div><div className="manage-list">{notices.length ? notices.map(notice => <button className="manage-row" key={notice.id || notice.uuid} onClick={() => navigate('/noticeObjects')}><span className="manage-row__icon"><GitBranch size={15} /></span><span className="manage-row__main"><strong>{notice.name || '未命名通知对象'}</strong><small>{notice.description || notice.uuid || '已接入告警通知链路'}</small></span><span className="manage-row__meta"><Tag color="success">可用</Tag></span><ArrowUpRight size={15} /></button>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无通知对象" />}</div></section>}
            {tab === 'sources' && <section><div className="manage-summary"><div><span>已连接数据源</span><strong>{sources.length}</strong></div><div><span>指标与日志</span><strong>统一接入</strong></div><div><span>连接状态</span><strong className="manage-good">正常</strong></div></div><div className="manage-section-head"><div><h2>数据接入</h2><p>数据源为规则、告警流和 Copilot 提供实时上下文。</p></div><Button onClick={() => navigate('/datasource')}>管理数据源 <ArrowUpRight size={14} /></Button></div><div className="source-grid">{sources.length ? sources.map(source => <button className="source-row" key={source.id} onClick={() => navigate('/datasource')}><div className="source-row__head"><span>{iconByType[source.type] || source.type?.slice(0,1) || 'D'}</span><div><strong>{source.name}</strong><small>{source.type}</small></div><Tag color={source.enabled ? 'success' : 'default'}>{source.enabled ? '已启用' : '已停用'}</Tag></div><p>{source.description || '已连接到 WatchAlert 工作区'}</p><footer><small>{source.updateBy || '系统'} 最近更新</small><ArrowUpRight size={14} /></footer></button>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据源" />}</div></section>}
        </>}
    </div>;
};
