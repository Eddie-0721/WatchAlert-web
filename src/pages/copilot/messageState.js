export const parseEvidence = value => {
  try {
    const parsed = Array.isArray(value) ? value : JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter(item => item && typeof item === 'object') : [];
  } catch { return []; }
};

export const stamp = time => time ? new Date(time * 1000).toLocaleString('zh-CN') : '未记录';

// Only replace messages/evidence affected by this result. Stable identities let
// the conversation reuse every other rendered turn, including expanded evidence.
export function applyExecutedAction(messages, actionId, result) {
  let changed = false;
  const next = messages.map(msg => {
    const evidence = parseEvidence(msg.evidence);
    if (!evidence.some(entry => entry.actionId === actionId)) return msg;
    changed = true;
    return { ...msg, evidence: evidence.map(entry => entry.actionId === actionId
      ? { ...entry, status: 'executed', summary: 'WatchAlert 已执行此操作', result }
      : entry) };
  });
  return changed ? next : messages;
}
