/**
 * model-chain 纯逻辑的单测。
 *
 * 重点保护两条实测得来的铁律：换路由必须**返回干净配置**（不继承旧路由的 maxTokens），
 * 以及链**不循环**（每个候选最多试一次）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  advance,
  applyRoute,
  candidateConfig,
  createChainState,
  currentCandidate,
  DEFAULT_SWITCH_ON,
  shouldSwitch,
} from '../lib/shared/model-chain.js'

test('默认切换集合覆盖「路由服务不了我们」的码，且不含 INVALID_REQUEST', () => {
  for (const code of ['AUTH', 'INVALID_CREDENTIAL', 'QUOTA', 'RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT', 'EMPTY_RESPONSE', 'NO_ADAPTER']) {
    assert.ok(DEFAULT_SWITCH_ON.includes(code), `缺少 ${code}`)
  }
  // 这两条是「我们发错东西 / 内容超窗」，默认不切（换路由只是把同一个错误再交一遍学费）
  assert.ok(!DEFAULT_SWITCH_ON.includes('INVALID_REQUEST'))
  assert.ok(!DEFAULT_SWITCH_ON.includes('CONTEXT_WINDOW_EXCEEDED'))
})

test('shouldSwitch 按码判定，缺码一律不切', () => {
  assert.equal(shouldSwitch({ code: 'SERVER' }, DEFAULT_SWITCH_ON), true)
  assert.equal(shouldSwitch({ code: 'INVALID_REQUEST' }, DEFAULT_SWITCH_ON), false)
  assert.equal(shouldSwitch({}, DEFAULT_SWITCH_ON), false)
  assert.equal(shouldSwitch(undefined, DEFAULT_SWITCH_ON), false)
})

test('candidateConfig 省略未指定的强度', () => {
  assert.deepEqual(candidateConfig({ provider: 'p', model: 'm' }), { provider: 'p', model: 'm' })
  assert.deepEqual(candidateConfig({ provider: 'p', model: 'm', effort: 'high' }), { provider: 'p', model: 'm', reasoningEffort: 'high' })
})

test('同路由同强度：原样返回同一个对象（不制造无谓的头部变化）', () => {
  const base = { provider: 'p', model: 'm', reasoningEffort: 'high', maxTokens: 1024 }
  assert.equal(applyRoute(base, { provider: 'p', model: 'm', effort: 'high' }), base)
  assert.equal(applyRoute(base, { provider: 'p', model: 'm' }), base)
})

test('同路由换强度：只改强度，其余字段保留', () => {
  const base = { provider: 'p', model: 'm', reasoningEffort: 'low', maxTokens: 1024 }
  assert.deepEqual(applyRoute(base, { provider: 'p', model: 'm', effort: 'high' }), {
    provider: 'p', model: 'm', reasoningEffort: 'high', maxTokens: 1024,
  })
})

test('换路由：返回干净配置，绝不继承旧路由的 maxTokens（Phase 0 踩过的坑）', () => {
  const base = { provider: 'old', model: 'small', reasoningEffort: 'high', maxTokens: 400000, temperature: 0.7, stop: ['x'] }
  const next = applyRoute(base, { provider: 'new', model: 'big' })
  assert.deepEqual(next, { provider: 'new', model: 'big' })
  assert.equal('maxTokens' in next, false)
  assert.equal('temperature' in next, false)
  assert.equal('stop' in next, false)
})

test('链推进：每个候选最多一次，到最后不再前进', () => {
  const state = createChainState([{ provider: 'a', model: '1' }, { provider: 'b', model: '2' }, { provider: 'c', model: '3' }])
  assert.equal(currentCandidate(state).provider, 'a')
  assert.equal(advance(state), true)
  assert.equal(currentCandidate(state).provider, 'b')
  assert.equal(advance(state), true)
  assert.equal(currentCandidate(state).provider, 'c')
  assert.equal(advance(state), false)
  assert.equal(state.switches, 2)
  assert.equal(currentCandidate(state).provider, 'c')
})

test('单候选链：推不动', () => {
  const state = createChainState([{ provider: 'a', model: '1' }])
  assert.equal(advance(state), false)
  assert.equal(state.switches, 0)
})
