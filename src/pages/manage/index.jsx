import { useEffect, useState } from 'react';
import { Button, Empty, Spin, Tag } from 'antd';
import { ArrowUpRight, Database, GitBranch, Plus, Workflow } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getRuleGroupList } from '../../api/rule';
import { getDatasourceList } from '../../api/datasource';
import { getNoticeList } from '../../api/notice';
import './index.css';

const iconByType = { Prometheus: 'P', Loki: 'L', Kubernetes: 'K', AliCloudSLS: 'A', ElasticSearch: 'E', VictoriaLogs: 'V', ClickHouse: 'C' };

export const Manage = () => {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const tab = params.get('tab') || 'rules';
    const [loading, setLoading] = useState(true);
    const [ruleGroups, setRuleGroups] = useState([]);
    const [sources, setSources] = useState([]);
    const [notices, setNotices] = useState([]);

    useEffect(() => {
        Promise.all([getRuleGroupList(), getDatasourceList(), getNoticeList()])
            .then(([rules, dataSources, noticeObjects]) => {
                setRuleGroups(rules?.data || []);
                setSources(dataSources?.data || []);
                setNotices(noticeObjects?.data || []);
            })
            .finally(() => setLoading(false));
    }, []);

    const changeTab = value => setParams({ tab: value });
    const tabs = [{ key: 'rules', label: '告警规则', icon: Workflow }, { key: 'routes', label: '通知与路由', icon: GitBranch }, { key: 'sources', label: '数据源', icon: Database }];

    return <div className="manage-page">
        <header className="manage-page__header"><div><h1>Manage</h1><p>集中配置规则、通知路由与数据接入，让告警在正确的时间送达正确的人。</p></div><Button type="primary" icon={<Plus size={15} />} onClick={() => navigate(tab === 'rules' ? '/ruleGroup' : tab === 'sources' ? '/datasource' : '/noticeObjects')}>创建{tab === 'rules' ? '规则' : tab === 'sources' ? '数据源' : '通知对象'}</Button></header>
        <nav className="manage-tabs">{tabs.map(item => { const Icon = item.icon; return <button key={item.key} className={tab === item.key ? 'is-active' : ''} onClick={() => changeTab(item.key)}><Icon size={15} />{item.label}</button>; })}</nav>
        {loading ? <div className="manage-loading"><Spin /></div> : <>
            {tab === 'rules' && <section><div className="manage-summary"><div><span>规则分组</span><strong>{ruleGroups.length}</strong></div><div><span>当前数据源</span><strong>{sources.length}</strong></div><div><span>通知对象</span><strong>{notices.length}</strong></div></div><div className="manage-section-head"><div><h2>规则组织</h2><p>使用分组管理不同服务和业务域的告警规则。</p></div><Button onClick={() => navigate('/ruleGroup')}>打开规则管理 <ArrowUpRight size={14} /></Button></div><div className="manage-list">{ruleGroups.length ? ruleGroups.map(group => <button className="manage-row" key={group.id} onClick={() => navigate(`/ruleGroup/${group.id}/rule/list`)}><span className="manage-row__icon"><Workflow size={15} /></span><span className="manage-row__main"><strong>{group.name || group.ruleGroupName || '未命名规则组'}</strong><small>{group.description || '进入查看、编辑和创建规则'}</small></span><span className="manage-row__meta"><strong>{group.ruleNumber ?? group.ruleCount ?? '—'}</strong><small>规则</small></span><ArrowUpRight size={15} /></button>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无规则分组" />}</div></section>}
            {tab === 'routes' && <section><div className="manage-summary"><div><span>通知对象</span><strong>{notices.length}</strong></div><div><span>路由条件</span><strong>按规则配置</strong></div><div><span>值班表</span><strong>可用</strong></div></div><div className="manage-section-head"><div><h2>通知与升级</h2><p>通知对象和告警规则共同决定告警的送达路径。</p></div><Button onClick={() => navigate('/noticeObjects')}>管理通知对象 <ArrowUpRight size={14} /></Button></div><div className="route-flow"><div><span>01</span><strong>规则命中</strong><small>依据服务、级别和标签触发</small></div><i /><div><span>02</span><strong>分组与静默</strong><small>抑制重复事件，减少噪声</small></div><i /><div><span>03</span><strong>通知与升级</strong><small>通知对象及值班表负责响应</small></div></div><div className="manage-list">{notices.length ? notices.map(notice => <button className="manage-row" key={notice.id || notice.uuid} onClick={() => navigate('/noticeObjects')}><span className="manage-row__icon"><GitBranch size={15} /></span><span className="manage-row__main"><strong>{notice.name || '未命名通知对象'}</strong><small>{notice.description || notice.uuid || '已接入告警通知链路'}</small></span><span className="manage-row__meta"><Tag color="success">可用</Tag></span><ArrowUpRight size={15} /></button>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无通知对象" />}</div></section>}
            {tab === 'sources' && <section><div className="manage-summary"><div><span>已连接数据源</span><strong>{sources.length}</strong></div><div><span>指标与日志</span><strong>统一接入</strong></div><div><span>连接状态</span><strong className="manage-good">正常</strong></div></div><div className="manage-section-head"><div><h2>数据接入</h2><p>数据源为规则、告警流和 Copilot 提供实时上下文。</p></div><Button onClick={() => navigate('/datasource')}>管理数据源 <ArrowUpRight size={14} /></Button></div><div className="source-grid">{sources.length ? sources.map(source => <button className="source-row" key={source.id} onClick={() => navigate('/datasource')}><div className="source-row__head"><span>{iconByType[source.type] || source.type?.slice(0,1) || 'D'}</span><div><strong>{source.name}</strong><small>{source.type}</small></div><Tag color={source.enabled ? 'success' : 'default'}>{source.enabled ? '已启用' : '已停用'}</Tag></div><p>{source.description || '已连接到 WatchAlert 工作区'}</p><footer><small>{source.updateBy || '系统'} 最近更新</small><ArrowUpRight size={14} /></footer></button>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据源" />}</div></section>}
        </>}
    </div>;
};
