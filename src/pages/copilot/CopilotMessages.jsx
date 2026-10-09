import { memo, useMemo } from 'react';
import { Button, Collapse, Tag } from 'antd';
import MarkdownRenderer from '../../utils/MarkdownRenderer';
import { parseEvidence, stamp } from './messageState';

const statusText = { completed: '查询成功', failed: '失败', pending_confirmation: '等待确认', executed: '已执行', expired: '已过期', executing: '执行中' };

// Collapse mounts this component on first expansion: do not eagerly stringify
// evidence for every historical turn while the panel has never been opened.
const EvidenceList = memo(function EvidenceList({ items, actionDisabled, onConfirm, navigate, returnTo }) {
  return items.map((item, index) => <div className="copilot-tool-evidence" key={item.actionId || index}>
    <div className="copilot-tool-evidence__title"><strong>{item.toolName}</strong><Tag color={item.status === 'failed' ? 'error' : item.status === 'pending_confirmation' ? 'warning' : 'default'}>{statusText[item.status] || item.status}</Tag></div>
    <p>{item.summary}</p>
    <p>查询时间：{stamp(item.queriedAt)}{item.truncated ? ' · 结果已截断，不能作为完整统计' : ''}</p>
    {item.source && <pre>{JSON.stringify(item.source, null, 2)}</pre>}
    {item.query && <pre>{JSON.stringify(item.query, null, 2)}</pre>}
    {item.status === 'executed' && <div><Button onClick={() => navigate(returnTo)}>返回告警核对状态</Button>{item.toolName?.startsWith('silences.') && <Button onClick={() => navigate('/silenceRules')}>查看静默规则</Button>}</div>}
    {item.status === 'pending_confirmation' && <Button disabled={actionDisabled} danger={item.riskLevel === 'high'} onClick={() => onConfirm(item)}>查看并确认</Button>}
  </div>);
});

const CopilotTurn = memo(function CopilotTurn({ item, waiting, actionDisabled, onConfirm, navigate, returnTo }) {
  const evidence = useMemo(() => parseEvidence(item.evidence), [item.evidence]);
  return <article className={`copilot-turn copilot-turn--${item.role}`}>
    <div className="copilot-turn__role">{item.role === 'user' ? '你' : 'Copilot'}{item.incomplete && <Tag>未完成</Tag>}</div>
    {item.role === 'user' ? <p>{item.content}</p> : <MarkdownRenderer data={item.content || (waiting ? '正在查询…' : '未生成完整回复')} />}
    {evidence.length > 0 && <Collapse className="copilot-message-evidence" items={[{
      key: 'evidence', label: `数据来源与操作（${evidence.length}）`,
      children: <EvidenceList items={evidence} actionDisabled={actionDisabled} onConfirm={onConfirm} navigate={navigate} returnTo={returnTo} />,
    }]} />}
  </article>;
});

export default memo(function CopilotMessages({ messages, loading, actionDisabled, onConfirm, navigate, returnTo }) {
  return messages.map((item, index) => <CopilotTurn key={item.id || index} item={item}
    waiting={loading && !item.content} actionDisabled={actionDisabled}
    onConfirm={onConfirm} navigate={navigate} returnTo={returnTo} />);
});
