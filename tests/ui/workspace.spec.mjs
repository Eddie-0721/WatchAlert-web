import {test, expect} from '@playwright/test';

async function mockAPI(page, capabilitiesError = false) {
  await page.addInitScript(() => {localStorage.setItem('Authorization','fixture-token');localStorage.setItem('TenantID','t');});
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()); const path = url.pathname; let data = [];
    if (!path.startsWith('/api/')) return route.continue();
    if(path.endsWith('/userInfo')) data = {userid:'u',username:'SRE',role:'admin'};
    if(path.endsWith('/getTenantList')) data = [{id:'t',name:'SRE 演示工作区'}];
    if(path.endsWith('/getTenant')) data = {id:'t',name:'SRE 演示工作区'};
    if(path.endsWith('/faultCenterList')) data = [{id:'fc',name:'支付业务'}];
    if(path.endsWith('/curEvent')) {
      const start = (Number(url.searchParams.get('index') || 1)-1)*Number(url.searchParams.get('size') || 30);
      data = {total:125,summary:{queues:{attention:125,processing:0,suppressed:0,observing:0,all:125},environments:['prod'],services:['payment']},list:Array.from({length:Math.min(30,125-start)},(_,i)=>({fingerprint:`fp-${start+i}`,ruleName:`支付延迟告警 ${start+i+1}`,severity:'P0',status:'alerting',lifecycle_status:'alerting',faultCenterId:'fc',labels:{env:'prod',service:'payment',instance:'payment-api-very-long-resource-name-0123456789.namespace.svc.cluster.local:9090'},first_trigger_time:1788700000}))};
    }
    if(path.endsWith('/capabilities')) {
      if(capabilitiesError) return route.fulfill({status:403,json:{code:403,msg:'denied'}});
      data={enabled:true,canWrite:false,allowedTools:['search_alerts'],scope:{datasourceIds:['p'],environmentLabelKey:'env',environments:['prod']}};
    }
    if(path.endsWith('/sessionList')) data=[{id:'s1',title:'支付告警分析',updatedAt:1788700000}];
    if(path.endsWith('/sessionGet')) data={session:{id:'s1'},messages:[{id:'m',role:'assistant',content:'指标查询成功，但目前不足以确定根因。',evidence:JSON.stringify([{toolName:'query_prometheus',status:'completed',summary:'查询返回 3 条时间序列',queriedAt:1788700000,source:{datasourceId:'p'},query:{query:'up{env="prod"}'},truncated:true}])}]};
    if(path.endsWith('/ruleGroupList')) data=[{id:'g',name:'支付业务规则'}];
    if(path.endsWith('/ruleList')) data={total:125,list:[{ruleId:'r',ruleName:'支付服务延迟规则',ruleGroupId:'g',enabled:true,datasourceType:'Prometheus',datasourceId:['p'],labels:{env:'prod',service:'payment'}}]};
    if(path.endsWith('/dataSourceList')) data=[{id:'p',name:'生产指标',type:'Prometheus',enabled:true}];
    await route.fulfill({json:{code:200,data,msg:'success'}});
  });
}

test('125 alerts paginate, preserve position while scrolling, and expose actions', async ({page}) => {
  await mockAPI(page); const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack);});
  await page.goto('/alerts');
  await expect(page.locator('.alert-event-row')).toHaveCount(30);
  await expect(page.getByRole('button',{name:/需处理\s*125/})).toBeVisible();
  const before=await page.locator('.alert-stream-page').boundingBox();
  await page.locator('.app-content').evaluate(el=>el.scrollTop=600);
  const after=await page.locator('.alert-stream-page').boundingBox();
  expect(after.x).toBe(before.x);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.locator('.ant-pagination-next').click();
  await expect(page.locator('.alert-event-row').first()).toContainText('支付延迟告警 31');
  await page.locator('.alert-event-row').first().click();
  await expect(page.getByRole('button',{name:'创建静默',exact:true})).toBeVisible();
  expect(await page.locator('.alert-detail').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
  await page.getByRole('button',{name:'创建静默',exact:true}).click();
  await expect(page.getByText('创建静默规则',{exact:true})).toBeVisible();
  await page.screenshot({animations:'disabled',path:'test-results/visual/alert-silence-desktop.png'});
  expect(errors).toEqual([]);
});

test('Manage separates configuration from health and reports server totals', async ({page}) => {
  await mockAPI(page);await page.goto('/manage');
  await expect(page.getByText('支付服务延迟规则')).toBeVisible();
  await expect(page.getByText('共 125 条',{exact:true})).toBeVisible();
  await page.screenshot({animations:'disabled',path:'test-results/visual/manage-desktop.png'});
  await page.goto('/manage?tab=sources');
  await expect(page.getByText(/连通性：未检测/)).toBeVisible();
});

test('Copilot permission failure is explicit and never calls legacy AI', async ({page}) => {
  await mockAPI(page,true);const urls=[];page.on('request',req=>urls.push(req.url()));await page.goto('/copilot');
  await expect(page.getByText('无权访问 Copilot，请联系管理员配置权限。')).toBeVisible();
  await expect(page.getByRole('textbox',{name:'输入问题'})).toBeDisabled();
  expect(urls.some(url=>url.includes('/api/w8t/ai/'))).toBeFalsy();
});

for(const width of [1440,390]) test(`Copilot history evidence remains reachable at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});await mockAPI(page);await page.goto('/copilot');
  await page.getByRole('combobox',{name:'历史会话'}).click();
  await page.locator('.ant-select-item-option').filter({hasText:'支付告警分析'}).click();
  await page.getByRole('heading',{name:'WatchAlert Copilot'}).click();
  await expect(page.getByText('指标查询成功，但目前不足以确定根因。')).toBeVisible();
  await page.getByText('数据来源与操作（1）').click();
  await expect(page.getByText('查询成功',{exact:true})).toBeVisible();
  await expect(page.getByText('query_prometheus',{exact:true})).toBeVisible();
  await expect(page.locator('.ant-collapse-header')).toHaveAttribute('aria-expanded','true');
  await page.locator('.copilot-tool-evidence').scrollIntoViewIfNeeded();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.screenshot({animations:'disabled',path:`test-results/visual/copilot-${width}.png`,fullPage:true});
});

test('legacy role page preserves parent navigation and red field validation',async({page})=>{
  await mockAPI(page);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/userRole');
  await expect(page.getByRole('button',{name:'人员与权限',exact:true})).toHaveAttribute('aria-current','page');
  await page.getByRole('button',{name:/创\s*建/}).click();
  await page.getByRole('button',{name:/^提\s*交$/}).click();
  await expect(page.locator('.ant-form-item-explain-error')).toBeVisible();
  await expect(page.locator('.ant-modal input.ant-input-status-error')).toHaveCSS('border-color','rgb(220, 38, 38)');
  await page.screenshot({animations:'disabled',path:'test-results/visual/role-validation.png'});
  expect(errors).toEqual([]);
});

test('mobile navigation retains administration and tenant controls',async({page})=>{
  await page.setViewportSize({width:390,height:844});await mockAPI(page);await page.goto('/manage');
  await page.getByRole('button',{name:'打开全部导航和账号菜单'}).click();
  await expect(page.locator('.wa-nav-drawer').getByRole('button',{name:'系统设置',exact:true})).toBeVisible();
  await expect(page.locator('.wa-nav-drawer .wa-workspace-switcher')).toBeVisible();
  await page.screenshot({animations:'disabled',path:'test-results/visual/mobile-navigation.png'});
});

test('mobile alert rows do not overflow their scroll surface',async({page})=>{
  await page.setViewportSize({width:390,height:844});await mockAPI(page);await page.goto('/alerts');
  await expect(page.locator('.alert-event-row')).toHaveCount(30);
  expect(await page.locator('.app-content').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
  expect((await page.locator('.alert-event-main').first().boundingBox()).width).toBeGreaterThan(160);
  await expect(page.locator('.alert-event-row .alert-state-badges').first()).toBeVisible();
  await page.screenshot({animations:'disabled',path:'test-results/visual/alerts-mobile.png'});
});
