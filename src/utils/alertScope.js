const scopeAliases = {
    environment: ['environment', 'env', 'stage', 'deployment_environment'],
    service: ['service', 'app', 'application', 'job'],
    cluster: ['cluster', 'cluster_name', 'kubernetes_cluster'],
    namespace: ['namespace', 'kubernetes_namespace', 'k8s_namespace'],
    resource: ['resource_name', 'resource', 'pod', 'node', 'host', 'instance'],
    instance: ['instance', 'pod', 'node', 'host', 'endpoint'],
    owner: ['owner', 'team', 'service_owner'],
};

const labelEntry = (labels, aliases) => {
    if (!labels || typeof labels !== 'object') return '';
    for (const alias of aliases) {
        const key = Object.keys(labels).find(item => item.toLowerCase() === alias);
        if (key && labels[key] !== undefined && labels[key] !== null && String(labels[key]).trim()) {
            return { key, value: String(labels[key]).trim() };
        }
    }
    return null;
};

const labelValue = (labels, aliases) => labelEntry(labels, aliases)?.value || '';

export const getAlertScope = event => {
    const labels = event?.labels || event?.externalLabels || {};
    const supplied = event?.scope || {};
    return Object.entries(scopeAliases).reduce((scope, [key, aliases]) => {
        scope[key] = supplied[key] || labelValue(labels, aliases);
        return scope;
    }, {});
};

export const scopeName = scope => [scope?.environment, scope?.service].filter(Boolean).join(' / ') || '未标记环境与服务';

export const scopeResource = scope => [scope?.cluster, scope?.namespace, scope?.resource || scope?.instance].filter(Boolean).join(' · ') || '未提供资源定位标签';

export const importantScopeLabels = event => {
    const scope = getAlertScope(event);
    return [
        ['环境', scope.environment],
        ['服务', scope.service],
        ['集群', scope.cluster],
        ['命名空间', scope.namespace],
        ['资源', scope.resource],
        ['实例', scope.instance],
        ['负责人', scope.owner],
    ].filter(([, value]) => value);
};

const uniqueMatchers = matchers => matchers.filter((matcher, index, source) =>
    matcher?.key && matcher?.value && source.findIndex(item => item.key.toLowerCase() === matcher.key.toLowerCase()) === index,
);

/**
 * Build silence conditions only from labels carried by the selected event.
 * Scope values can be supplied by an API projection, but a silence matcher needs
 * an actual event-label key to be evaluated by the backend, so projections are
 * deliberately never invented here.
 */
export const getAlertSilenceMatchers = (event, scope = 'service') => {
    const labels = event?.labels || event?.externalLabels || {};
    const entries = Object.entries(scopeAliases).reduce((result, [scopeKey, aliases]) => {
        const entry = labelEntry(labels, aliases);
        if (entry) result[scopeKey] = { ...entry, operator: '==' };
        return result;
    }, {});

    const serviceMatchers = [entries.environment, entries.service, entries.cluster, entries.namespace];
    const resourceMatchers = [...serviceMatchers, entries.resource || entries.instance];

    if (scope === 'resource') return uniqueMatchers(resourceMatchers);
    if (scope === 'all') {
        return uniqueMatchers(Object.entries(labels)
            .filter(([key, value]) => !['value', '__name__'].includes(key.toLowerCase()) && value !== undefined && value !== null && String(value).trim())
            .map(([key, value]) => ({ key, operator: '==', value: String(value).trim() })));
    }
    return uniqueMatchers(serviceMatchers);
};

export const buildSilenceContext = (event, options = {}) => {
    const scope = getAlertScope(event);
    return {
        alertName: event?.rule_name || event?.ruleName || event?.alertname || '当前告警',
        annotations: event?.annotations || event?.description || '',
        scope,
        faultCenterId: options.faultCenterId || event?.faultCenterId || event?.fault_center_id,
        faultCenterName: options.faultCenterName || event?.faultCenterName || event?.fault_center_name,
        matchers: {
            service: getAlertSilenceMatchers(event, 'service'),
            resource: getAlertSilenceMatchers(event, 'resource'),
            all: getAlertSilenceMatchers(event, 'all'),
        },
    };
};
