import { test, expect } from '@playwright/test';

for (const width of [1440, 390]) test(`shared Markdown still renders the legacy event analysis drawer at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(() => { localStorage.setItem('Authorization', 'fixture-token'); localStorage.setItem('TenantID', 't'); });
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    let data = [];
    if (path.endsWith('/userInfo')) data = { userid: 'u', username: 'SRE', role: 'admin' };
    if (path.endsWith('/getTenantList')) data = [{ id: 't', name: '测试租户' }];
    if (path.endsWith('/getTenant')) data = { id: 't', name: '测试租户' };
    if (path.endsWith('/faultCenterSearch')) data = { id: 'fc', name: '测试故障中心' };
    if (path.endsWith('/curEvent')) data = { total: 1, list: [{ fingerprint: 'fp', rule_id: 'r', rule_name: '测试告警', annotations: '合成告警', datasource_type: 'Prometheus', confirmState: {}, first_trigger_time: 1700000000, severity: 'P0', status: 'alerting', labels: {} }] };
    return route.fulfill({ json: { code: 200, data } });
  });
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let calls = 0;
  await page.route('**/ai/chat', async route => {
    calls++; await pending;
    const content = '# 一级标题\n## 二级标题\n### 三级标题\n#### 四级标题\n##### 五级标题\n###### 六级标题\n\n保留说明和 `inline-code`。\n\n```yaml\nenvironment: production\n```\n\n```unknownlanguage\nopaque-value\n```';
    await route.fulfill({ json: { code: 200, data: content } }).catch(() => {});
  });
  try {
    await page.goto('/faultCenter/detail/fc');
    await expect(page.getByText('测试告警', { exact: true })).toBeVisible();
    await page.locator('.ant-table-tbody .ant-dropdown-trigger').click();
    await page.getByRole('menuitem', { name: 'Ai 分析', exact: true }).click();
    const markdown = page.getByRole('dialog').locator('.markdown-body');
    await expect(markdown).toContainText('正在分析中...');
    release();
    for (const level of [1, 2, 3, 4, 5, 6]) await expect(markdown.locator(`h${level}`)).toBeVisible();
    await expect(markdown).toContainText('inline-code');
    await expect(markdown).toContainText('environment: production');
    await expect(markdown).toContainText('opaque-value');
    expect(calls).toBe(1);
  } finally { release(); await page.unrouteAll({ behavior: 'wait' }); }
});
