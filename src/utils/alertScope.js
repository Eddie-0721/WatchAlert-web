const scopeAliases = {
    environment: ['environment', 'env', 'stage', 'deployment_environment'],
    service: ['service', 'app', 'application', 'job'],
    cluster: ['cluster', 'cluster_name', 'kubernetes_cluster'],
    namespace: ['namespace', 'kubernetes_namespace', 'k8s_namespace'],
    resource: ['resource_name', 'resource', 'pod', 'node', 'host', 'instance'],
    instance: ['instance', 'pod', 'node', 'host', 'endpoint'],
    owner: ['owner', 'team', 'service_owner'],
};

const labelValue = (labels, aliases) => {
    if (!labels || typeof labels !== 'object') return '';
    for (const alias of aliases) {
        const key = Object.keys(labels).find(item => item.toLowerCase() === alias);
        if (key && labels[key] !== undefined && labels[key] !== null) return String(labels[key]).trim();
    }
    return '';
};

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
