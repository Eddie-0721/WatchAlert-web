export const workspaceSection = (pathname, search = '') => {
    if (pathname.startsWith('/manage/')) return '/manage?tab=rules';
    if (pathname === '/manage') return `/manage?tab=${new URLSearchParams(search).get('tab') || 'rules'}`;
    if (/^\/(ruleGroup|tmplType)(\/|$)/.test(pathname)) return '/manage?tab=rules';
    if (/^\/(noticeObjects|noticeTemplate|noticeRecords|silenceRules)(\/|$)/.test(pathname)) return '/manage?tab=routes';
    if (pathname === '/datasource') return '/manage?tab=sources';
    if (/^\/(folders|folder|dashboard)(\/|$)/.test(pathname)) return '/folders';
    if (/^\/(user|userRole)(\/|$)/.test(pathname)) return '/user';
    if (pathname === '/onceProbing') return '/probing';
    return `/${pathname.split('/').filter(Boolean)[0] || ''}`;
};

export const workspaceParent = pathname => {
    const rule = pathname.match(/^\/ruleGroup\/([^/]+)\/rule\/(?:add|[^/]+\/edit)$/);
    if (rule) return `/ruleGroup/${rule[1]}/rule/list`;
    const recording = pathname.match(/^\/recordingRules\/([^/]+)\/(?:create|rule\/[^/]+\/edit)$/);
    if (recording) return `/recordingRules/${recording[1]}/list`;
    return workspaceSection(pathname);
};
