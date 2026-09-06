import { describe, expect, it } from 'vitest';
import { workspaceParent, workspaceSection } from './workspaceNavigation';
describe('workspace navigation', () => {
  it.each([
    ['/ruleGroup/g/rule/r/edit','/manage?tab=rules'],
    ['/tmplType/Prometheus/group','/manage?tab=rules'],
    ['/silenceRules','/manage?tab=routes'],
    ['/datasource','/manage?tab=sources'],
    ['/userRole','/user'],
    ['/dashboard/f/a/g/b/info','/folders'],
  ])('%s retains its parent navigation', (path, expected) => expect(workspaceSection(path)).toBe(expected));
  it('returns to the same rule group', () => expect(workspaceParent('/ruleGroup/g/rule/r/edit')).toBe('/ruleGroup/g/rule/list'));
});
