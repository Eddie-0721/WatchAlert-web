export function readAlertView(params: URLSearchParams) {
  const positive = (key: string, fallback: number, max: number) => { const value = Number(params.get(key)); return Number.isInteger(value) && value > 0 ? Math.min(value, max) : fallback; };
  const queue = params.get('queue') || 'attention';
  return { queue: ['attention','processing','suppressed','observing','all','history'].includes(queue) ? queue : 'attention',
    query: params.get('query') || '', centerId: params.get('center') || 'all', environment: params.get('environment') || undefined,
    service: params.get('service') || undefined, severity: ['P0','P1','P2'].includes(params.get('severity') || '') ? params.get('severity')! : undefined,
    page: positive('page',1,100000), pageSize: [10,30,50,100].includes(Number(params.get('size'))) ? Number(params.get('size')) : 30 };
}
export function patchAlertView(params: URLSearchParams, patch: Record<string, string | number | undefined>, resetPage = true) {
  const next = new URLSearchParams(params);
  if(resetPage) { next.delete('page'); next.delete('event'); }
  for(const [key,value] of Object.entries(patch)) { if(value === undefined || value === '' || value === 'all' && key === 'center') next.delete(key); else next.set(key,String(value)); }
  return next;
}
export function safeAlertReturn(path: unknown, tenant: unknown, currentTenant: string | null) {
  return tenant === currentTenant && typeof path === 'string' && (path === '/alerts' || path.startsWith('/alerts?')) ? path : '/alerts';
}
