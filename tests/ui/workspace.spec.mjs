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

test('silence deletion reports failure, uses the row center and keeps the current filter', async ({page}) => {
  await mockAPI(page);
  let removed = false; let rejectDelete = true; let deletion; const statuses=[];
  await page.route('**/silence/silenceList*', route => {
    const url=new URL(route.request().url()); statuses.push(url.searchParams.get('status'));
    return route.fulfill({json:{code:200,data:{index:1,size:10,total:removed?0:1,list:removed?null:[{id:'s1',name:'生产维护',faultCenterId:'row-center',labels:[],status:2,startsAt:1788700000,endsAt:1788800000,updateAt:1788700000}]}}});
  });
  await page.route('**/silence/silenceDelete', route => {
    deletion=route.request().postDataJSON();
    if(rejectDelete) return route.fulfill({json:{code:400,data:'静默缓存删除失败，配置未删除，请稍后重试',msg:'failed'}});
    removed=true;return route.fulfill({json:{code:200,data:null,msg:'success'}});
  });
  await page.goto('/silenceRules');
  await page.getByText('已失效',{exact:true}).click();
  await expect.poll(()=>statuses.at(-1)).toBe('2');
  await page.getByRole('button',{name:'删除静默 生产维护'}).click();
  await page.getByRole('button',{name:/^确\s*定$/}).click();
  await expect(page.getByText('静默缓存删除失败，配置未删除，请稍后重试',{exact:true})).toBeVisible();
  await expect(page.getByText('静默规则已删除',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'删除静默 生产维护'})).toBeVisible();
  expect(deletion.faultCenterId).toBe('row-center');
  rejectDelete=false;
  await page.getByRole('button',{name:'删除静默 生产维护'}).click();
  await page.getByRole('button',{name:/^确\s*定$/}).click();
  await expect(page.getByText('静默规则已删除',{exact:true})).toBeVisible();
  await expect(page.getByText('暂无静默规则',{exact:true})).toBeVisible();
  expect(statuses.at(-1)).toBe('2');
});

test('silence loading failure has a retry and search waits for submission', async ({page}) => {
  await mockAPI(page);let fail=true;const queries=[];
  await page.route('**/silence/silenceList*',route=>{
    queries.push(new URL(route.request().url()).searchParams.get('query'));
    return route.fulfill({status:fail?500:200,json:fail?{code:500,msg:'failed'}:{code:200,data:{index:1,size:10,total:0,list:null}}});
  });
  await page.goto('/silenceRules');
  await expect(page.getByRole('button',{name:/^重\s*试$/})).toBeVisible();
  fail=false;await page.getByRole('button',{name:/^重\s*试$/}).click();
  await expect(page.getByRole('button',{name:/^重\s*试$/})).toHaveCount(0);
  const count=queries.length;
  await page.getByPlaceholder('搜索规则名称').fill('payment');
  expect(queries.length).toBe(count);
  await page.getByPlaceholder('搜索规则名称').press('Enter');
  await expect.poll(()=>queries.at(-1)).toBe('payment');
});

test('mobile silence filters and long rule content stay within the page', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await mockAPI(page);
  const longName='生产环境支付集群长期维护窗口-'.repeat(6);
  await page.route('**/silence/silenceList*',route=>route.fulfill({json:{code:200,data:{index:1,size:10,total:1,list:[{id:'s1',name:longName,faultCenterId:'fc',labels:[{key:'instance',operator:'=',value:'payment-api-very-long-resource-name-0123456789.namespace.svc.cluster.local:9090'}],status:1,startsAt:1788700000,endsAt:1788800000,updateAt:1788700000}]}}}));
  await page.goto('/silenceRules');
  await expect(page.getByRole('button',{name:longName,exact:true})).toBeVisible();
  expect(await page.locator('.app-content').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
  expect(await page.locator('.silence-rule-toolbar').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
  await page.screenshot({animations:'disabled',path:'test-results/visual/silence-mobile-list.png'});
  await page.getByRole('button',{name:longName,exact:true}).click();
  await expect(page.getByText('编辑静默规则',{exact:true})).toBeVisible();
  await page.screenshot({animations:'disabled',path:'test-results/visual/silence-mobile.png'});
});

test('mobile datasource toolbar and long text remain usable by keyboard', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await mockAPI(page);
  const longName='生产环境支付系统 Prometheus 数据源-'.repeat(4);
  await page.route('**/api/**/dataSourceList*',route=>route.fulfill({json:{code:200,data:[{id:'datasource-very-long-id-0123456789-abcdef',name:longName,type:'Prometheus',enabled:true,description:'跨多个环境的指标采集数据源。'.repeat(12)}]}}));
  await page.goto('/datasource');
  const copyButton=page.getByRole('button',{name:`复制数据源 ID ${longName}`});
  await expect(copyButton).toBeVisible();
  await copyButton.focus();
  await expect(copyButton).toBeFocused();
  expect(await page.locator('.app-content').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
  expect(await page.locator('.datasource-toolbar').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
  await page.screenshot({animations:'disabled',path:'test-results/visual/datasource-mobile.png'});
});

test('failed acknowledgement never shows a successful claim', async ({page}) => {
  await mockAPI(page);
  await page.route('**/event/process', route=>route.fulfill({status:400,json:{code:400,data:'认领未全部确认：0 条已认领，1 条未确认；请刷新核对实际状态',msg:'failed'}}));
  await page.goto('/alerts');await page.locator('.alert-event-row').first().click();
  await page.getByRole('button',{name:'认领告警',exact:true}).click();
  await expect(page.getByText(/认领未全部确认：0 条已认领/)).toBeVisible();
  await expect(page.getByText('告警已认领',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'认领告警',exact:true})).toBeEnabled();
});

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

test('alert URL, analysis time window and return preserve the working scene',async({page})=>{
  await mockAPI(page);
  await page.route('**/api/w8t/agent/sessionCreate',route=>route.fulfill({json:{code:200,data:{id:'new-session'}}}));
  let submitted;
  await page.route('**/api/w8t/agent/sessionMessageStream',async route=>{
    submitted=route.request().postDataJSON();
    await route.fulfill({contentType:'text/event-stream',body:'event: done\ndata: {"content":"测试分析结果","evidence":"[]"}\n\n'});
  });
  await page.goto('/alerts?environment=prod&service=payment&page=2');
  await expect(page.locator('.alert-event-row')).toHaveCount(30);
  await page.locator('.app-content').evaluate(el=>el.scrollTop=500);
  await page.locator('.alert-event-row').nth(6).click();
  const expectedURL=page.url();
  const scroll=await page.locator('.app-content').evaluate(el=>el.scrollTop);
  await page.getByRole('button',{name:'继续分析',exact:true}).click();
  await expect(page.getByText('当前线索：支付延迟告警 37')).toBeVisible();
  await page.locator('.copilot-time-window .ant-select-selector').click();
  await page.locator('.ant-select-item-option').filter({hasText:'最近 1 小时'}).click();
  await page.getByRole('textbox',{name:'输入问题'}).fill('分析这条告警');
  await page.getByRole('button',{name:'发送',exact:true}).click();
  await expect(page.getByText('测试分析结果')).toBeVisible();
  expect(submitted.context.selectedAlert.fingerprint).toBe('fp-36');
  expect(submitted.context.timeRange.end-submitted.context.timeRange.start).toBe(3600);
  await page.getByRole('button',{name:'返回告警现场'}).click();
  await expect(page).toHaveURL(expectedURL);
  await expect(page.locator('.alert-detail h2')).toHaveText('支付延迟告警 37');
  await expect.poll(()=>page.locator('.app-content').evaluate(el=>el.scrollTop)).toBe(scroll);
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.reload();
  await expect(page.locator('.alert-event-row').first()).toContainText('支付延迟告警 31');
  await expect(page.locator('.alert-stream-toolbar .ant-select-selector').filter({has:page.getByRole('combobox',{name:'环境'})})).toContainText('prod');
});

test('silence requires a fresh preview and preserves draft on rejection',async({page})=>{
  await mockAPI(page);
  let previews=0,writes=0,lastWrite;
  await page.route('**/silence/silencePreview',async route=>{
    previews++;
    await route.fulfill({json:{code:200,data:{previewHash:'hash-'+previews,previewAt:Math.floor(Date.now()/1000),total:2,samples:[{fingerprint:'fp-0',ruleName:'支付延迟告警 1',scope:{environment:'prod',service:'payment',resource:'pod-1'}}]}}});
  });
  await page.route('**/silence/silenceCreate',async route=>{
    writes++;lastWrite=route.request().postDataJSON();
    await route.fulfill({json:writes===1?{code:400,data:'匹配告警已变化，请重新预览并确认'}:{code:200,data:{id:'s-created'}}});
  });
  await page.goto('/alerts');
  await page.locator('.alert-event-row').first().click();
  await page.getByRole('button',{name:'创建静默',exact:true}).click();
  await expect(page.locator('.alert-detail-drawer')).not.toBeVisible();
  await expect(page.getByRole('button',{name:/仅当前资源/})).toHaveClass(/is-active/);
  await page.getByRole('textbox',{name:'静默原因'}).fill('计划发布，值班人员持续关注');
  await page.getByRole('button',{name:'预览影响范围'}).click();
  await expect(page.getByRole('region',{name:'静默影响预览'})).toContainText('当前匹配 2 条告警');
  expect(writes).toBe(0);
  await page.getByRole('textbox',{name:'静默名称'}).fill('修改后的静默');
  await expect(page.getByRole('button',{name:'确认执行静默'})).toHaveCount(0);
  await page.getByRole('button',{name:'预览影响范围'}).click();
  await page.getByRole('button',{name:'确认执行静默'}).click();
  await expect(page.getByText('匹配告警已变化，请重新预览并确认').first()).toBeVisible();
  await expect(page.getByRole('textbox',{name:'静默名称'})).toHaveValue('修改后的静默');
  await expect(page.getByRole('button',{name:'确认执行静默'})).toHaveCount(0);
  await page.getByRole('button',{name:'预览影响范围'}).click();
  await page.getByRole('button',{name:'确认执行静默'}).click();
  await expect(page.getByText('静默规则已保存',{exact:true})).toBeInViewport();
  expect(lastWrite.previewHash).toBe('hash-3');expect(writes).toBe(2);
  await page.screenshot({animations:'disabled',path:'test-results/visual/silence-saved.png'});
});

test('silence preview failure cannot become a silent write',async({page})=>{
  await mockAPI(page);const writes=[];
  page.on('request',req=>{if(req.url().endsWith('/silenceCreate'))writes.push(req.url())});
  await page.route('**/silence/silencePreview',route=>route.fulfill({json:{code:400,data:'无权预览，请联系管理员'}}));
  await page.goto('/alerts');await page.locator('.alert-event-row').first().click();
  await page.getByRole('button',{name:'创建静默',exact:true}).click();
  await page.getByRole('textbox',{name:'静默原因'}).fill('维护');
  await page.getByRole('button',{name:'预览影响范围'}).click();
  await expect(page.getByText('无权预览，请联系管理员').first()).toBeVisible();
  await expect(page.getByRole('button',{name:'确认执行静默'})).toHaveCount(0);
  expect(writes).toEqual([]);
});

test('diagnostics run explicitly and display degraded checks, not a false global success',async({page})=>{
  await mockAPI(page);let probes=0;
  await page.route('**/agent/diagnostics',async route=>{probes++;await route.fulfill({json:{code:200,data:{checkedAt:1788700000,checks:[{id:'runtime',status:'ok'},{id:'gateway',status:'unavailable'},{id:'model',status:'unauthorized'}]}}})});
  await page.goto('/copilot');expect(probes).toBe(0);
  await page.getByRole('button',{name:'连接诊断',exact:true}).click();
  await expect(page.getByText('认证失败，请检查凭据')).toBeVisible();
  await expect(page.getByText('不可用，请检查连接或服务日志')).toBeVisible();
  expect(probes).toBe(1);
  await page.screenshot({animations:'disabled',path:'test-results/visual/copilot-diagnostics.png'});
});

for(const width of [1440,390]) test(`rule prototype at ${width}px never writes production configuration`,async({page})=>{
  await mockAPI(page);await page.setViewportSize({width,height:900});const writes=[];
  page.on('request',req=>{if(req.method()==='POST'&&req.url().includes('/api/'))writes.push(req.url())});
  await page.goto('/manage/rule-workflow-preview');
  await page.getByRole('button',{name:/支付接口错误率/}).click();
  await page.getByRole('textbox',{name:'演示规则名称'}).fill('支付接口错误率（修改草稿）');
  await expect(page.getByRole('button',{name:'预览变更'})).toBeDisabled();
  await page.getByRole('button',{name:'演示测试步骤'}).click();
  await page.getByRole('button',{name:'预览变更'}).click();
  await expect(page.getByText('涉及生产环境：请核对通知影响')).toBeVisible();
  await page.getByRole('button',{name:'保存演示草稿'}).click();
  await expect(page.getByText('演示草稿已保留在当前页面，未修改真实规则')).toBeInViewport();
  expect(writes).toEqual([]);
  expect(await page.locator('.app-content').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
  await page.screenshot({animations:'disabled',path:`test-results/visual/rule-workflow-${width}.png`});
});
