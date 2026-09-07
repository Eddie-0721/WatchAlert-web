import { useEffect, useState } from 'react';
import { Alert, Button, Empty, Input, Pagination, Select, Spin, Tag } from 'antd';
import { ArrowUpRight, Database, GitBranch, Plus, Search, Workflow } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getRuleGroupList, getRuleList } from '../../api/rule';
import { getDatasourceList } from '../../api/datasource';
import { getNoticeList } from '../../api/notice';
import { getAlertScope, scopeName } from '../../utils/alertScope';
import './index.css';

const asList = value => Array.isArray(value) ? value : value?.list || [];
const checked = response => {
  if (response?.code !== 200 && response?.code !== 0) throw new Error('数据加载失败，请确认权限或稍后重试。');
  return response.data;
};
const tabs = [
  { key: 'rules', label: '告警规则', icon: Workflow },
  { key: 'routes', label: '通知与路由', icon: GitBranch },
  { key: 'sources', label: '数据源', icon: Database },
];

export const Manage = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = tabs.some(item => item.key === params.get('tab')) ? params.get('tab') : 'rules';
  const [rules, setRules] = useState([]);
  const [groups, setGroups] = useState([]);
  const [sources, setSources] = useState([]);
  const [notices, setNotices] = useState([]);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [groupId, setGroupId] = useState();
  const [sourceType, setSourceType] = useState();
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(30);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [metaError, setMetaError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setMetaError('');
    getRuleGroupList().then(response => { const data = checked(response); if (active) setGroups(asList(data)); })
      .catch(() => { if (active) setMetaError('规则组读取失败；仍可使用名称搜索。'); });
    return () => { active = false; };
  }, [revision]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    const load = async () => {
      try {
        if (tab === 'rules') {
          const data = checked(await getRuleList({ index: page, size, query: search, ruleGroupId: groupId, datasourceType: sourceType, status }));
          if (active) { setRules(asList(data)); setTotal(data?.total || 0); }
        } else if (tab === 'sources') {
          const data = checked(await getDatasourceList());
          if (active) setSources(asList(data));
        } else {
          const data = checked(await getNoticeList());
          if (active) setNotices(asList(data));
        }
      } catch (error) { if (active) setError(error.message); }
      finally { if (active) setLoading(false); }
    };
    load();
    return () => { active = false; };
  }, [tab, page, size, search, groupId, sourceType, status, revision]);
  const groupName = id => groups.find(group => (group.id || group.ruleGroupId) === id)?.name || groups.find(group => group.ruleGroupId === id)?.ruleGroupName || id || '未分组';
  const filter = setter => value => { setter(value); setPage(1); };

  return <div className="manage-page">
    <header className="manage-page__header"><div><h1>Manage</h1><p>维护检测规则、通知配置与数据连接。</p></div><Button type="primary" icon={<Plus size={15} />} onClick={() => navigate(tab === 'rules' ? '/ruleGroup' : tab === 'sources' ? '/datasource' : '/noticeObjects')}>{tab === 'rules' ? '选择规则组并创建' : tab === 'sources' ? '管理数据源' : '管理通知对象'}</Button></header>
    <nav className="manage-tabs" aria-label="管理模块">{tabs.map(item => { const Icon = item.icon; return <button key={item.key} aria-pressed={tab === item.key} className={tab === item.key ? 'is-active' : ''} onClick={() => setParams({ tab: item.key })}><Icon size={15} />{item.label}</button>; })}</nav>
    {error && <Alert className="wa-page-error" type="error" showIcon message={error} action={<Button onClick={() => setRevision(value => value + 1)}>重试</Button>} />}
    {tab === 'rules' && <>
      <nav className="wa-page-links" aria-label="规则维护入口"><Button onClick={() => navigate('/manage/rule-workflow-preview')}>规则维护交互预览</Button><Button onClick={() => navigate('/ruleGroup')}>规则组与批量维护</Button><Button onClick={() => navigate('/tmplType/Prometheus/group')}>规则模板</Button></nav>
      {metaError && <Alert type="warning" message={metaError} />}
      <div className="manage-rule-filters">
        <Input.Search aria-label="搜索规则" prefix={<Search size={14} />} placeholder="搜索规则名称、ID 或说明" value={query} onChange={event => { setQuery(event.target.value); if (!event.target.value) filter(setSearch)(''); }} onSearch={filter(setSearch)} allowClear />
        <Select aria-label="规则组" allowClear placeholder="全部规则组" value={groupId} onChange={filter(setGroupId)} options={groups.map(group => ({label:group.name || group.ruleGroupName, value:group.id || group.ruleGroupId}))} />
        <Select aria-label="数据源类型" allowClear placeholder="全部数据源类型" value={sourceType} onChange={filter(setSourceType)} options={['Prometheus', 'Loki', 'KubernetesEvent', 'ElasticSearch', 'AliCloudSLS', 'VictoriaLogs', 'ClickHouse', 'CloudWatch', 'Jaeger'].map(value => ({label:value,value}))} />
        <Select aria-label="规则状态" value={status} onChange={filter(setStatus)} options={[{label:'全部状态',value:'all'},{label:'已启用',value:'enabled'},{label:'已停用',value:'disabled'}]} />
      </div>
      <div className="manage-rule-result"><span>符合条件的规则：{loading || error ? '—' : total}</span><small>已启用不代表评估成功；环境与服务来自规则标签。</small></div>
      {loading ? <div className="manage-loading"><Spin /></div> : !error && <div className="manage-list manage-rule-list">{rules.length ? rules.map(rule => <button className="manage-row manage-rule-row" key={rule.ruleId} onClick={() => navigate(`/ruleGroup/${rule.ruleGroupId}/rule/${rule.ruleId}/edit`)}>
        <span className="manage-row__icon"><Workflow size={15} /></span>
        <span className="manage-row__main"><strong>{rule.ruleName || '未命名规则'}</strong><small>{scopeName(getAlertScope(rule))} · {groupName(rule.ruleGroupId)}</small></span>
        <span className="manage-rule-routing"><small>{rule.datasourceType}</small><small>{Array.isArray(rule.datasourceId) ? rule.datasourceId.length : 0} 个数据源</small></span>
        <span className="manage-rule-state"><Tag color={rule.enabled ? 'success' : 'default'}>{rule.enabled ? '已启用' : '已停用'}</Tag></span><ArrowUpRight size={15} />
      </button>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有符合条件的规则" />}</div>}
      <div className="wa-pagination"><Pagination current={page} pageSize={size} total={total} disabled={loading || Boolean(error)} showSizeChanger showTotal={value => `共 ${value} 条`} onChange={(next, nextSize) => { setPage(size === nextSize ? next : 1); setSize(nextSize); }} /></div>
    </>}
    {tab === 'routes' && <>
      <nav className="wa-page-links" aria-label="通知维护入口"><Button onClick={() => navigate('/silenceRules')}>静默规则</Button><Button onClick={() => navigate('/noticeTemplate')}>通知模板</Button><Button onClick={() => navigate('/noticeRecords')}>投递记录</Button><Button onClick={() => navigate('/faultCenter')}>路由与升级配置</Button></nav>
      <p className="manage-explanation">故障中心配置路由与升级，通知对象定义接收渠道。实际送达结果请查看投递记录。</p>
      {loading ? <Spin /> : !error && <div className="manage-list">{notices.length ? notices.map(notice => <button className="manage-row" key={notice.id || notice.uuid} onClick={() => navigate('/noticeObjects')}><span className="manage-row__icon"><GitBranch size={15} /></span><span className="manage-row__main"><strong>{notice.name || '未命名通知对象'}</strong><small>{notice.description || '查看接收渠道配置'}</small></span><span className="manage-row__meta"><Tag>已配置</Tag></span><ArrowUpRight size={15} /></button>) : <Empty description="暂无通知对象" />}</div>}
    </>}
    {tab === 'sources' && <>
      <p className="manage-explanation">连接配置与运行健康分别判断。当前页面未执行连通性检测。</p>
      {loading ? <Spin /> : !error && <div className="source-grid">{sources.length ? sources.map(source => <button className="source-row" key={source.id} onClick={() => navigate('/datasource')}><div className="source-row__head"><span><Database size={16} /></span><div><strong>{source.name}</strong><small>{source.type}</small></div><Tag color={source.enabled ? 'success' : 'default'}>{source.enabled ? '已启用' : '已停用'}</Tag></div><p>{source.description || '暂无描述'}</p><footer><span>连通性：未检测</span><ArrowUpRight size={14} /></footer></button>) : <Empty description="暂无数据源" />}</div>}
    </>}
  </div>;
};
