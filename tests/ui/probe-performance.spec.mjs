import { test, expect } from '@playwright/test';

async function mockAPI(page) {
  await page.addInitScript(() => {
    localStorage.setItem('Authorization', 'fixture-token');
    localStorage.setItem('TenantID', 't');
    window.__probeAborts = [];
    const open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
      if (String(url).includes('/probing/onceProbing')) {
        this.addEventListener('abort', () => window.__probeAborts.push(String(url)), { once: true });
      }
      return open.call(this, method, url, ...args);
    };
  });
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    let data = [];
    if (path.endsWith('/userInfo')) data = { userid: 'u', username: 'SRE', role: 'admin' };
    if (path.endsWith('/getTenantList')) data = [{ id: 't', name: '测试工作区' }];
    if (path.endsWith('/getTenant')) data = { id: 't', name: '测试工作区' };
    if (path.endsWith('/getDashboardInfo')) data = { curAlertList: [], alarmDistribution: {} };
    return route.fulfill({ json: { code: 200, data, msg: 'success' } });
  });
}

const result = (type, endpoint, value = 1) => ({ code: 200, data: [
  { name: `probe_${type}_success`, value, labels: { endpoint } },
  { name: `probe_${type}_response_time_ms`, value: 12, labels: { endpoint } },
  ...(type === 'http' ? [{ name: 'probe_http_status_code', value: 200, labels: { endpoint } }] : []),
] });
const submit = page => page.getByRole('button', { name: /拨测一下/ });
const endpoint = page => page.getByPlaceholder(/请输入端点/);

for (const width of [1440, 390]) {
  test(`probe cancels protocol changes and SPA unmount at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockAPI(page);
    const pending = [];
    await page.route('**/probing/onceProbing', async route => {
      const payload = route.request().postDataJSON();
      await new Promise(resolve => pending.push(resolve));
      await route.fulfill({ json: result(payload.ruleType.toLowerCase(), payload.probingEndpointConfig.endpoint) }).catch(() => {});
    });
    try {
      await page.goto('/onceProbing');
      await endpoint(page).fill('https://old.example.com');
      // Two immediate DOM clicks exercise the guard before async validation settles.
      await submit(page).evaluate(button => { button.click(); button.click(); });
      await expect.poll(() => pending.length).toBe(1);
      await expect(submit(page)).toBeDisabled();
      await page.getByRole('tab', { name: 'TCP', exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.__probeAborts.length)).toBe(1);
      await endpoint(page).fill('new.example.com:80');
      await submit(page).click();
      await expect.poll(() => pending.length).toBe(2);
      pending[1]();
      await expect(page.locator('.ant-table-tbody')).toContainText('new.example.com:80');
      pending[0]();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('.ant-table-tbody')).not.toContainText('old.example.com');
      await expect(page.locator('.ant-message-notice-success')).toHaveCount(1);
      await expect(page.locator('.ant-alert-error')).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await page.screenshot({ path: `test-results/visual/probe-result-${width}.png`, fullPage: true });
      await submit(page).click();
      await expect.poll(() => pending.length).toBe(3);
      if (width < 768) {
        await page.getByRole('button', { name: '打开全部导航和账号菜单' }).click();
        await page.locator('.wa-nav-drawer').getByRole('button', { name: '告警', exact: true }).click();
      } else {
        await page.locator('.wa-sider').getByRole('button', { name: '告警', exact: true }).click();
      }
      await expect(page).toHaveURL(/\/alerts/);
      await expect.poll(() => page.evaluate(() => window.__probeAborts.length)).toBe(2);
      await expect(page.locator('.ant-message-notice-success')).toHaveCount(0);
      pending[2]();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('.ant-message-notice-success')).toHaveCount(0);
      await expect(page.locator('.ant-message-notice-error')).toHaveCount(0);
    } finally {
      pending.forEach(resolve => resolve());
      await page.unrouteAll({ behavior: 'wait' });
    }
  });
}

test('probe failures and empty results remain errors, retry replaces only current results', async ({ page }) => {
  await mockAPI(page);
  const responses = [
    { status: 400, json: { code: 400, data: '拨测容量已满，请稍后重试' } },
    { json: { code: 400, data: '配置错误' } },
    { json: { code: 200, data: [] } },
    { json: result('tcp', 'example.com:80', 0) },
  ];
  await page.route('**/probing/onceProbing', route => route.fulfill(responses.shift()));
  await page.goto('/onceProbing');
  await page.getByRole('tab', { name: 'TCP', exact: true }).click();
  await endpoint(page).fill('example.com:80');
  for (const error of ['拨测容量已满，请稍后重试', '配置错误', '拨测未返回有效结果，请重试']) {
    await submit(page).click();
    await expect(page.locator('.ant-alert-error')).toHaveText(error);
    await expect(page.locator('.ant-table-tbody')).toHaveCount(0);
    await expect(page.locator('.ant-message-notice-success')).toHaveCount(0);
    await expect(submit(page)).toBeEnabled();
  }
  await submit(page).click();
  await expect(page.locator('.ant-table-tbody')).toContainText('失败');
  await expect(page.locator('.ant-alert-error')).toHaveCount(0);
  await expect(page.getByText('拨测完成', { exact: true })).toBeVisible();
  await endpoint(page).fill('other.example.com:80');
  await expect(page.locator('.ant-table-tbody')).toHaveCount(0);
});

test('probe validates before sending and retains HTTP headers/body without logging them', async ({ page }) => {
  await mockAPI(page);
  const requests = [], logs = [];
  page.on('console', msg => logs.push(Promise.all(msg.args().map(arg => arg.jsonValue().catch(() => msg.text())))));
  await page.route('**/probing/onceProbing', route => {
    const payload = route.request().postDataJSON(); requests.push(payload);
    return route.fulfill({ json: result('http', payload.probingEndpointConfig.endpoint) });
  });
  await page.goto('/onceProbing');
  await endpoint(page).fill('invalid');
  await submit(page).click();
  await expect(page.getByText('请输入有效的 http(s)://URL', { exact: true })).toBeVisible();
  expect(requests).toHaveLength(0);
  await endpoint(page).fill('https://example.com');
  await page.getByText('高级选项', { exact: true }).click();
  for (const invalid of ['0', '1.5']) {
    await page.getByPlaceholder('请输入超时时间').fill(invalid);
    await submit(page).click();
    await expect(page.getByText('请输入大于 0 的整数', { exact: true })).toBeVisible();
    expect(requests).toHaveLength(0);
  }
  await page.getByPlaceholder('请输入超时时间').fill('3');
  await page.locator('.ant-input-group-addon .ant-select').click();
  await page.getByTitle('POST', { exact: true }).click();
  await page.getByRole('button', { name: '添加请求头' }).click();
  await page.getByPlaceholder('键 (例如: Content-Type)').fill('Authorization');
  await page.getByPlaceholder('值 (例如: application/json)').fill('fixture-sensitive-header');
  await page.getByPlaceholder(/请输入请求体/).fill('{"secret":"fixture-sensitive-body"}');
  await submit(page).click();
  await expect(page.locator('.ant-table-tbody')).toContainText('example.com');
  expect(requests).toEqual([{ ruleType: 'HTTP', probingEndpointConfig: {
    endpoint: 'https://example.com', strategy: { timeout: 3 },
    http: { method: 'POST', header: { Authorization: 'fixture-sensitive-header' }, body: '{"secret":"fixture-sensitive-body"}' },
  } }]);
  const output = JSON.stringify(await Promise.all(logs));
  expect(output).not.toContain('fixture-sensitive-header');
  expect(output).not.toContain('fixture-sensitive-body');
});

test('probe accepts internal hosts and IPv6 and preserves numeric values across protocols', async ({ page }) => {
  await mockAPI(page);
  const requests = [];
  await page.route('**/probing/onceProbing', route => {
    const payload = route.request().postDataJSON(); requests.push(payload);
    const name = { HTTP: 'probe_http_success', ICMP: 'probe_icmp_packet_loss_percent', TCP: 'probe_tcp_success', SSL: 'probe_ssl_certificate_valid' }[payload.ruleType];
    return route.fulfill({ json: { code: 200, data: [{ name, value: 1, labels: { endpoint: payload.probingEndpointConfig.endpoint } }] } });
  });
  await page.goto('/onceProbing');
  await page.getByText('高级选项', { exact: true }).click();
  await page.getByPlaceholder('请输入超时时间').fill('1e2');
  const targets = [['HTTP', 'http://localhost?ready=1'], ['HTTP', 'http://[::1]:8080'], ['TCP', '[::1]:80'], ['TCP', 'service:80'], ['ICMP', '::1'], ['ICMP', 'service'], ['SSL', 'service:443'], ['SSL', '[::1]:443']];
  for (const [type, target] of targets) {
    await page.getByRole('tab', { name: type, exact: true }).click();
    await endpoint(page).fill(target);
    await submit(page).click();
    await expect(page.locator('.ant-table-tbody')).toContainText(target);
    expect(requests.at(-1).probingEndpointConfig.strategy.timeout).toBe(100);
  }
  expect(requests).toHaveLength(targets.length);
  expect(requests.find(request => request.ruleType === 'ICMP').probingEndpointConfig.icmp).toEqual({ count: 10, interval: 1 });
});
