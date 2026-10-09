import { test, expect } from '@playwright/test';

// Trace DOM snapshots scale with page size and would contaminate these numbers.
test.use({ trace: 'off', screenshot: 'off' });

// Opt-in, synthetic, local-only measurements. No timing threshold in ordinary CI.
test('Copilot accumulated history capacity baseline', async ({ page }, testInfo) => {
  test.skip(process.env.WATCHALERT_CAPACITY_TEST !== '1', 'Opt-in synthetic browser capacity measurement');
  test.setTimeout(180000);
  await page.addInitScript(() => {
    localStorage.setItem('Authorization', 'fixture-token');
    localStorage.setItem('TenantID', 't');
  });
  const body = '### 排查记录\n生产环境 payment 服务延迟升高，当前证据尚不足以确定根因。\n\n- 检查请求速率与错误率\n- 对齐变更时间与告警时间\n- 核实依赖服务响应\n\n```yaml\nenvironment: production\nservice: payment\ncluster: example\n```\n\n保留原始证据，不把相关性当作因果。';
  let reads = 0;
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let data = [];
    if (path.endsWith('/userInfo')) data = { userid: 'u', username: 'SRE', role: 'admin' };
    if (path.endsWith('/getTenantList')) data = [{ id: 't', name: '测试租户' }];
    if (path.endsWith('/getTenant')) data = { id: 't', name: '测试租户' };
    if (path.endsWith('/capabilities')) data = { enabled: true, canWrite: false, scope: {} };
    if (path.endsWith('/sessionList')) data = [{ id: 'history', title: '容量测量' }];
    if (path.endsWith('/sessionGet')) {
      reads++;
      const offset = Number(url.searchParams.get('before') || 0);
      data = { session: { id: 'history' }, hasMore: offset + 50 < 1000, nextCursor: String(offset + 50), messages: Array.from({ length: 50 }, (_, index) => ({
        id: `message-${1000 - offset - 50 + index}`, role: index % 2 ? 'assistant' : 'user',
        content: index % 2 ? body : '请分析生产环境 payment 服务，并说明查询依据。',
        evidence: index % 2 ? [{ toolName: 'query_prometheus', status: 'completed', summary: '合成数据，不是生产事件', source: { datasourceId: 'mock-prometheus' }, query: { promql: 'up' } }] : [],
      })) };
    }
    return route.fulfill({ json: { code: 200, data } });
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item => [item.name, item.value]));
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.goto('/copilot');
  await page.getByRole('combobox', { name: '历史会话' }).click();
  const results = [];
  let previous = await metrics();
  await page.getByText('容量测量', { exact: true }).click();
  for (let count = 50; count <= 1000; count += 50) {
    await expect(page.locator('.copilot-turn')).toHaveCount(count);
    await settle();
    const loaded = await metrics();
    if ([50, 250, 1000].includes(count)) {
      await cdp.send('HeapProfiler.collectGarbage');
      const retained = await metrics();
      const nodes = await cdp.send('Memory.getDOMCounters');
      const input = page.getByRole('textbox', { name: '输入问题' });
      await input.fill('');
      await input.focus();
      const beforeInput = await metrics();
      // Resolve/focus before measuring: role-selector traversal over a large DOM
      // is test-driver overhead, not the user's keystroke handling cost.
      await page.keyboard.type('payment');
      await settle();
      const afterInput = await metrics();
      results.push({ messages: count, reads, retainedHeapMiB: +(retained.JSHeapUsedSize / 1024 / 1024).toFixed(2), nodes: nodes.nodes,
        lastPageTaskMs: +((loaded.TaskDuration - previous.TaskDuration) * 1000).toFixed(2),
        inputTaskMs: +((afterInput.TaskDuration - beforeInput.TaskDuration) * 1000).toFixed(2),
        inputLayoutMs: +((afterInput.LayoutDuration - beforeInput.LayoutDuration) * 1000).toFixed(2) });
    }
    if (count < 1000) {
      await page.getByRole('button', { name: '加载更早消息', exact: true }).focus();
      previous = await metrics();
      await page.keyboard.press('Enter');
    }
  }
  console.log('COPILOT_CAPACITY', JSON.stringify(results));
  await testInfo.attach('copilot-capacity.json', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
  expect(reads).toBe(20);
  await expect(page.locator('.copilot-turn')).toHaveCount(1000);
});

test('Copilot single large Markdown message capacity baseline', async ({ page }, testInfo) => {
  test.skip(process.env.WATCHALERT_CAPACITY_TEST !== '1', 'Opt-in synthetic browser capacity measurement');
  test.setTimeout(120000);
  await page.addInitScript(() => { localStorage.setItem('Authorization', 'fixture-token'); localStorage.setItem('TenantID', 't'); });
  const block = '### Evidence\nCheck the labels and query window before drawing a conclusion.\n\n- Review errors\n- Check dependencies\n\n```yaml\nenvironment: production\nservice: payment\ncluster: example\n```\n\n';
  let content = '';
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    let data = [];
    if (path.endsWith('/userInfo')) data = { userid: 'u', username: 'SRE', role: 'admin' };
    if (path.endsWith('/getTenantList')) data = [{ id: 't', name: '测试租户' }];
    if (path.endsWith('/getTenant')) data = { id: 't', name: '测试租户' };
    if (path.endsWith('/capabilities')) data = { enabled: true, canWrite: false, scope: {} };
    if (path.endsWith('/sessionList')) data = [{ id: 'large', title: '大型消息' }];
    if (path.endsWith('/sessionGet')) data = { session: { id: 'large' }, messages: [{ id: 'one', role: 'assistant', content, evidence: [] }] };
    return route.fulfill({ json: { code: 200, data } });
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item => [item.name, item.value]));
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const results = [];
  for (const size of [8, 32, 64]) {
    content = block.repeat(Math.floor(size * 1024 / block.length));
    await page.goto('/copilot');
    await page.getByRole('combobox', { name: '历史会话' }).click();
    const option = page.getByText('大型消息', { exact: true });
    // Resolve target coordinates before measuring the user action.
    const box = await option.boundingBox();
    const before = await metrics();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('.copilot-turn')).toHaveCount(1);
    await expect(page.locator('.copilot-turn code')).toHaveCount(Math.floor(size * 1024 / block.length));
    await settle();
    const after = await metrics();
    await cdp.send('HeapProfiler.collectGarbage');
    const retained = await metrics();
    const input = page.getByRole('textbox', { name: '输入问题' });
    await input.focus();
    const beforeInput = await metrics();
    await page.keyboard.type('payment'); await settle();
    const afterInput = await metrics();
    results.push({ contentBytes: Buffer.byteLength(content), nodes: (await cdp.send('Memory.getDOMCounters')).nodes,
      retainedHeapMiB: +(retained.JSHeapUsedSize / 1024 / 1024).toFixed(2),
      restoreTaskMs: +((after.TaskDuration - before.TaskDuration) * 1000).toFixed(2),
      inputTaskMs: +((afterInput.TaskDuration - beforeInput.TaskDuration) * 1000).toFixed(2) });
  }
  console.log('COPILOT_LARGE_MESSAGE', JSON.stringify(results));
  await testInfo.attach('copilot-large-message.json', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
});
