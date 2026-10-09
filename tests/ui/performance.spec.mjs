import { test, expect } from '@playwright/test';

async function mockAPI(page) {
  const requests = [];
  await page.addInitScript(() => {
    localStorage.setItem('Authorization', 'fixture-token');
    localStorage.setItem('TenantID', 't');
  });
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    requests.push(url);
    const path = url.pathname;
    let data = [];
    if (path.endsWith('/userInfo')) data = { userid: 'u', username: 'SRE', role: 'admin' };
    if (path.endsWith('/getTenantList')) data = [{ id: 't', name: '测试工作区' }];
    if (path.endsWith('/getTenant')) data = { id: 't', name: '测试工作区' };
    if (path.endsWith('/faultCenterList')) data = [{ id: 'fc', name: '支付业务' }, { id: 'fc2', name: '平台业务' }];
    if (path.endsWith('/noticeRecordMetric')) data = { date: [], series: { p0: [], p1: [], p2: [] } };
    if (path.endsWith('/getDashboardInfo')) data = { countAlertRules: 4, faultCenterNumber: 2, userNumber: 1, curAlertList: [], alarmDistribution: { P0: 0, P1: 0, P2: 0 } };
    if (path.endsWith('/ruleGroupList')) data = { index: 1, size: 10, total: 1, list: [{ id: 'g', name: '支付规则' }] };
    if (path.endsWith('/ruleList') || path.endsWith('/ruleTmplGroupList')) data = { index: 1, size: 10, total: 0, list: [] };
    await route.fulfill({ json: { code: 200, data, msg: 'success' } });
  });
  return requests;
}

test('switching overview center only reloads its dashboard; refresh reloads all data', async ({ page }) => {
  const requests = await mockAPI(page);
  const count = suffix => requests.filter(url => url.pathname.endsWith(suffix)).length;
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '当前范围暂无活跃告警' })).toBeVisible();
  expect(count('/faultCenterList')).toBe(1);
  expect(count('/noticeRecordMetric')).toBe(1);
  await page.locator('.ops-center-picker .ant-select').click();
  await page.locator('.ant-select-item-option').filter({ hasText: '平台业务' }).click();
  await expect.poll(() => count('/getDashboardInfo')).toBe(2);
  await expect(page.getByRole('heading', { name: '当前范围暂无活跃告警' })).toBeVisible();
  expect(count('/faultCenterList')).toBe(1);
  expect(count('/noticeRecordMetric')).toBe(1);
  expect(requests.filter(url => url.pathname.endsWith('/getDashboardInfo')).at(-1).searchParams.get('faultCenterId')).toBe('fc2');
  await page.getByRole('button', { name: /刷\s*新/ }).click();
  await expect.poll(() => count('/getDashboardInfo')).toBe(3);
  expect(count('/faultCenterList')).toBe(2);
  expect(count('/noticeRecordMetric')).toBe(2);
});

for (const route of ['/ruleGroup/g/rule/list', '/tmplType/Prometheus/g/templates', '/datasource', '/noticeTemplate', '/prometheusTargets']) {
  test(`editor engine stays unloaded on ${route}`, async ({ page }) => {
    await mockAPI(page);
    const editorRequests = [];
    page.on('request', request => {
      if (/\/(?:monacoSetup|VSCodeEditor|sqlEditor|SafeDiffEditor)-[^/]+\.js/.test(request.url())) editorRequests.push(request.url());
    });
    await page.goto(route);
    await expect(page.locator('.app-content')).toBeVisible();
    await expect(page.getByText('正在加载页面…')).toHaveCount(0);
    await page.waitForLoadState('networkidle');
    expect(editorRequests).toEqual([]);
    if (route === '/ruleGroup/g/rule/list') {
      await page.getByRole('button', { name: /导\s*入/, exact: true }).click();
      await expect(page.locator('.monaco-editor').first()).toBeVisible();
      await expect.poll(() => editorRequests.length).toBeGreaterThan(0);
      const input = page.locator('.monaco-editor textarea').first();
      await input.press('ControlOrMeta+A');
      await input.pressSequentially('{"perf":1}');
      await expect(page.locator('.monaco-editor .view-lines').first()).toContainText('perf');
    }
  });
}
