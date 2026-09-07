import { useState } from 'react';
import { Alert, Button, Tag } from 'antd';
import { diagnoseAgent } from '../../api/agent';

const names = {enabled:'Agent 开关',permissions:'当前用户工具权限',credentials:'模型凭据解密',runtime:'后端 → Agent',sdk:'Agent 运行依赖',gateway:'Agent → 工具网关',model:'Agent → 模型服务'};
const statuses = {ok:'检查通过',disabled:'未启用',unavailable:'不可用，请检查连接或服务日志',unconfigured:'尚未配置',unauthorized:'认证失败，请检查凭据',missing_model:'模型列表中没有所选模型',invalid:'配置或响应无效',unchecked:'环境变量模型未探测，请通过实际分析验证'};

export default function ConnectionDiagnostics() {
  const [loading,setLoading]=useState(false);
  const [report,setReport]=useState(null);
  const [error,setError]=useState('');
  const run=async()=>{setLoading(true);setError('');setReport(null);try{setReport(await diagnoseAgent())}catch(e){setError(e.message)}finally{setLoading(false)}};
  return <section className="copilot-diagnostics" aria-label="连接诊断">
    <Button loading={loading} onClick={run}>连接诊断</Button>
    <small>手动检查连接与模型列表，不发送聊天生成请求，不执行告警操作。</small>
    {error && <Alert showIcon type="error" message={error} />}
    {report && <div role="status"><p>检查时间：{new Date(report.checkedAt*1000).toLocaleString('zh-CN')}</p><ul>{report.checks.map(item=><li key={item.id}><span>{names[item.id] || item.id}</span><Tag color={item.status==='ok'?'success':'warning'}>{statuses[item.status] || '未知结果'}</Tag></li>)}</ul><p>连接正常不代表推理、余额或所有 Tool 可用。Prometheus 查询需选择有权限的数据源，以实际返回的时间范围和证据为准。</p></div>}
  </section>;
}
