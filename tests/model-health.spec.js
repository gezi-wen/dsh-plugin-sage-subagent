/**
 * model-health 里纯函数的单测。
 *
 * `checkRoute` 本身要 ctx 与真实 llm 服务，走端到端验证（见项目记忆里的 RPC 检查法）；
 * 这里只保护「结果怎么讲给人听」这一层，因为 UI 与日志共用它。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_PROBE_TIMEOUT_MS, summarizeCheck } from '../lib/host/model-health.js'

test('两层结论要能一眼分清：免费校验 vs 真实探针', () => {
  assert.match(summarizeCheck({ ok: true, stage: 'resolve' }), /未发真实请求/)
  assert.match(summarizeCheck({ ok: true, stage: 'probe', ms: 1234 }), /首包 1234 ms/)
})

test('不在目录里是提示而不是错误', () => {
  const text = summarizeCheck({ ok: true, stage: 'resolve', listed: false })
  assert.match(text, /不在该 provider 的目录里/)
  assert.match(text, /参考性/)
  // 在目录里或目录不可知时不额外啰嗦
  assert.equal(/目录/.test(summarizeCheck({ ok: true, stage: 'resolve', listed: true })), false)
  assert.equal(/目录/.test(summarizeCheck({ ok: true, stage: 'resolve' })), false)
})

test('失败按阶段给不同的话', () => {
  assert.match(summarizeCheck({ ok: false, stage: 'resolve', detail: 'NO_ADAPTER' }), /配置解析失败：NO_ADAPTER/)
  assert.match(summarizeCheck({ ok: false, stage: 'timeout', ms: 20000 }), /超时/)
  assert.match(summarizeCheck({ ok: false, stage: 'probe', detail: 'boom' }), /请求失败：boom/)
})

test('探针超时有默认值', () => {
  assert.ok(Number.isSafeInteger(DEFAULT_PROBE_TIMEOUT_MS) && DEFAULT_PROBE_TIMEOUT_MS > 0)
})
