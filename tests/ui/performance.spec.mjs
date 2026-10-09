import { test, expect } from '@playwright/test';

function faultEventRow(name, id = name) {
  return { id, fingerprint: id, rule_name: name, annotations: '测试事件', datasource_type: 'Prometheus', severity: 'P0', status: 'alerting', first_trigger_time: 1700000000, recover_time: 1700000100, confirmState: {}, labels: {} };
}

for (const history of [false, true]) {
  const kind = history ? 'history' : 'current';
  const endpoint = history ? 'hisEvent' : 'curEvent';
  const path = `/faultCenter/detail/fc?tab=${history ? '2' : '1'}`;

  test(`fault ${kind} coalesces typing, enters, clears and filters without duplicate reads`, async ({ page }) => {
    await mockAPI(page);
    const requests = [];
    await page.route(`**/event/${endpoint}*`, route => {
      const params = new URL(route.request().url()).searchParams; requests.push(params);
      return route.fulfill({ json: { code: 200, data: { index: Number(params.get('index')), total: 30, list: [faultEventRow(`页-${params.get('index')}`)] } } });
    });
    await page.clock.install();
    await page.goto(path);
    await expect(page.getByText('页-1', { exact: true })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(requests).toHaveLength(1);
    await page.locator('.ant-pagination-item-2').click();
    await expect(page.getByText('页-2', { exact: true })).toBeVisible();
    expect(requests).toHaveLength(2);
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    const input = page.getByPlaceholder('输入搜索关键字');
    await input.pressSequentially('payment');
    expect(requests).toHaveLength(2);
    await page.clock.runFor(299);
    expect(requests).toHaveLength(2);
    await page.clock.runFor(1);
    await expect.poll(() => requests.length).toBe(3);
    expect(requests.at(-1).get('query')).toBe('payment');
    expect(requests.at(-1).get('index')).toBe('1');
    await input.fill('pending');
    await page.locator('.ant-select').filter({ hasText: '告警等级' }).click();
    await page.getByText('P0级告警', { exact: true }).click();
    await expect.poll(() => requests.length).toBe(4);
    await page.clock.runFor(1000);
    expect(requests).toHaveLength(4);
    expect(requests.at(-1).get('query')).toBe('pending');
    expect(requests.at(-1).get('severity')).toBe('P0');
    await input.fill('enter-now');
    await input.press('Enter');
    await expect.poll(() => requests.length).toBe(5);
    await page.clock.runFor(1000);
    expect(requests).toHaveLength(5);
    await page.locator('.ant-input-clear-icon').click();
    await expect.poll(() => requests.length).toBe(6);
    await page.clock.runFor(1000);
    expect(requests).toHaveLength(6);
    expect(requests.at(-1).has('query')).toBe(false);
    await input.dispatchEvent('compositionstart', { data: '' });
    await input.fill('sheng');
    await page.clock.runFor(1000);
    await input.dispatchEvent('keydown', { key: 'Enter', keyCode: 229, isComposing: true });
    expect(requests).toHaveLength(6);
    await input.fill('生产');
    await input.dispatchEvent('compositionend', { data: '生产' });
    await expect.poll(() => requests.length).toBe(7);
    expect(requests.at(-1).get('query')).toBe('生产');
    expect(requests.every(params => params.get('faultCenterId') === 'fc')).toBe(true);
  });

  test(`fault ${kind} initial URL reads once, ignores late responses and retries failures`, async ({ page }) => {
    await mockAPI(page);
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const requests = [];
    let fail = false;
    await page.route(`**/event/${endpoint}*`, async route => {
      const params = new URL(route.request().url()).searchParams; requests.push(params);
      const old = params.get('query') === 'initial';
      if (old) await pending;
      await route.fulfill({ json: fail ? { code: 400, data: 'unavailable' } : { code: 200, data: { total: 1, list: [faultEventRow(old ? '旧事件不可覆盖' : '最新事件')] } } }).catch(() => {});
    });
    try {
      await page.goto(`${path}&query=initial`);
      await expect.poll(() => requests.length).toBe(1);
      expect(requests[0].get('query')).toBe('initial');
      const input = page.getByPlaceholder('输入搜索关键字');
      await input.fill('latest'); await input.press('Enter');
      await expect(page.getByText('最新事件', { exact: true })).toBeVisible();
      release();
      await page.waitForLoadState('networkidle');
      expect(requests).toHaveLength(2);
      await expect(page.getByText('旧事件不可覆盖', { exact: true })).toHaveCount(0);
      await expect(page.locator('.ant-message-notice-error')).toHaveCount(0);
      fail = true;
      await page.getByRole('button', { name: /刷\s*新/, exact: true }).click();
      await expect(page.getByText(history ? '历史告警加载失败，请点击刷新重试' : '告警事件加载失败，请点击刷新重试', { exact: true })).toBeVisible();
      fail = false;
      await input.press('Enter');
      await expect(page.getByText('最新事件', { exact: true })).toBeVisible();
      expect(requests).toHaveLength(4);
    } finally { release(); await page.unrouteAll({ behavior: 'wait' }); }
  });

  test(`fault ${kind} empty page resets with only one follow-up read`, async ({ page }) => {
    await mockAPI(page);
    const pages = [];
    await page.route(`**/event/${endpoint}*`, route => {
      const index = Number(new URL(route.request().url()).searchParams.get('index')); pages.push(index);
      return route.fulfill({ json: { code: 200, data: { index, total: 11, list: index === 1 ? [faultEventRow('有效事件')] : [] } } });
    });
    await page.goto(path);
    await expect(page.getByText('有效事件', { exact: true })).toBeVisible();
    await page.locator('.ant-pagination-item-2').click();
    await expect.poll(() => pages.length).toBe(3);
    await page.waitForLoadState('networkidle');
    expect(pages).toEqual([1, 2, 1]);
    await expect(page.getByText('有效事件', { exact: true })).toBeVisible();
  });
}

test('fault current idle page does not schedule unused 100ms render updates', async ({ page }) => {
  await mockAPI(page);
  await page.clock.install();
  await page.goto('/faultCenter/detail/fc');
  await expect(page.getByText('暂无告警事件', { exact: true })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.evaluate(() => {
    window.__idleTimers = 0;
    const original = window.setTimeout;
    window.setTimeout = function (callback, delay, ...args) {
      if (delay === 100) window.__idleTimers += 1;
      return original(callback, delay, ...args);
    };
  });
  await page.clock.runFor(2000);
  expect(await page.evaluate(() => window.__idleTimers)).toBe(0);
});

test('fault in-flight reads abort on search, tab switch and navigation', async ({ page }) => {
  await mockAPI(page);
  await page.addInitScript(() => {
    window.__faultAborts = [];
    const open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...args) {
      if (/\/event\/(curEvent|hisEvent)/.test(String(url))) this.addEventListener('abort', () => window.__faultAborts.push(String(url)), { once: true });
      return open.call(this, method, url, ...args);
    };
  });
  const pending = [];
  await page.route('**/event/*Event*', async route => {
    await new Promise(resolve => pending.push(resolve));
    await route.fulfill({ json: { code: 200, data: { list: [], total: 0 } } }).catch(() => {});
  });
  try {
    await page.goto('/faultCenter/detail/fc');
    await expect.poll(() => pending.length).toBe(1);
    await page.getByPlaceholder('输入搜索关键字').fill('payment');
    await expect.poll(() => pending.length).toBe(2);
    await expect.poll(() => page.evaluate(() => window.__faultAborts.length)).toBe(1);
    await page.getByRole('tab', { name: '历史告警', exact: true }).click();
    await expect.poll(() => pending.length).toBe(3);
    await expect.poll(() => page.evaluate(() => window.__faultAborts.length)).toBe(2);
    await page.getByRole('button', { name: 'Copilot', exact: true }).click();
    await expect(page).toHaveURL(/\/copilot$/);
    await expect.poll(() => page.evaluate(() => window.__faultAborts.length)).toBe(3);
    await expect(page.locator('.ant-message-notice-error')).toHaveCount(0);
  } finally { pending.forEach(resolve => resolve()); await page.unrouteAll({ behavior: 'wait' }); }
});

test('fault current duration stays live without refreshing data and stops in hidden tabs', async ({ page }) => {
  await mockAPI(page);
  const instant = new Date('2026-10-10T12:00:00Z');
  let reads = 0;
  await page.route('**/event/curEvent*', route => {
    reads += 1;
    return route.fulfill({ json: { code: 200, data: { total: 1, list: [{ ...faultEventRow('计时事件'), first_trigger_time: instant.getTime() / 1000 - 30 }] } } });
  });
  await page.clock.install({ time: instant });
  await page.goto('/faultCenter/detail/fc');
  const cell = page.locator('.ant-tabs-tabpane-active .ant-table-tbody tr[data-row-key] td').nth(3);
  await expect(cell).toContainText('秒');
  await page.clock.pauseAt(new Date(instant.getTime() + 5000));
  const before = await cell.innerText();
  await page.clock.runFor(2000);
  await expect(cell).not.toHaveText(before);
  expect(reads).toBe(1);
  await page.getByRole('tab', { name: '历史告警', exact: true }).click();
  const hiddenCell = page.locator('.ant-tabs-tabpane-hidden .ant-table-tbody tr[data-row-key] td').nth(3);
  const stopped = await hiddenCell.innerText();
  await page.clock.runFor(5000);
  expect(await hiddenCell.innerText()).toBe(stopped);
  expect(reads).toBe(1);
  await page.getByRole('tab', { name: '活跃告警', exact: true }).click();
  await expect.poll(() => reads).toBe(2);
  await expect(cell).not.toHaveText(stopped);
});

test('fault hidden event tabs stop searches and resume with the current URL', async ({ page }) => {
  const requests = await mockAPI(page);
  const reads = () => requests.filter(url => /\/event\/(curEvent|hisEvent)$/.test(url.pathname));
  await page.clock.install();
  await page.goto('/faultCenter/detail/fc');
  await expect.poll(() => reads().length).toBe(1);
  await page.getByRole('tab', { name: '历史告警', exact: true }).click();
  await expect.poll(() => reads().length).toBe(2);
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const input = page.locator('.ant-tabs-tabpane-active').getByPlaceholder('输入搜索关键字');
  await input.fill('payment');
  await page.clock.runFor(300);
  await expect.poll(() => reads().length).toBe(3);
  expect(reads().at(-1).pathname).toMatch(/hisEvent$/);
  await input.fill('switch-now');
  await page.getByRole('tab', { name: '活跃告警', exact: true }).click();
  await expect.poll(() => reads().length).toBe(4);
  await page.clock.runFor(1000);
  expect(reads()).toHaveLength(4);
  expect(reads().at(-1).pathname).toMatch(/curEvent$/);
  expect(reads().at(-1).searchParams.get('query')).toBe('switch-now');
});

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

test('notification records load once and batch text searches', async ({ page }) => {
  await mockAPI(page);
  const requests = [];
  await page.route('**/noticeRecordList*', route => {
    requests.push(new URL(route.request().url()).searchParams);
    return route.fulfill({ json: { code: 200, data: { list: [], index: 1, total: 0 } } });
  });
  await page.clock.install();
  await page.goto('/noticeRecords');
  await expect(page.getByText('暂无通知记录')).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(requests).toHaveLength(1);
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const input = page.getByPlaceholder('输入搜索关键字');
  await input.pressSequentially('payment');
  expect(requests).toHaveLength(1);
  await page.clock.runFor(300);
  await expect.poll(() => requests.length).toBe(2);
  expect(requests.at(-1).get('query')).toBe('payment');
  await input.fill('database');
  await input.press('Enter');
  await expect.poll(() => requests.length).toBe(3);
  expect(requests.at(-1).get('query')).toBe('database');
  await page.clock.runFor(1000);
  expect(requests).toHaveLength(3);
  await page.locator('.ant-input-clear-icon').click();
  await expect.poll(() => requests.length).toBe(4);
  await page.clock.runFor(1000);
  expect(requests).toHaveLength(4);
  expect(requests.at(-1).has('query')).toBe(false);
  await input.dispatchEvent('compositionstart', { data: '' });
  await input.fill('sheng');
  await page.clock.runFor(1000);
  await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229, isComposing: true });
  expect(requests).toHaveLength(4);
  await input.fill('生产');
  await input.dispatchEvent('compositionend', { data: '生产' });
  await expect.poll(() => requests.length).toBe(5);
  expect(requests.at(-1).get('query')).toBe('生产');
});

test('notification paging and filters issue one scoped read per action and recover from failure', async ({ page }) => {
  await mockAPI(page);
  await page.clock.install();
  const requests = [];
  let reject = false;
  await page.route('**/noticeRecordList*', route => {
    const params = new URL(route.request().url()).searchParams; requests.push(params);
    const index = Number(params.get('index'));
    return route.fulfill({ json: reject ? { code: 400, data: 'unavailable' } : { code: 200, data: { index, total: 30, list: [{ id: `record-${index}`, ruleName: `第 ${index} 页通知`, status: 0, createAt: 1700000000 }] } } });
  });
  await page.goto('/noticeRecords');
  await expect(page.getByText('第 1 页通知', { exact: true })).toBeVisible();
  await page.locator('.ant-pagination-item-2').click();
  await expect(page.getByText('第 2 页通知', { exact: true })).toBeVisible();
  expect(requests).toHaveLength(2);
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.getByPlaceholder('输入搜索关键字').fill('slow-query');
  await page.locator('.ant-select').filter({ hasText: '告警等级' }).click();
  await page.getByText('P0级告警', { exact: true }).click();
  await expect(page.getByText('第 1 页通知', { exact: true })).toBeVisible();
  await page.clock.runFor(1000);
  await page.waitForLoadState('networkidle');
  expect(requests).toHaveLength(3);
  expect(requests.at(-1).get('severity')).toBe('P0');
  expect(requests.at(-1).get('query')).toBe('slow-query');
  expect(requests.at(-1).get('index')).toBe('1');
  reject = true;
  await page.getByRole('button', { name: /刷\s*新/, exact: true }).click();
  await expect(page.getByText('加载通知记录失败，请稍后重试', { exact: true })).toBeVisible();
  await expect(page.getByText('通知记录加载失败，请点击刷新重试', { exact: true })).toBeVisible();
  await expect(page.getByText('暂无通知记录', { exact: true })).toHaveCount(0);
  reject = false;
  await page.getByRole('button', { name: /刷\s*新/, exact: true }).click();
  await expect.poll(() => requests.length).toBe(5);
  await expect(page.getByText('第 1 页通知', { exact: true })).toBeVisible();
});

test('notification object drawer makes one scoped request and ignores canceled late rows', async ({ page }) => {
  await mockAPI(page);
  await page.route('**/noticeList*', route => route.fulfill({ json: { code: 200, data: [{ uuid: 'notice-one', name: '通知对象一', dutyId: '' }] } }));
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const requests = [];
  await page.route('**/noticeRecordList*', async route => {
    const params = new URL(route.request().url()).searchParams; requests.push(params);
    if (!params.has('query')) await pending;
    await route.fulfill({ json: { code: 200, data: { index: 1, total: 1, list: [{ id: 'row', ruleName: params.has('query') ? '新通知结果' : '旧通知不应显示', status: 0 }] } } }).catch(() => {});
  });
  try {
    await page.goto('/noticeObjects');
    await page.getByRole('button', { name: '通知对象一', exact: true }).click();
    await expect.poll(() => requests.length).toBe(1);
    const drawer = page.getByRole('dialog');
    await drawer.getByPlaceholder('输入搜索关键字').fill('latest');
    await drawer.getByPlaceholder('输入搜索关键字').press('Enter');
    await expect(drawer.getByText('新通知结果', { exact: true })).toBeVisible();
    release();
    await page.waitForLoadState('networkidle');
    expect(requests).toHaveLength(2);
    expect(requests.every(params => params.get('uuid') === 'notice-one')).toBe(true);
    await expect(page.getByText('旧通知不应显示', { exact: true })).toHaveCount(0);
    await expect(page.locator('.ant-message-notice-error')).toHaveCount(0);
  } finally { release(); await page.unrouteAll({ behavior: 'wait' }); }
});

test('IME composition and abandoned searches do not issue intermediate alert reads', async ({ page }) => {
  const requests = await mockAPI(page);
  const reads = () => requests.filter(url => /\/event\/(curEvent|hisEvent)$/.test(url.pathname));
  await page.clock.install();
  await page.goto('/alerts');
  await expect.poll(() => reads().length).toBe(1);
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const input = page.getByRole('textbox', { name: '搜索告警' });
  await input.dispatchEvent('compositionstart', { data: '' });
  await input.fill('sheng');
  await page.clock.runFor(1000);
  await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229, isComposing: true });
  expect(reads()).toHaveLength(1);
  await input.fill('生产');
  await input.dispatchEvent('compositionend', { data: '生产' });
  await expect.poll(() => reads().length).toBe(2);
  expect(reads().at(-1).searchParams.get('query')).toBe('生产');
  await input.fill('pending');
  await page.getByRole('button', { name: '历史事件', exact: true }).click();
  await expect.poll(() => reads().length).toBe(3);
  expect(reads().at(-1).pathname).toMatch(/hisEvent$/);
  expect(reads().at(-1).searchParams.get('query')).toBe('pending');
  await page.clock.runFor(1000);
  expect(reads()).toHaveLength(3);
  await input.fill('must-not-run');
  await page.getByRole('button', { name: '在 Copilot 中分析', exact: true }).click();
  await expect(page).toHaveURL(/\/copilot/);
  await page.clock.runFor(1000);
  expect(reads()).toHaveLength(3);
});

for (const history of [false, true]) {
  test(`typing batches ${history ? 'history' : 'current'} searches but enter and clear stay immediate`, async ({ page }) => {
    const requests = await mockAPI(page);
    const suffix = history ? '/hisEvent' : '/curEvent';
    const reads = () => requests.filter(url => url.pathname.endsWith(suffix));
    await page.clock.install();
    await page.goto(history ? '/alerts?queue=history' : '/alerts');
    await expect.poll(() => reads().length).toBe(1);
    await expect(page.getByText(history ? '当前筛选条件下没有历史事件' : '当前队列没有需要展示的告警')).toBeVisible();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    const input = page.getByRole('textbox', { name: '搜索告警' });
    await input.pressSequentially('payment');
    expect(reads().length).toBe(1);
    await page.clock.runFor(299);
    expect(reads().length).toBe(1);
    await page.clock.runFor(1);
    await expect.poll(() => reads().length).toBe(2);
    expect(reads().at(-1).searchParams.get('query')).toBe('payment');
    await input.fill('database');
    await input.press('Enter');
    await expect.poll(() => reads().length).toBe(3);
    expect(reads().at(-1).searchParams.get('query')).toBe('database');
    await page.clock.runFor(1000);
    expect(reads().length).toBe(3);
    await page.locator('.alert-stream-page .ant-input-clear-icon').click();
    await expect.poll(() => reads().length).toBe(4);
    expect(reads().at(-1).searchParams.has('query')).toBe(false);
    await page.clock.runFor(1000);
    expect(reads().length).toBe(4);
  });

  test(`new ${history ? 'history' : 'current'} result survives a canceled late response and refresh`, async ({ page }) => {
    await mockAPI(page);
    let release;
    let started = false;
    let count = 0;
    const pending = new Promise(resolve => { release = resolve; });
    await page.route(`**/event/${history ? 'hisEvent' : 'curEvent'}*`, async route => {
      const old = !new URL(route.request().url()).searchParams.has('query');
      count++;
      if (old) { started = true; await pending; }
      await route.fulfill({ json: { code: 200, data: { total: 1, list: [{ fingerprint: old ? 'old' : 'new', ruleName: old ? '旧结果不应出现' : '最新查询结果', faultCenterId: 'fc', status: 'alerting', severity: 'P0' }] } } }).catch(() => {});
    });
    try {
      await page.goto(history ? '/alerts?queue=history' : '/alerts');
      await expect.poll(() => started).toBe(true);
      await page.getByRole('textbox', { name: '搜索告警' }).fill('payment');
      await expect(page.locator('.alert-event-row')).toContainText(['最新查询结果']);
      release();
      await page.waitForLoadState('networkidle');
      await expect(page.getByText('旧结果不应出现', { exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: /刷\s*新/, exact: true }).click();
      await expect.poll(() => count).toBe(3);
      await expect(page.locator('.alert-event-row')).toContainText(['最新查询结果']);
      await expect(page.locator('.ant-message-notice-error')).toHaveCount(0);
    } finally { release(); await page.unrouteAll({ behavior: 'wait' }); }
  });
}

for (const width of [1440, 390]) {
  test(`alert reads abort on filtering, queue switch and unmount at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockAPI(page);
    await page.addInitScript(() => {
      window.__alertAborts = [];
      const open = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (method, url, ...args) {
        this.addEventListener('abort', () => window.__alertAborts.push(String(url)), { once: true });
        return open.call(this, method, url, ...args);
      };
    });
    const pending = [];
    await page.route('**/event/*Event*', async route => {
      // Keep every list response pending so abandoning a request is observable.
      await new Promise(resolve => pending.push(resolve));
      await route.fulfill({ json: { code: 200, data: { list: [], total: 0 } } }).catch(() => {});
    });
    try {
      await page.goto('/alerts');
      await expect.poll(() => pending.length).toBe(1);
      await page.getByRole('textbox', { name: '搜索告警' }).fill('payment');
      await expect.poll(() => pending.length).toBe(2);
      await expect.poll(() => page.evaluate(() => window.__alertAborts.length)).toBe(1);
      await page.getByRole('button', { name: '历史事件', exact: true }).click();
      await expect.poll(() => pending.length).toBe(3);
      await expect.poll(() => page.evaluate(() => window.__alertAborts.length)).toBe(2);
      await page.getByRole('textbox', { name: '搜索告警' }).fill('latency');
      await expect.poll(() => pending.length).toBe(4);
      await expect.poll(() => page.evaluate(() => window.__alertAborts.length)).toBe(3);
      await expect(page.getByText('加载告警失败，请重试。')).toHaveCount(0);
      await expect(page.getByText('加载历史事件失败，请重试。')).toHaveCount(0);
      await expect(page.locator('.ant-message-notice-error')).toHaveCount(0);
      await page.getByRole('button', { name: '在 Copilot 中分析', exact: true }).click();
      await expect(page).toHaveURL(/\/copilot/);
      await expect.poll(() => page.evaluate(() => window.__alertAborts.length)).toBe(4);
      const aborted = await page.evaluate(() => window.__alertAborts);
      expect(aborted.filter(url => url.includes('/curEvent'))).toHaveLength(2);
      expect(aborted.filter(url => url.includes('/hisEvent'))).toHaveLength(2);
    } finally {
      pending.forEach(resolve => resolve());
      await page.unrouteAll({ behavior: 'wait' });
    }
  });

  test(`Copilot history pages, retries and keeps context at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockAPI(page);
    await page.route('**/agent/capabilities', route => route.fulfill({ json: { code: 200, data: { enabled: true, allowedTools: [], canWrite: false, scope: {} } } }));
    await page.route('**/agent/sessionList*', route => route.fulfill({ json: { code: 200, data: [{ id: 'history', title: '长会话验收' }] } }));
    const requests = [];
    let fail = true;
    await page.route('**/agent/sessionGet*', route => {
      const query = new URL(route.request().url()).searchParams;
      requests.push(query);
      if (query.has('before') && fail) { fail = false; return route.fulfill({ status: 503 }); }
      const old = query.has('before');
      return route.fulfill({ json: { code: 200, data: {
        session: { id: 'history' }, hasMore: !old, nextCursor: old ? '' : 'opaque+/cursor=',
        messages: Array.from({ length: old ? 5 : 50 }, (_, index) => ({
          id: `${old ? 'old' : 'new'}-${index}`, role: index % 2 ? 'assistant' : 'user',
          content: old ? `早期记录 ${index}` : `当前记录 ${index}`, evidence: '[]',
        })),
      } } });
    });
    await page.goto('/copilot');
    await page.getByRole('combobox', { name: '历史会话' }).click();
    await page.locator('.ant-select-item-option').filter({ hasText: '长会话验收' }).click();
    await expect(page.locator('.copilot-turn')).toHaveCount(50);
    expect(requests[0].get('limit')).toBe('50');
    await expect(page.getByText('早期记录 0', { exact: true })).toHaveCount(0);
    const older = page.getByRole('button', { name: '加载更早消息' });
    await older.click();
    await expect(page.getByText(/更早消息加载失败/)).toBeVisible();
    await expect(page.locator('.copilot-turn')).toHaveCount(50);
    const anchor = page.locator('.copilot-turn').first();
    const before = await anchor.boundingBox();
    await page.locator('.copilot-history-control').getByRole('button', { name: /重\s*试/ }).click();
    await expect(page.locator('.copilot-turn')).toHaveCount(55);
    expect(requests.at(-1).get('before')).toBe('opaque+/cursor=');
    await expect(older).toHaveCount(0);
    const after = await page.locator('.copilot-turn').filter({ hasText: '当前记录 0' }).boundingBox();
    expect(Math.abs(after.y - before.y)).toBeLessThan(5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.copilot-turn').first().scrollIntoViewIfNeeded();
    await expect(page.getByText('早期记录 0', { exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/copilot-history-${width}.png` });
  });
}

test('late history page cannot repopulate a new conversation', async ({ page }) => {
  await mockAPI(page);
  await page.route('**/agent/capabilities', route => route.fulfill({ json: { code: 200, data: { enabled: true, allowedTools: [], canWrite: false, scope: {} } } }));
  await page.route('**/agent/sessionList*', route => route.fulfill({ json: { code: 200, data: [{ id: 'history', title: '旧会话' }] } }));
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let requested = false;
  await page.route('**/agent/sessionGet*', async route => {
    const old = new URL(route.request().url()).searchParams.has('before');
    if (old) { requested = true; await pending; }
    await route.fulfill({ json: { code: 200, data: { session: { id: 'history' }, hasMore: !old, nextCursor: old ? '' : 'cursor', messages: [{ id: old ? 'old' : 'new', role: 'user', content: old ? '不应复活' : '现有历史' }] } } }).catch(() => {});
  });
  await page.goto('/copilot');
  await page.getByRole('combobox', { name: '历史会话' }).click();
  await page.locator('.ant-select-item-option').filter({ hasText: '旧会话' }).click();
  await page.getByRole('button', { name: '加载更早消息' }).click();
  await expect.poll(() => requested).toBe(true);
  await page.getByRole('button', { name: '新对话', exact: true }).click();
  release();
  await expect(page.locator('.copilot-turn')).toHaveCount(0);
  await expect(page.getByText('描述你要排查的问题，或从告警详情带入事件。')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.copilot-turn')).toHaveCount(0);
});

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

test('scoped editor languages retain JSON validation, formatting, find and YAML highlighting', async ({ page }) => {
  await mockAPI(page);
  const workers = [];
  const errors = [];
  page.on('worker', worker => workers.push(worker.url()));
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/ruleGroup/g/rule/list');
  await page.getByRole('button', { name: /导\s*入/, exact: true }).click();
  const editor = page.locator('.monaco-editor').first();
  const input = editor.locator('textarea.inputarea');
  await expect(editor).toBeVisible();
  await page.getByText('Prometheus Rule YAML', { exact: true }).click();
  await expect(editor.locator('.view-lines')).toContainText('Exporter');
  await expect.poll(() => editor.locator('.view-lines span').evaluateAll(nodes => new Set(nodes.map(node => node.className).filter(name => /^mtk\d+$/.test(name))).size)).toBeGreaterThan(1);
  await page.getByText('WatchAlert JSON', { exact: true }).click();
  await input.press('ControlOrMeta+A');
  await input.evaluate((element, text) => {
    const data = new DataTransfer(); data.setData('text/plain', text);
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, '{"bad":}');
  await expect(editor.locator('.squiggly-error').first()).toBeVisible();
  await input.press('ControlOrMeta+A');
  await input.evaluate((element, text) => {
    const data = new DataTransfer(); data.setData('text/plain', text);
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, '{"environment":"prod","enabled":true}');
  await expect(editor.locator('.squiggly-error')).toHaveCount(0);
  await input.press('Shift+Alt+F');
  await expect.poll(() => editor.locator('.view-line').count()).toBeGreaterThan(2);
  await input.press('ControlOrMeta+f');
  await expect(editor.locator('.find-widget')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(editor.locator('.find-widget')).not.toHaveClass(/visible/);
  expect(workers.some(url => /json\.worker/.test(url))).toBe(true);
  expect(workers.every(url => url.startsWith('http://127.0.0.1:4187/'))).toBe(true);
  expect(errors).toEqual([]);
});

test('rapid language switch handles pending editor cancellation', async ({ page }) => {
  await mockAPI(page);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/ruleGroup/g/rule/list');
  await page.getByRole('button', { name: /导\s*入/, exact: true }).click();
  const input = page.locator('.monaco-editor textarea.inputarea').first();
  await expect(input).toBeAttached();
  // Exercise real rapid focus/model disposal repeatedly. Unit tests separately
  // cover a deterministic cancellation before the scheduled task can execute.
  for (let round = 0; round < 3; round++) {
    await page.getByText('WatchAlert JSON', { exact: true }).click();
    await input.press('ControlOrMeta+A');
    await page.keyboard.insertText('{"environment":"prod"}');
    await input.press('ControlOrMeta+f');
    await input.press('Escape');
    await page.getByText('Prometheus Rule YAML', { exact: true }).click();
    await expect(page.locator('.monaco-editor .view-lines').first()).toContainText('Exporter');
  }
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('.wa-sider').getByRole('button', { name: '告警', exact: true }).click();
  await expect(page).toHaveURL(/\/alerts$/);
  await expect(page.locator('.monaco-editor')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('local editor core retains JSON version diff', async ({ page }) => {
  await mockAPI(page);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/prometheus/*', route => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1);
    const replies = {
      targetGroupList: { list: [{ id: 1, name: '测试组' }], total: 1 },
      targetList: { list: [{ id: 'target', groupId: 1, targets: ['new:9090'], labels: {} }], total: 1, index: 1, size: 10 },
      targetGet: { id: 'target', targets: ['new:9090'], labels: { env: 'prod' } },
      targetVersionList: { list: [{ id: 'version', version: 1 }], total: 1 },
      targetVersionGet: { targets: ['old:9090'], labels: { env: 'test' } },
    };
    return route.fulfill({ json: { code: 200, data: replies[endpoint] || [] } });
  });
  await page.goto('/prometheusTargets/1/list');
  await page.getByRole('button', { name: '更多操作：target' }).click();
  await page.getByText('历史版本', { exact: true }).click();
  const diff = page.locator('.monaco-diff-editor');
  await expect(diff).toBeVisible();
  await expect(diff.locator('.view-lines').first()).toContainText('old:9090');
  await expect(diff.locator('.view-lines').last()).toContainText('new:9090');
  await expect(diff.locator('.char-insert, .line-insert, .char-delete, .line-delete').first()).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(diff).toBeHidden();
  await page.getByRole('button', { name: '更多操作：target' }).click();
  await page.getByText('历史版本', { exact: true }).click();
  await expect(diff.locator('.view-lines').first()).toContainText('old:9090');
  await expect(diff.locator('.view-lines').last()).toContainText('new:9090');
  await diff.locator('textarea.inputarea').last().press('ControlOrMeta+f');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('.wa-sider').getByRole('button', { name: '告警', exact: true }).click();
  await expect(page).toHaveURL(/\/alerts$/);
  await expect(diff).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('SQL editor completion providers are released across repeated mounts', async ({ page }) => {
  await mockAPI(page);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/ruleGroup/g/rule/add');
  for (let round = 0; round < 3; round++) {
    await page.getByText('ClickHouse', { exact: true }).click();
    const editor = page.locator('.monaco-editor').first();
    await expect(editor).toBeVisible();
    const input = editor.locator('textarea');
    await input.press('ControlOrMeta+A');
    await input.pressSequentially('SEL');
    await input.press('ControlOrMeta+Space');
    await expect(editor.locator('.suggest-widget.visible .label-name').filter({ hasText: /^SELECT$/ })).toHaveCount(1);
    await input.press('Escape');
    await page.getByText('Prometheus', { exact: true }).click();
    await expect(page.locator('.monaco-editor')).toHaveCount(0);
  }
  await page.getByText('ClickHouse', { exact: true }).click();
  await page.locator('.monaco-editor textarea.inputarea').first().pressSequentially('SEL');
  await page.locator('.wa-sider').getByRole('button', { name: '告警', exact: true }).click();
  await expect(page).toHaveURL(/\/alerts$/);
  await expect(page.locator('.monaco-editor')).toHaveCount(0);
  await page.waitForTimeout(150);
  expect(errors).toEqual([]);
});

for (const outcome of ['done', 'error']) {
  test(`Copilot burst updates preserve ${outcome} and readable code blocks`, async ({ page }) => {
    await mockAPI(page);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/agent/capabilities', route => route.fulfill({ json: { code: 200, data: { enabled: true, allowedTools: [], canWrite: false, scope: {} } } }));
    await page.route('**/agent/sessionList*', route => route.fulfill({ json: { code: 200, data: [] } }));
    await page.route('**/agent/sessionCreate', route => route.fulfill({ json: { code: 200, data: { id: 'perf' } } }));
    const final = '最终分析结果\n```yaml\nenv: production\n```\n```unsupportedlang\nopaque-value\n```';
    await page.route('**/agent/sessionMessageStream', route => {
      const deltas = Array.from({ length: 1000 }, () => 'event: delta\ndata: {"delta":"片"}\n\n').join('');
      const terminal = outcome === 'done' ? { content: final, evidence: '[]' } : { message: '查询超时，请缩小范围' };
      return route.fulfill({ contentType: 'text/event-stream', body: deltas + `event: ${outcome}\ndata: ${JSON.stringify(terminal)}\n\n` });
    });
    await page.goto('/copilot');
    await page.getByRole('textbox', { name: '输入问题' }).fill('分析当前告警');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    if (outcome === 'done') {
      await expect(page.getByText('最终分析结果', { exact: true })).toBeVisible();
      await expect(page.locator('.markdown-body')).toContainText('env: production');
      await expect(page.locator('.markdown-body')).toContainText('opaque-value');
      // Let any stale coalescing timer fire; it must not overwrite the final reply.
      await page.waitForTimeout(120);
      await expect(page.getByText('最终分析结果', { exact: true })).toBeVisible();
      await expect(page.locator('.markdown-body')).not.toContainText('片');
    } else {
      await expect(page.getByText('查询超时，请缩小范围', { exact: true })).toBeVisible();
      await expect(page.locator('.markdown-body')).toContainText('片'.repeat(1000));
    }
    expect(errors).toEqual([]);
  });
}
