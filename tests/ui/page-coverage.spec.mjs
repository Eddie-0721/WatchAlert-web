import {test, expect} from '@playwright/test';

const routes = [
  '/', '/alerts', '/copilot', '/manage', '/manage?tab=routes', '/manage?tab=sources', '/manage/rule-workflow-preview',
  '/ruleGroup', '/ruleGroup/g/rule/list', '/silenceRules',
  '/ruleGroup/g/rule/add', '/ruleGroup/g/rule/r/edit',
  '/tmplType/Prometheus/group', '/tmplType/Prometheus/g/templates',
  '/noticeObjects', '/noticeTemplate', '/noticeRecords',
  '/dutyManage', '/dutyManage/d/calendar', '/user', '/userRole',
  '/tenants', '/tenants/detail/t', '/datasource', '/folders', '/folder/f/list',
  '/dashboard/f/f/g/d/info',
  '/auditLog', '/settings', '/onceProbing', '/probing', '/probing/create',
  '/probing/p/edit', '/probing/p/detail',
  '/profile', '/faultCenter', '/faultCenter/detail/fc',
  '/faultCenter/detail/fc?tab=2', '/faultCenter/detail/fc?tab=3',
  '/faultCenter/detail/fc?tab=4', '/faultCenter/detail/fc?tab=5',
  '/recordingRules', '/recordingRules/g/list', '/recordingRules/g/create',
  '/recordingRules/g/rule/r/edit',
  '/dataAnalysis', '/prometheusTargets', '/prometheusTargets/1/list',
];

async function mockReadOnlyAPI(page) {
  await page.addInitScript(() => {
    localStorage.setItem('Authorization','fixture-token');
    localStorage.setItem('TenantID','t');
  });
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    let data = [];
    if(path.endsWith('/userInfo')) data={userid:'u',username:'SRE',role:'admin'};
    if(path.endsWith('/getTenantList')) data=[{id:'t',name:'演示工作区'}];
    if(path.endsWith('/getTenant')) data={id:'t',name:'演示工作区'};
    if(path.endsWith('/faultCenterList')) data=[{id:'fc',name:'支付业务',createAt:1788700000}];
    if(path.endsWith('/faultCenterSearch')) data={id:'fc',name:'支付业务',description:'生产环境支付服务告警路由'};
    if(path.endsWith('/ruleGroupList')) data={index:1,size:10,total:2,list:[{id:'g',name:'支付业务规则'},{id:'g2',name:'基础设施规则'}]};
    if(path.endsWith('/recordingRuleGroupList')) data={index:1,size:10,total:2,list:[{id:'g',name:'支付业务记录规则'},{id:'g2',name:'基础设施记录规则'}]};
    if(path.endsWith('/ruleList') || path.endsWith('/recordingRuleList') || path.endsWith('/ruleTmplGroupList')) data={index:1,size:10,total:0,list:[]};
    if(path.endsWith('/targetGroupList')) data={index:1,size:10,total:2,list:[{id:1,name:'生产支付服务'},{id:2,name:'测试基础服务'}]};
    if(path.endsWith('/targetList')) data={index:1,size:10,total:0,list:[]};
    if(path.endsWith('/ruleSearch')) data={ruleId:'r',ruleGroupId:'g',ruleName:'支付服务延迟',datasourceType:'Prometheus',datasourceId:[],externalLabels:{},prometheusConfig:{promQL:'up',rules:[]},enabled:true};
    if(path.endsWith('/searchProbing')) data={ruleId:'p',ruleName:'支付服务拨测',ruleType:'HTTP',datasourceId:[],labels:{},enabled:true,probingEndpointConfig:{endpoint:'https://example.com',http:{method:'GET'},strategy:{evalInterval:10,timeout:10,failure:3}}};
    if(path.endsWith('/listProbing')) data=[{ruleId:'p',ruleName:'支付服务拨测',ruleType:'HTTP',datasourceId:[],probingEndpointConfig:{endpoint:'https://example.com'}}];
    if(path.endsWith('/getFolderInfo')) data={id:'f',grafanaHost:'https://example.com',theme:'light'};
    if(path.endsWith('/getDashboardFullUrl')) data='about:blank';
    if(path.endsWith('/curEvent')) data={total:0,summary:{queues:{attention:0,processing:0,suppressed:0,observing:0,all:0},environments:[],services:[]},list:[]};
    if(path.endsWith('/getDashboardInfo')) data={alarmDistribution:{},curAlertList:[]};
    if(path.endsWith('/capabilities')) data={enabled:true,canWrite:false,allowedTools:['search_alerts'],scope:{datasourceIds:[],environments:[]}};
    return route.fulfill({json:{code:200,data,msg:'success'}});
  });
}

for(const width of [1440,390,320]) test(`${width}px login page remains usable without a session`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.route('**/api/system/checkUser*',route=>route.fulfill({json:{code:200,data:'ok',msg:'success'}}));
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/login');
  await expect(page.getByRole('textbox').first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  expect(errors).toEqual([]);
});

for(const width of [1440,700,390,320]) {
  for(const route of routes) {
    test(`${width}px route ${route} mounts without app overflow`,async({page})=>{
      await page.setViewportSize({width,height:900});
      await mockReadOnlyAPI(page);
      const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(route);
      await expect(page.locator('.app-content')).toBeVisible();
      await expect.poll(()=>page.locator('.app-page-body').evaluate(el=>el.childElementCount)).toBeGreaterThan(0);
      await expect(page.getByText('正在加载页面…')).toHaveCount(0);
      if(route==='/manage?tab=routes') await expect(page.getByRole('navigation',{name:'管理模块'}).getByRole('button',{name:'通知与路由'})).toHaveAttribute('aria-pressed','true');
      if(route==='/manage?tab=sources') await expect(page.getByRole('navigation',{name:'管理模块'}).getByRole('button',{name:'数据源'})).toHaveAttribute('aria-pressed','true');
      if(route.includes('/faultCenter/detail/fc?tab=')) {
        const name={'2':'历史告警','3':'降噪配置','4':'通知配置','5':'告警升级'}[route.at(-1)];
        await expect(page.getByRole('tab',{name})).toHaveAttribute('aria-selected','true');
      }
      if(route==='/probing/p/detail') await expect(page.getByText('HTTP状态码')).toBeVisible();
      if(route==='/tenants/detail/t') await expect(page.getByText('更新时间未知')).toBeVisible();
      const overflow=await page.locator('.app-content').evaluate(el=>{
        if(el.scrollWidth<=el.clientWidth) return [];
        const right=el.getBoundingClientRect().right;
        return [...el.querySelectorAll('*')].map(node=>({node,right:node.getBoundingClientRect().right})).filter(item=>item.right>right+1).slice(0,12).map(item=>`${item.node.tagName.toLowerCase()}.${String(item.node.className?.baseVal??item.node.className).replaceAll(' ','.')} +${Math.round(item.right-right)}px parent:${item.node.parentElement?.className} width:${item.node.clientWidth}/${item.node.scrollWidth}`);
      });
      expect(overflow).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}

for(const [route,name] of [['/auditLog','audit'],['/probing','probing'],['/dataAnalysis','data-analysis']]) {
  test(`${name} primary controls stay visible at 390px`,async({page})=>{
    await page.setViewportSize({width:390,height:900});
    await mockReadOnlyAPI(page);
    await page.goto(route);
    if(route==='/dataAnalysis') {
      await expect(page.getByRole('button',{name:/查\s*询/}).first()).toBeVisible();
      expect((await page.locator('.wa-query-input-row .ant-col').first().boundingBox()).width).toBeGreaterThan(300);
    } else {
      await expect(page.getByPlaceholder('输入搜索关键字')).toBeVisible();
      await expect(page.getByRole('button',{name:/刷\s*新/})).toBeVisible();
      if(route==='/probing') await expect(page.getByRole('button',{name:/创\s*建/})).toBeVisible();
    }
    await page.screenshot({animations:'disabled',path:`test-results/visual/${name}-390.png`});
  });
}

for(const [route,name] of [
  ['/ruleGroup/g/rule/list','alert-rules'],
  ['/recordingRules/g/list','recording-rules'],
  ['/tmplType/Prometheus/group','template-groups'],
  ['/tmplType/Prometheus/g/templates','templates'],
  ['/noticeTemplate','notice-templates'],
  ['/noticeRecords','notice-records'],
]) {
  test(`${name} list controls remain in the mobile viewport`,async({page})=>{
    await page.setViewportSize({width:390,height:900});
    await mockReadOnlyAPI(page);
    await page.goto(route);
    await expect(page.locator('.app-content')).toBeVisible();
    await expect(page.getByText('正在加载页面…')).toHaveCount(0);
    expect(await page.locator('.app-content').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
    await page.screenshot({animations:'disabled',path:`test-results/visual/${name}-390.png`});
  });
}

for(const [route,name] of [
  ['/alerts','alerts'], ['/ruleGroup/g/rule/list','alert-rules'],
  ['/recordingRules/g/list','recording-rules'],
  ['/tmplType/Prometheus/group','template-groups'],
  ['/faultCenter/detail/fc','fault-detail'], ['/settings','settings'],
]) {
  test(`${name} desktop visual checkpoint`,async({page})=>{
    await page.setViewportSize({width:1440,height:900});
    await mockReadOnlyAPI(page);
    await page.goto(route);
    await expect(page.getByText('正在加载页面…')).toHaveCount(0);
    await page.screenshot({animations:'disabled',path:`test-results/visual/${name}-1440.png`});
  });
}

for(const [route,target] of [
  ['/ruleGroup/g/rule/list','/ruleGroup/g2/rule/list'],
  ['/recordingRules/g/list','/recordingRules/g2/list'],
]) {
  test(`${route} mobile group selector changes the selected group`,async({page})=>{
    await page.setViewportSize({width:390,height:900});
    await mockReadOnlyAPI(page);
    await page.goto(route);
    const selector=page.locator('.wa-group-sidebar__list');
    await expect(selector).toBeVisible();
    expect(await selector.evaluate(el=>el.scrollWidth>el.clientWidth)).toBeTruthy();
    const group=selector.getByRole('button',{name:route.startsWith('/ruleGroup')?'基础设施规则':'基础设施记录规则',exact:true});
    await group.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(target.replaceAll('/','\\/')));
  });
}

test('mobile template type selector is keyboard accessible',async({page})=>{
  await page.setViewportSize({width:390,height:900});
  await mockReadOnlyAPI(page);
  await page.goto('/tmplType/Prometheus/group');
  const logs=page.getByRole('button',{name:'Logs'});
  await expect(logs).toBeVisible();
  await logs.focus();
  await page.keyboard.press('Enter');
  await expect(logs).toHaveAttribute('aria-pressed','true');
  await expect(page).toHaveURL(/\/tmplType\/Logs\/group/);
});

test('mobile service discovery group selector stays usable',async({page})=>{
  await page.setViewportSize({width:390,height:900});
  await mockReadOnlyAPI(page);
  await page.goto('/prometheusTargets/1/list');
  const selector=page.locator('.wa-service-group-sidebar__list');
  await expect(selector.getByText('测试基础服务')).toBeVisible();
  expect(await selector.evaluate(el=>el.scrollWidth>el.clientWidth)).toBeTruthy();
  await selector.getByRole('button',{name:'测试基础服务',exact:true}).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/prometheusTargets\/2\/list/);
  expect(await page.locator('.app-content').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
});

test('mobile settings directory stays above a full-width form',async({page})=>{
  await page.setViewportSize({width:390,height:900});
  await mockReadOnlyAPI(page);
  await page.goto('/settings');
  const nav=page.getByRole('navigation',{name:'系统设置目录'});
  await expect(nav).toBeVisible();
  const main=page.locator('.wa-settings-main');
  expect((await main.boundingBox()).width).toBeGreaterThan(340);
  expect((await nav.boundingBox()).y).toBeLessThan((await main.boundingBox()).y);
  await nav.getByRole('link',{name:'AI 能力'}).click();
  await expect(page).toHaveURL(/#ai$/);
});

test('missing probing task shows an empty state instead of an endless spinner',async({page})=>{
  await page.setViewportSize({width:390,height:900});
  await mockReadOnlyAPI(page);
  await page.route('**/api/w8t/probing/listProbing*',route=>route.fulfill({json:{code:200,data:[],msg:'success'}}));
  await page.goto('/probing/p/detail');
  await expect(page.getByText('未找到对应的拨测任务')).toBeVisible();
  await expect(page.getByText('正在加载任务信息...')).toHaveCount(0);
});

test('profile API key tab remains usable on a phone',async({page})=>{
  await page.setViewportSize({width:390,height:900});
  await mockReadOnlyAPI(page);
  await page.goto('/profile');
  await page.getByRole('tab',{name:'API密钥管理'}).click();
  await expect(page.getByRole('button',{name:'创建API密钥'})).toBeVisible();
  expect(await page.locator('.app-content').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
  await page.screenshot({animations:'disabled',path:'test-results/visual/profile-api-keys-390.png'});
});

test('profile contact edit leaves password unchanged when no new password is entered',async({page})=>{
  await page.setViewportSize({width:390,height:900});
  await mockReadOnlyAPI(page);
  const writes=[];
  await page.route('**/api/w8t/user/userUpdate',async route=>{
    writes.push(route.request().postDataJSON());
    await route.fulfill({json:{code:200,data:null,msg:'success'}});
  });
  await page.goto('/profile');
  await page.getByRole('button',{name:'编辑信息'}).click();
  await page.getByRole('textbox',{name:'手机号'}).fill('13800000000');
  await page.getByRole('textbox',{name:'邮箱'}).fill('sre@example.com');
  await expect(page.getByPlaceholder('留空则不修改密码')).toHaveValue('');
  await page.getByRole('button',{name:/更\s*新/}).click();
  await expect.poll(()=>writes.length).toBe(1);
  expect(writes[0].password).toBe('');
});

for(const [route,name] of [
  ['/','overview'], ['/alerts','alerts'], ['/copilot','copilot'],
  ['/faultCenter/detail/fc','fault-detail'], ['/settings','settings'],
  ['/dutyManage/d/calendar','duty-calendar'], ['/profile','profile'],
  ['/ruleGroup/g/rule/r/edit','rule-edit'], ['/probing/p/detail','probing-detail'],
  ['/probing/create','probing-create'], ['/recordingRules/g/create','recording-rule-create'],
  ['/userRole','roles'], ['/tenants/detail/t','tenant-detail'],
  ['/datasource','datasources'], ['/prometheusTargets/1/list','targets'],
  ['/dataAnalysis','data-analysis'], ['/auditLog','audit'],
]) {
  test(`${name} mobile visual checkpoint`,async({page})=>{
    await page.setViewportSize({width:390,height:900});
    await mockReadOnlyAPI(page);
    await page.goto(route);
    await expect(page.getByText('正在加载页面…')).toHaveCount(0);
    if(route==='/probing/p/detail') await expect(page.getByText('HTTP状态码')).toBeVisible();
    await page.screenshot({animations:'disabled',path:`test-results/visual/${name}-390.png`});
  });
}
