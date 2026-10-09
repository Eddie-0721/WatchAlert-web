import { test, expect } from '@playwright/test';

async function setup(page, canWrite = false) {
  await page.addInitScript(() => {
    localStorage.setItem('Authorization', 'fixture-token');
    localStorage.setItem('TenantID', 't');
    window.__evidenceSerializations = [];
    const stringify = JSON.stringify;
    JSON.stringify = function (value, ...args) {
      if (value?.performanceEvidenceId) window.__evidenceSerializations.push(value.performanceEvidenceId);
      return stringify(value, ...args);
    };
  });
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    let data = [];
    if (path.endsWith('/userInfo')) data = { userid: 'u', username: 'SRE', role: 'admin' };
    if (path.endsWith('/getTenantList')) data = [{ id: 't', name: '测试租户' }];
    if (path.endsWith('/getTenant')) data = { id: 't', name: '测试租户' };
    if (path.endsWith('/capabilities')) data = { enabled: true, canWrite, scope: {} };
    if (path.endsWith('/sessionList')) data = [{ id: 'history', title: '性能会话' }];
    return route.fulfill({ json: { code: 200, data } });
  });
  await page.route('**/agent/sessionGet*', route => {
    const old = new URL(route.request().url()).searchParams.has('before');
    return route.fulfill({ json: { code: 200, data: { session: { id: 'history' }, hasMore: !old, nextCursor: old ? '' : 'older', messages: Array.from({ length: 50 }, (_, index) => ({
      id: `${old ? 'older' : 'history'}-${index}`, role: 'assistant', content: `${old ? '早期' : '当前'}消息 ${index}`,
      evidence: JSON.stringify([{ toolName: 'query_prometheus', status: 'completed', summary: '仅为测试证据', source: { performanceEvidenceId: `${old ? 'older' : 'history'}-${index}`, environment: 'production' }, query: { promql: 'up' } }]),
    })) } } });
  });
}

async function restore(page) {
  await page.goto('/copilot');
  await page.getByRole('combobox', { name: '历史会话' }).click();
  await page.getByText('性能会话', { exact: true }).click();
  await expect(page.locator('.copilot-turn')).toHaveCount(50);
}

async function controlledStream(page) {
  await page.addInitScript(() => {
    const original = window.fetch;
    window.fetch = (url, options) => {
      if (!String(url).endsWith('/agent/sessionMessageStream')) return original(url, options);
      const stream = new ReadableStream({ start(controller) {
        window.__pushReply = (type, data) => controller.enqueue(new TextEncoder().encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));
        window.__endReply = () => controller.close();
        options.signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')), { once: true });
      } });
      return Promise.resolve(new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }));
    };
  });
}

test('Copilot streaming retains completed Markdown nodes while updating changed code', async ({ page }) => {
  await setup(page); await controlledStream(page); await restore(page);
  await page.getByRole('textbox', { name: '输入问题' }).fill('分析并给出配置');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__pushReply))).toBe(true);
  let content = '# 排查依据\n\n已经核实的数据。\n\n```yaml\nenvironment: production';
  await page.evaluate(content => window.__pushReply('delta', { delta: content }), content);
  const reply = page.locator('.copilot-turn').last();
  await expect(reply.locator('code')).toContainText('environment: production');
  const addition = '\ncluster: primary\n```'; content += addition;
  await page.evaluate(delta => window.__pushReply('delta', { delta }), addition);
  await expect(reply.locator('code')).toContainText('cluster: primary');
  await reply.evaluate(node => { window.__completedMarkdown = ['h1', 'p', 'code'].map(selector => node.querySelector(selector)); });
  for (let index = 0; index < 3; index++) {
    const delta = `\n\n后续解释 ${index}`; content += delta;
    await page.evaluate(delta => window.__pushReply('delta', { delta }), delta);
    await expect(reply).toContainText(`后续解释 ${index}`);
    expect(await page.evaluate(() => window.__completedMarkdown.map(node => node?.isConnected))).toEqual([true, true, true]);
  }
  await page.evaluate(content => { window.__pushReply('done', { content, evidence: '[]' }); window.__endReply(); }, content);
  await expect(page.getByRole('button', { name: '发送', exact: true })).toBeVisible();
  await expect(reply.locator('code')).toContainText('cluster: primary');
  expect(await page.evaluate(() => window.__completedMarkdown.map(node => node?.isConnected))).toEqual([true, true, true]);
});

test('Copilot collapsed evidence is not serialized before opening', async ({ page }) => {
  await setup(page); await restore(page);
  expect(await page.evaluate(() => window.__evidenceSerializations.length)).toBe(0);
  await page.locator('.copilot-message-evidence .ant-collapse-header').first().click();
  await expect(page.locator('.copilot-tool-evidence').first()).toContainText('production');
  expect(await page.evaluate(() => window.__evidenceSerializations)).toEqual(['history-0']);
});

for (const width of [1440, 390]) test(`Copilot typing and streaming do not reserialize unchanged history at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await setup(page);
  await controlledStream(page);
  await restore(page);
  await page.locator('.copilot-message-evidence .ant-collapse-header').first().click();
  await expect(page.locator('.copilot-tool-evidence').first()).toContainText('production');
  await page.evaluate(() => { window.__evidenceSerializations = []; });
  await page.getByRole('textbox', { name: '输入问题' }).pressSequentially('payment');
  expect(await page.evaluate(() => window.__evidenceSerializations.length)).toBe(0);
  await page.getByRole('button', { name: '加载更早消息', exact: true }).click();
  await expect(page.locator('.copilot-turn')).toHaveCount(100);
  expect(await page.evaluate(() => window.__evidenceSerializations.length)).toBe(0);
  await expect(page.locator('.copilot-message-evidence .ant-collapse-header[aria-expanded="true"]')).toHaveCount(1);
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__pushReply))).toBe(true);
  for (let index = 0; index < 3; index++) {
    await page.evaluate(index => { window.__pushReply('status', { message: `查询阶段 ${index}` }); window.__pushReply('delta', { delta: `新片段${index}` }); }, index);
    await expect(page.locator('.copilot-turn').last()).toContainText(`新片段${index}`);
  }
  expect(await page.evaluate(() => window.__evidenceSerializations.length)).toBe(0);
  await page.evaluate(() => { window.__pushReply('done', { content: '本轮最终结果', evidence: '[]' }); window.__endReply(); });
  await expect(page.locator('.copilot-turn').last()).toContainText('本轮最终结果');
  await expect(page.getByRole('button', { name: '发送', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__evidenceSerializations.length)).toBe(0);
});

for (const canWrite of [false, true]) test(`Copilot memoized evidence preserves confirmation and permission controls: ${canWrite}`, async ({ page }) => {
  await setup(page, canWrite);
  const source = id => ({ performanceEvidenceId: id, environment: 'production' });
  const action = { toolName: 'silences.create', actionId: 'action-one', payloadHash: 'hash-one', status: 'pending_confirmation', summary: '等待用户确认', riskLevel: 'high', preview: { action: '创建静默', after: { name: '测试静默', faultCenterId: 'fc', labels: [{ key: 'service', operator: '==', value: 'payment' }] } } };
  await page.route('**/agent/sessionGet*', route => route.fulfill({ json: { code: 200, data: { session: { id: 'history' }, messages: [
    { id: 'one', role: 'assistant', content: '操作证据一', evidence: [{ ...action, source: source('one') }] },
    { id: 'two', role: 'assistant', content: '操作证据二', evidence: [{ ...action, source: source('two') }] },
    { id: 'other', role: 'assistant', content: '独立查询证据', evidence: [{ toolName: 'query_prometheus', status: 'completed', summary: '独立结果', source: source('other') }] },
  ] } } }));
  const writes = [];
  await page.route('**/agent/actionConfirm', route => {
    writes.push(route.request().postDataJSON());
    return route.fulfill({ json: { code: 200, data: writes.length === 1 ? { status: 'executing', result: '结果尚未确认' } : { status: 'executed', result: '真实系统已执行' } } });
  });
  await page.goto('/copilot');
  await page.getByRole('combobox', { name: '历史会话' }).click();
  await page.getByText('性能会话', { exact: true }).click();
  await expect(page.locator('.copilot-turn')).toHaveCount(3);
  for (const header of await page.locator('.copilot-message-evidence .ant-collapse-header').all()) await header.click();
  const confirm = page.getByRole('button', { name: '查看并确认', exact: true });
  await expect(confirm).toHaveCount(2);
  expect(writes).toHaveLength(0);
  if (!canWrite) {
    await expect(confirm.first()).toBeDisabled(); await expect(confirm.last()).toBeDisabled();
    await page.getByRole('textbox', { name: '输入问题' }).fill('仅查询');
    await expect(confirm.first()).toBeDisabled();
    expect(writes).toHaveLength(0);
    return;
  }
  await page.evaluate(() => { window.__evidenceSerializations = []; });
  await confirm.first().click();
  const modal = page.getByRole('dialog');
  await expect(modal).toContainText('service==payment');
  expect(writes).toHaveLength(0);
  await modal.getByRole('button', { name: '确认执行', exact: true }).click();
  await expect(page.getByText('结果尚未确认', { exact: true })).toBeVisible();
  await expect(confirm).toHaveCount(2);
  await expect(page.getByText('已执行', { exact: true })).toHaveCount(0);
  await modal.getByRole('button', { name: '确认执行', exact: true }).click();
  await expect(page.getByText('已执行', { exact: true })).toHaveCount(2);
  await expect(confirm).toHaveCount(0);
  await expect(page.getByText('独立结果', { exact: true })).toBeVisible();
  await expect(page.locator('.copilot-message-evidence .ant-collapse-header[aria-expanded="true"]')).toHaveCount(3);
  expect(writes).toEqual([{ actionId: 'action-one', payloadHash: 'hash-one' }, { actionId: 'action-one', payloadHash: 'hash-one' }]);
  expect(await page.evaluate(() => window.__evidenceSerializations.includes('other'))).toBe(false);
  await page.getByRole('button', { name: '查看静默规则', exact: true }).first().click();
  await expect(page).toHaveURL(/\/silenceRules$/);
});

test('Copilot reused action controls disable during a run and recover after stopping', async ({ page }) => {
  await setup(page, true);
  await page.route('**/agent/sessionGet*', route => route.fulfill({ json: { code: 200, data: { session: { id: 'history' }, messages: [{
    id: 'one', role: 'assistant', content: '有待确认操作', evidence: [{ toolName: 'silences.create', status: 'pending_confirmation', actionId: 'a', payloadHash: 'h' }],
  }] } } }));
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let started = false;
  let writes = 0;
  await page.route('**/agent/actionConfirm', route => { writes++; return route.fulfill({ json: { code: 200, data: { status: 'executed' } } }); });
  await page.route('**/agent/sessionMessageStream', async route => {
    started = true; await pending;
    await route.fulfill({ contentType: 'text/event-stream', body: 'event: done\ndata: {"content":"finished"}\n\n' }).catch(() => {});
  });
  try {
    await page.goto('/copilot');
    await page.getByRole('combobox', { name: '历史会话' }).click();
    await page.getByText('性能会话', { exact: true }).click();
    await page.locator('.copilot-message-evidence .ant-collapse-header').click();
    const confirm = page.getByRole('button', { name: '查看并确认', exact: true });
    await expect(confirm).toBeEnabled();
    await page.getByRole('textbox', { name: '输入问题' }).fill('继续分析');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect.poll(() => started).toBe(true);
    await expect(confirm).toBeDisabled();
    await page.getByRole('button', { name: '停止生成', exact: true }).click();
    await expect(page.getByText('已停止生成；本轮内容可能不完整。', { exact: true })).toBeVisible();
    await expect(confirm).toBeEnabled();
    await expect(page.getByText('未完成', { exact: true })).toBeVisible();
    expect(writes).toBe(0);
  } finally { release(); await page.unrouteAll({ behavior: 'wait' }); }
});
