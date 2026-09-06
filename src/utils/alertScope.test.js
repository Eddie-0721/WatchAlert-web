import {expect, it} from 'vitest';
import {buildSilenceContext} from './alertScope';
it('creates resource silence matchers when cluster/namespace labels are absent',()=>{
  const result=buildSilenceContext({labels:{env:'prod',service:'payment',instance:'api:9090'}});
  expect(result.matchers.resource.map(item=>item.key)).toEqual(['env','service','instance']);
  expect(result.matchers.service.map(item=>item.key)).toEqual(['env','service']);
});
it('does not invent silence labels from display-only scope projections',()=>{
  expect(buildSilenceContext({scope:{environment:'prod',resource:'api'}}).matchers.resource).toEqual([]);
});
