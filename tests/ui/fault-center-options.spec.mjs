import { test, expect } from '@playwright/test';

async function setup(page) {
  const requests = [];
  await page.addInitScript(() => {
    localStorage.setItem('Authorization', 'fixture-token');
    localStorage.setItem('TenantID', 't');
  });
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    requests.push(url);
    let data = [];
    if (path.endsWith('/userInfo')) data = { userid: 'u', username: 'SRE', role: 'admin' };
    if (path.endsWith('/getTenantList')) data = [{ id: 't', name: '测试租户' }];
    if (path.endsWith('/getTenant')) data = { id: 't', name: '测试租户' };
    if (path.endsWith('/faultCenterList')) data = url.searchParams.get('view') === 'options'
      ? [{ id: 'fc', name: '生产中心' }, { id: 'fc2', name: '测试中心' }]
      : [{ id: 'fc', name: '生产中心', currentAlertNumber: 37, currentPreAlertNumber: 11, currentRecoverNumber: 23 }];
    if (path.endsWith('/ruleGroupList')) data = { total: 1, list: [{ id: 'g', name: '规则组' }] };
    if (path.endsWith('/ruleList') || path.endsWith('/silenceList')) data = { total: 0, list: [] };
    if (path.endsWith('/ruleSearch')) data = { ruleId: 'r', ruleGroupId: 'g', ruleName: '延迟', datasourceType: 'Prometheus', datasourceId: [], externalLabels: {}, prometheusConfig: { promQL: 'up', rules: [] }, enabled: true };
    if (path.endsWith('/curEvent')) data = { total: 0, list: [], summary: { queues: { all: 0, attention: 0, processing: 0, suppressed: 0, observing: 0 }, environments: [], services: [] } };
    if (path.endsWith('/getDashboardInfo')) data = { alarmDistribution: {}, curAlertList: [] };
    return route.fulfill({ json: { code: 200, data, msg: 'success' } });
  });
  return requests;
}

for (const route of ['/', '/alerts', '/ruleGroup/g/rule/list', '/ruleGroup/g/rule/add', '/ruleGroup/g/rule/r/edit', '/silenceRules']) {
  test(`${route} requests center identities without statistics`, async ({ page }) => {
    const requests = await setup(page);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(route);
    await expect(page.locator('.app-content')).toBeVisible();
    if (route.endsWith('/rule/list')) await page.getByRole('button', { name: /导\s*入/, exact: true }).click();
    await expect.poll(() => requests.filter(url => url.pathname.endsWith('/faultCenterList')).length).toBeGreaterThan(0);
    await page.waitForLoadState('networkidle');
    const reads = requests.filter(url => url.pathname.endsWith('/faultCenterList'));
    expect(reads.every(url => url.searchParams.get('view') === 'options')).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('overview switches center using identity-only results', async ({ page }) => {
  const requests = await setup(page);
  await page.goto('/');
  await expect(page.locator('.ops-center-picker')).toContainText('生产中心');
  await page.locator('.ops-center-picker .ant-select').click();
  await page.locator('.ant-select-item-option-content').filter({ hasText: '测试中心' }).click();
  await expect.poll(() => requests.filter(url => url.pathname.endsWith('/getDashboardInfo')).at(-1)?.searchParams.get('faultCenterId')).toBe('fc2');
  expect(requests.filter(url => url.pathname.endsWith('/faultCenterList'))).toHaveLength(1);
});

test('alerts filters by center using identity-only results', async ({ page }) => {
  const requests = await setup(page);
  await page.goto('/alerts');
  await page.locator('.ant-select').filter({ hasText: '全部故障中心' }).click();
  await page.locator('.ant-select-item-option-content').filter({ hasText: '测试中心' }).click();
  await expect.poll(() => requests.filter(url => url.pathname.endsWith('/curEvent')).at(-1)?.searchParams.get('faultCenterId')).toBe('fc2');
});

test('fault center management still loads and displays real counts', async ({ page }) => {
  const requests = await setup(page);
  await page.goto('/faultCenter');
  const card = page.locator('.ant-card').filter({ hasText: '生产中心' });
  for (const number of ['37', '11', '23']) await expect(card.getByText(number, { exact: true })).toBeVisible();
  expect(requests.filter(url => url.pathname.endsWith('/faultCenterList')).every(url => !url.searchParams.has('view'))).toBe(true);
});
