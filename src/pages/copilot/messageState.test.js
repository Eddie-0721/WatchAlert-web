import { describe, expect, it } from 'vitest';
import { applyExecutedAction, parseEvidence } from './messageState';

describe('Copilot message identities', () => {
  it('normalizes absent, malformed and mixed evidence without trusting primitives', () => {
    for (const value of [null, undefined, '', 'invalid', '{}', 'null', '1']) expect(parseEvidence(value)).toEqual([]);
    expect(parseEvidence('[null,1,"text",{"toolName":"query"}]')).toEqual([{ toolName: 'query' }]);
  });
  it('retains all message identities when an action is outside the loaded history', () => {
    const messages = [{ id: 'one', evidence: [{ actionId: 'a' }] }, { id: 'two', evidence: '[]' }];
    expect(applyExecutedAction(messages, 'missing', 'ok')).toBe(messages);
  });
  it('updates matching occurrences but preserves unrelated messages and evidence', () => {
    const unaffected = { toolName: 'query', status: 'completed' };
    const original = { actionId: 'a', status: 'pending_confirmation', source: { environment: 'prod' } };
    const messages = [{ id: 'one', content: 'first', evidence: [original, unaffected] }, { id: 'two', evidence: [unaffected] }, { id: 'three', evidence: JSON.stringify([original]) }];
    const result = applyExecutedAction(messages, 'a', 'confirmed result');
    expect(result).not.toBe(messages);
    expect(result[1]).toBe(messages[1]);
    expect(result[0].evidence[1]).toBe(unaffected);
    for (const index of [0, 2]) expect(result[index].evidence[0]).toMatchObject({ actionId: 'a', status: 'executed', result: 'confirmed result', source: { environment: 'prod' } });
    expect(original.status).toBe('pending_confirmation');
    expect(result[0].content).toBe('first');
  });
});
