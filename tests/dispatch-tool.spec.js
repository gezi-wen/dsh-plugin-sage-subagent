/**
 * dispatch-tool 里两个纯函数的单测。
 *
 * 这两个函数承载了两条实测得来的硬约束：
 *   - 角色声明技能时，工具白名单必须保留 `skill`，否则技能目录整体不发布；
 *   - `allowRedelegation: false` 只能靠深度上限封顶（工具过滤删不掉官方委派工具）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildToolDescription, effectiveMaxDepth, headAgentOptions, toolFilterFor } from '../lib/host/dispatch-tool.js'

const role = (overrides = {}) => ({
  id: 'explorer',
  name: '探索者',
  description: '只读侦察',
  persona: '人设',
  skills: [],
  tools: { allow: [], deny: [] },
  model: { chain: [] },
  maxDepth: 1,
  allowRedelegation: false,
  backgroundMode: 'one-shot',
  ...overrides,
})

test('两边都空时不下发 toolFilter', () => {
  assert.equal(toolFilterFor(role()), undefined)
})

test('声明了技能时，白名单自动补上 skill 并给出诊断', () => {
  const messages = []
  const filter = toolFilterFor(role({ skills: ['repo-survey'], tools: { allow: ['read', 'glob'], deny: [] } }), (m) => messages.push(m))
  assert.deepEqual(filter.allow, ['read', 'glob', 'skill'])
  assert.equal(messages.length, 1)
  assert.match(messages[0], /自动补上 "skill"/)
})

test('没有声明技能时不擅自补 skill', () => {
  const filter = toolFilterFor(role({ tools: { allow: ['read'], deny: [] } }))
  assert.deepEqual(filter.allow, ['read'])
})

test('只有 deny 时原样透传', () => {
  const filter = toolFilterFor(role({ tools: { allow: [], deny: ['pwsh'] } }))
  assert.deepEqual(filter, { deny: ['pwsh'] })
})

test('深度按「刚好允许这一层」计算（父深度 + 1，与角色上限取小）', () => {
  assert.equal(effectiveMaxDepth(role({ maxDepth: 3 }), 0), 1)
  assert.equal(effectiveMaxDepth(role({ maxDepth: 1 }), 0), 1)
  // 0 = 该角色完全禁止被派发
  assert.equal(effectiveMaxDepth(role({ maxDepth: 0 }), 0), 0)
  // 从深度 1 的 agent 派发 → 孩子深度 2
  assert.equal(effectiveMaxDepth(role({ maxDepth: 5 }), 1), 2)
})

test('链首翻译成 agentOptions；空链表示继承父代理', () => {
  assert.equal(headAgentOptions(role()), undefined)
  const options = headAgentOptions(role({ model: { chain: [{ provider: 'p', model: 'm', effort: 'high' }] } }))
  assert.deepEqual(options, { provider: 'p', model: 'm', reasoningEffort: 'high' })
})

test('工具描述带上每个角色的 description（这是主代理选角色的唯一依据）', () => {
  const text = buildToolDescription([role({ id: 'explorer', name: '探索者', description: '只读侦察——需要看代码但不该改东西时用它' })])
  assert.match(text, /- "explorer" \(探索者\): 只读侦察/)
})

test('没有角色时描述明确说不可用', () => {
  assert.match(buildToolDescription([]), /No roles are configured/)
})
