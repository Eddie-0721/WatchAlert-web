import {describe,it,expect} from 'vitest';
import {readAlertView,patchAlertView,safeAlertReturn} from './alertView';
describe('alert URL context',()=>{
 it('normalizes invalid pagination and queues',()=>{
  expect(readAlertView(new URLSearchParams('page=-1&size=999&queue=unknown&severity=hack'))).toMatchObject({page:1,pageSize:30,queue:'attention',severity:undefined});
  expect(readAlertView(new URLSearchParams('page=2&size=50&environment=prod&service=payment'))).toMatchObject({page:2,pageSize:50,environment:'prod',service:'payment'});
 });
 it('resets page and selected event when changing filters',()=>{
  const next=patchAlertView(new URLSearchParams('page=4&event=fp&environment=prod'),{service:'支付/API'});
  expect(next.get('page')).toBeNull();expect(next.get('event')).toBeNull();
  expect(next.get('environment')).toBe('prod');expect(next.get('service')).toBe('支付/API');
  expect(patchAlertView(next,{page:2,event:'fp'},false).get('event')).toBe('fp');
 });
 it('return is confined to alerts in the same tenant',()=>{
  expect(safeAlertReturn('/alerts?page=2','t','t')).toBe('/alerts?page=2');
  for(const path of ['https://evil.test','//evil.test','/settings','/alerts-evil']) expect(safeAlertReturn(path,'t','t')).toBe('/alerts');
  expect(safeAlertReturn('/alerts?event=secret','other','t')).toBe('/alerts');
 });
});
