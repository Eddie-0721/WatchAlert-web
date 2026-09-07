import { useState, useEffect, useRef } from 'react';
import { Alert, Button, Input, InputNumber, Select, Switch, Table, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import './workflow.css';

const fixtures=[
 {id:'demo-prod',name:'支付接口错误率',env:'prod',service:'payment',source:'生产 Prometheus',query:'sum(rate(http_requests_total{env="prod",service="payment",code=~"5.."}[5m])) / sum(rate(http_requests_total{env="prod",service="payment"}[5m]))',threshold:0.05,enabled:true},
 {id:'demo-test',name:'订单服务不可用',env:'test',service:'orders',source:'测试 Prometheus',query:'up{env="test",service="orders"}',threshold:1,enabled:false},
];
const labels={name:'规则名称',env:'环境',service:'服务',source:'数据源',query:'表达式',threshold:'阈值',enabled:'启用状态'};
const display=value=>typeof value==='boolean'?(value?'启用':'停用'):String(value);

export default function RuleWorkflowPreview() {
 const navigate=useNavigate();
 const savedRef=useRef(null);
 const [search,setSearch]=useState('');
 const [environment,setEnvironment]=useState('all');
 const [original,setOriginal]=useState(null);
 const [draft,setDraft]=useState(null);
 const [tested,setTested]=useState(false);
 const [review,setReview]=useState(false);
 const [saved,setSaved]=useState(false);
 const [validation,setValidation]=useState('');
 useEffect(()=>{if(saved)savedRef.current?.scrollIntoView({block:'center'})},[saved]);
 const change=patch=>{setDraft(current=>({...current,...patch}));setTested(false);setReview(false);setSaved(false);setValidation('')};
 const choose=rule=>{setOriginal(rule);setDraft({...rule});setTested(false);setReview(false);setSaved(false);setValidation('')};
 const differences=draft?Object.keys(labels).filter(key=>draft[key]!==original[key]).map(key=>({key,name:labels[key],before:display(original[key]),after:display(draft[key])})):[];
 const valid=()=>{if(!draft.name.trim() || !draft.query.trim() || draft.threshold===null){setValidation('请填写名称、表达式与阈值');return false}return true};
 return <div className="rule-workflow-preview">
  <header><div><h1>规则维护 · 交互预览</h1><p>找到规则 → 查看范围 → 测试草稿 → 核对变更</p></div><Button onClick={()=>navigate('/manage')}>返回 Manage</Button></header>
  <Alert showIcon type="info" message="独立演示，不连接真实规则或指标" description="此页仅用于确认维护流程。所有内容均为示例，测试不执行 PromQL，保存仅保留在当前页面内存，刷新后清除。实际维护请返回 Manage。" />
  <section><h2>1. 找到要维护的规则</h2><div className="rule-workflow-filters"><Input.Search aria-label="搜索演示规则" placeholder="搜索名称或服务" value={search} onChange={e=>setSearch(e.target.value)} /><Select aria-label="演示环境" value={environment} onChange={setEnvironment} options={[{value:'all',label:'全部环境'},{value:'prod',label:'生产'},{value:'test',label:'测试'}]} /></div>
  {fixtures.filter(rule=>(environment==='all'||rule.env===environment)&&[rule.name,rule.service].join(' ').includes(search)).map(rule=><button aria-pressed={draft?.id===rule.id} className="rule-workflow-row" key={rule.id} onClick={()=>choose(rule)}><strong>{rule.name}</strong><span>{rule.env} / {rule.service}</span><Tag>{rule.enabled?'已启用':'已停用'}</Tag><small>最近评估：未接入</small></button>)}
  {!fixtures.some(rule=>(environment==='all'||rule.env===environment)&&[rule.name,rule.service].join(' ').includes(search)) && <p>没有匹配的演示规则。</p>}</section>
  {draft && <>
   <section><h2>2. 查看范围并编辑草稿</h2><p>规则组：业务可用性 · 模板来源：自定义 · {draft.source}</p><p>环境：{draft.env} · 服务：{draft.service} · 通知目标：{draft.env==='prod'?'生产值班组':'测试值班组'}（示例）</p><small>模板用于初始化规则；此原型不设计模板自动同步或批量发布。</small>
   <label>规则名称<Input aria-label="演示规则名称" value={draft.name} onChange={e=>change({name:e.target.value})} /></label>
   <label>表达式<Input.TextArea aria-label="演示表达式" rows={4} value={draft.query} onChange={e=>change({query:e.target.value})} /></label>
   <div className="rule-workflow-filters"><label>阈值<InputNumber aria-label="演示阈值" value={draft.threshold} onChange={threshold=>change({threshold})} /></label><label>启用状态<Switch aria-label="演示启用状态" checked={draft.enabled} onChange={enabled=>change({enabled})} /></label></div>
   <Alert type="warning" showIcon message="Label 展示不是范围证明" description="正式实现需要同时验证表达式选择器、数据源和规则 Label；不能仅凭 env 标签推断实际监控覆盖范围。" />
   </section>
   <section><h2>3. 验证草稿</h2><p>正式测试需要返回查询时间、命中序列、错误与耗时；无数据不等于健康。</p><Button onClick={()=>{if(valid()){setTested(true);setReview(false)}}}>演示测试步骤</Button>{tested && <Alert type="info" showIcon message="演示测试步骤已完成（未查询真实数据）" description="正式版本在此展示实际查询结果，不使用随机数据或固定成功提示代替评估。" />}{validation && <Alert type="error" message={validation} />}</section>
   <section><h2>4. 核对变更</h2><Button disabled={!tested||!differences.length} onClick={()=>setReview(true)}>预览变更</Button>{!differences.length&&<small> 修改内容后可预览差异。</small>}
   {review && <><Table size="small" pagination={false} dataSource={differences} columns={[{title:'字段',dataIndex:'name'},{title:'原配置',dataIndex:'before'},{title:'新配置',dataIndex:'after'}]} /><Alert showIcon type={draft.env==='prod'?'warning':'info'} message={draft.env==='prod'?'涉及生产环境：请核对通知影响':'请核对通知影响'} description={draft.enabled?'表达式或阈值变化可能改变后续触发与通知。此原型不估算真实影响数量。':'停用后将停止后续规则评估；已有告警的生命周期需按系统实际行为核对。'} /><Button type="primary" disabled={saved} onClick={()=>setSaved(true)}>保存演示草稿</Button></>}
   {saved && <div ref={savedRef}><Alert showIcon type="success" message="演示草稿已保留在当前页面，未修改真实规则" /></div>}
   </section>
  </>}
 </div>;
}
