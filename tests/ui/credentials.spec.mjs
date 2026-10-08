import { test, expect } from '@playwright/test';

async function mock(page, { settingsError = false, failSave = false } = {}) {
  const writes = [];
  await page.addInitScript(() => {
    localStorage.setItem('Authorization', 'fixture-token');
    localStorage.setItem('TenantID', 'a');
  });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data = [];
    if (path.endsWith('/userInfo')) data = { userid:'admin', username:'admin', role:'admin' };
    if (path.endsWith('/getTenantList')) data = [{id:'a', name:'测试租户'}];
    if (path.endsWith('/getTenant')) data = {id:'a', name:'测试租户'};
    if (path.endsWith('/dataSourceList')) data = [{
      id:'ds-a', name:'生产指标', type:'Prometheus', enabled:false,
      http:{url:'http://metrics.invalid:9090', timeout:10, headers:{Authorization:''}},
      Auth:{user:'reader', pass:''}, write:{enabled:'Off', url:''},
      credentialsSet:{'auth.pass':true, 'http.headers':true}
    }];
    if (path.endsWith('/getSystemSetting')) {
      if (settingsError) return route.fulfill({status:403,json:{code:403,msg:'failed',data:'无权限'}});
      data = {authType:0, communicationConfig:{email:{serverAddress:'smtp.invalid',port:25,email:'sre@example.invalid',token:''}},
        agentConfig:{enable:false,model:{apiKeySet:true}},credentialsSet:{'communicationConfig.email.token':true,'agentConfig.model.apiKey':true}};
    }
    if (['/saveSystemSetting','/dataSourceUpdate','/dataSourcePing'].some(end => path.endsWith(end))) {
      writes.push({path, body:route.request().postDataJSON()});
      if (failSave && !path.endsWith('/dataSourcePing'))
        return route.fulfill({status:400,json:{code:400,msg:'failed',data:'测试保存失败，请重试'}});
    }
    await route.fulfill({json:{code:200,msg:'success',data}});
  });
  return writes;
}

async function openDatasource(page) {
  await page.goto('/datasource');
  const row = page.locator('tr').filter({hasText:'生产指标'});
  await row.getByRole('button').last().click();
  await page.getByRole('menuitem', {name:'更新'}).click();
  await expect(page.getByText('编辑数据源', {exact:true})).toBeVisible();
}

test('datasource edit preserves masked credentials, disabled state and draft on failure', async ({page}) => {
  const writes = await mock(page, {failSave:true});
  await openDatasource(page);
  await expect(page.getByLabel('Pass', {exact:true})).toHaveValue('');
  await expect(page.getByLabel('User', {exact:true})).toHaveValue('reader');
  await page.getByRole('button', {name:'连接测试', exact:true}).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body.id).toBe('ds-a');
  expect(writes[0].body.auth.pass).toBe('');
  expect(writes[0].body.http.headers.Authorization).toBe('');
  await page.getByLabel('数据源名称').fill('修改后的名称');
  await page.getByRole('button', {name:/^提\s*交$/}).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1].body.enabled).toBe(false);
  await expect(page.getByText('编辑数据源', {exact:true})).toBeVisible();
  await expect(page.getByLabel('数据源名称')).toHaveValue('修改后的名称');
  await expect(page.getByText(/测试保存失败，请重试/)).toBeVisible();
});

test('datasource explicit clear is submitted without replacing blank with a mask', async ({page}) => {
  const writes = await mock(page);
  await openDatasource(page);
  await page.getByLabel('本次明确清除的凭据（可选）').click();
  await page.locator('.ant-select-item-option').filter({hasText:'数据源认证密码'}).click();
  await page.getByText('编辑数据源', {exact:true}).click();
  await page.getByRole('button', {name:/^提\s*交$/}).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body.clearCredentials).toContain('auth.pass');
  expect(writes[0].body.auth.pass).toBe('');
  await expect(page.getByText('编辑数据源', {exact:true})).not.toBeVisible();
});

test('settings clear is explicit and failed save keeps the form input', async ({page}) => {
  const writes = await mock(page, {failSave:true});
  await page.goto('/settings');
  await expect(page.getByText('已保存的凭据不会回显')).toBeVisible();
  await page.getByLabel('本次明确清除的凭据（可选）').click();
  await page.locator('.ant-select-item-option').filter({hasText:'Agent 模型 API Key'}).click();
  await page.getByText('已保存的凭据不会回显').click();
  await page.getByRole('button',{name:/^保\s*存$/}).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body.clearCredentials).toEqual(['agentConfig.model.apiKey']);
  expect(writes[0].body.communicationConfig.email.token).toBe('');
  await expect(page.getByText(/测试保存失败，请重试/)).toBeVisible();
  await expect(page.locator('.ant-select-selection-item').filter({hasText:'Agent 模型 API Key'})).toBeVisible();
});

test('settings read denied cannot overwrite configuration', async ({page}) => {
  const writes = await mock(page, {settingsError:true});
  await page.goto('/settings');
  await expect(page.getByText('设置读取失败，已禁止保存，避免覆盖现有配置')).toBeVisible();
  await expect(page.getByRole('button',{name:/^保\s*存$/})).toBeDisabled();
  expect(writes).toHaveLength(0);
});
