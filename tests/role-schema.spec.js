/**
 * role-schema 的单测：只测纯逻辑，不碰文件系统、不碰 Cordis。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRole, serializeRole, splitFrontmatter, DEFAULT_MAX_DEPTH } from '../lib/shared/role-schema.js'

const goodText = `---
name: 探索者
description: 只读侦察——需要看代码但不该改任何东西时用它。
skills:
  - repo-survey
tools:
  allow:
    - read
    - glob
model:
  chain:
    - provider: deepseek-official
      model: deepseek-flash
    - provider: deepseek-official
      model: deepseek-v4-pro
      effort: high
maxDepth: 1
allowRedelegation: false
backgroundMode: one-shot
---
你是「探索者」，只读侦察。`

test('splitFrontmatter 拆出元数据与正文', () => {
  const { frontmatter, body } = splitFrontmatter(goodText)
  assert.match(frontmatter, /name: 探索者/)
  assert.equal(body.trim(), '你是「探索者」，只读侦察。')
})

test('合法角色解析成功并补齐默认值', () => {
  const result = parseRole(goodText, { id: 'explorer', sourcePath: 'x.md' })
  assert.equal(result.ok, true, result.errors.join('; '))
  const role = result.role
  assert.equal(role.id, 'explorer')
  assert.equal(role.name, '探索者')
  assert.deepEqual(role.skills, ['repo-survey'])
  assert.deepEqual(role.tools.allow, ['read', 'glob'])
  assert.equal(role.model.chain.length, 2)
  assert.equal(role.model.chain[1].effort, 'high')
  assert.equal(role.maxDepth, 1)
  assert.equal(role.allowRedelegation, false)
  assert.equal(role.backgroundMode, 'one-shot')
  assert.equal(role.sourcePath, 'x.md')
})

test('省略可选字段时用默认值', () => {
  const minimal = '---\nname: 甲\ndescription: 乙\n---\n正文'
  const result = parseRole(minimal, { id: 'a' })
  assert.equal(result.ok, true, result.errors.join('; '))
  assert.equal(result.role.maxDepth, DEFAULT_MAX_DEPTH)
  assert.deepEqual(result.role.skills, [])
  assert.deepEqual(result.role.tools, { allow: [], deny: [] })
  assert.deepEqual(result.role.model.chain, [])
})

test('未知 frontmatter 键响亮失败（不静默丢弃）', () => {
  const text = '---\nname: 甲\ndescription: 乙\nmodle: {}\n---\n正文'
  const result = parseRole(text, { id: 'a' })
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((e) => e.includes('未知字段 "modle"')))
})

test('缺 description 失败并说明它是干什么用的', () => {
  const result = parseRole('---\nname: 甲\n---\n正文', { id: 'a' })
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((e) => e.includes('description 必填')))
})

test('正文为空失败', () => {
  const result = parseRole('---\nname: 甲\ndescription: 乙\n---\n   \n', { id: 'a' })
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((e) => e.includes('正文')))
})

test('非法 id 失败', () => {
  const result = parseRole(goodText, { id: 'Explorer' })
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((e) => e.includes('不合法')))
})

test('tools 里的通配符被拦下（官方 restrict 只接受精确名）', () => {
  const text = '---\nname: 甲\ndescription: 乙\ntools:\n  allow:\n    - "mcp__playwright__*"\n---\n正文'
  const result = parseRole(text, { id: 'a' })
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((e) => e.includes('通配符')))
})

test('maxDepth 非负整数校验 + 0 给出警示', () => {
  const bad = parseRole('---\nname: 甲\ndescription: 乙\nmaxDepth: -1\n---\n正文', { id: 'a' })
  assert.equal(bad.ok, false)

  const zero = parseRole('---\nname: 甲\ndescription: 乙\nmaxDepth: 0\n---\n正文', { id: 'a' })
  assert.equal(zero.ok, true)
  assert.ok(zero.warnings.some((w) => w.includes('完全派不出去')))
  // 停用的正规开关是 enabled，不是 maxDepth —— 文案里必须把这点指出来
  assert.ok(zero.warnings.some((w) => w.includes('enabled: false')))
})

test('技能名 kebab-case 校验', () => {
  const result = parseRole('---\nname: 甲\ndescription: 乙\nskills:\n  - BadName\n---\n正文', { id: 'a' })
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((e) => e.includes('技能名')))
})

test('allowRedelegation: true 被硬性拒绝（层层分包不可表达）', () => {
  const result = parseRole('---\nname: 甲\ndescription: 乙\nallowRedelegation: true\n---\n正文', { id: 'a' })
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((e) => e.includes('不被允许')))
})

test('allowRedelegation: false 仍可写（老文件不作废）', () => {
  const result = parseRole('---\nname: 甲\ndescription: 乙\nallowRedelegation: false\n---\n正文', { id: 'a' })
  assert.equal(result.ok, true, result.errors.join('; '))
})

test('maxDepth > 1 给出「无实际作用」的警示', () => {
  const result = parseRole('---\nname: 甲\ndescription: 乙\nmaxDepth: 3\n---\n正文', { id: 'a' })
  assert.equal(result.ok, true, result.errors.join('; '))
  assert.ok(result.warnings.some((w) => w.includes('没有实际作用')))
})

test('工具白名单漏掉 skill 时给出警示（技能目录会整体消失）', () => {
  const text = '---\nname: 甲\ndescription: 乙\nskills:\n  - foo\ntools:\n  allow:\n    - read\n---\n正文'
  const result = parseRole(text, { id: 'a' })
  assert.equal(result.ok, true, result.errors.join('; '))
  assert.ok(result.warnings.some((w) => w.includes('skill')))
})

test('model.chain 里的非法条目被报出', () => {
  const text = '---\nname: 甲\ndescription: 乙\nmodel:\n  chain:\n    - provider: p\n---\n正文'
  const result = parseRole(text, { id: 'a' })
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((e) => e.includes('model.chain[0].model 必填')))
})

test('serializeRole 与 parseRole 往返一致', () => {
  const first = parseRole(goodText, { id: 'explorer' })
  assert.equal(first.ok, true, first.errors.join('; '))
  const text = serializeRole(first.role)
  const second = parseRole(text, { id: 'explorer' })
  assert.equal(second.ok, true, second.errors.join('; '))
  assert.deepEqual(second.role, first.role)
})

test('group 是自由值：任何像个名字的值都行（组是派生出来的，不是白名单）', () => {
  for (const name of ["我的项目", "engineering", "论文-2026", 'a']) {
    const r = parseRole(`---\nname: 甲\ndescription: 乙\ngroup: ${name}\n---\n正文`, { id: 'a' })
    assert.equal(r.ok, true, r.errors.join('; '))
    assert.equal(r.role.group, name)
  }
})

test('group 的形状约束：空值 / 超长 / 控制字符被拦', () => {
  const blank = parseRole('---\nname: 甲\ndescription: 乙\ngroup: "   "\n---\n正文', { id: 'a' })
  assert.equal(blank.ok, false)
  assert.ok(blank.errors.some((e) => e.includes('group')))

  const long = parseRole(`---\nname: 甲\ndescription: 乙\ngroup: ${'x'.repeat(40)}\n---\n正文`, { id: 'a' })
  assert.equal(long.ok, false)
  assert.ok(long.errors.some((e) => e.includes('最长')))
})

test('group 缺省归入默认组并提示；首尾空白被 trim 掉并提示', () => {
  const missing = parseRole('---\nname: 甲\ndescription: 乙\n---\n正文', { id: 'a' })
  assert.equal(missing.ok, true, missing.errors.join('; '))
  assert.equal(missing.role.group, '工程实践')
  assert.ok(missing.warnings.some((w) => w.includes('工程实践')))

  // 手滑多打了空格：trim 掉（不报错），但要说一声 —— 否则「工程实践」和「工程实践 」
  // 会变成两个看起来一样的组
  const padded = parseRole('---\nname: 甲\ndescription: 乙\ngroup: " 审查把关 "\n---\n正文', { id: 'a' })
  assert.equal(padded.ok, true, padded.errors.join('; '))
  assert.equal(padded.role.group, '审查把关')
  assert.ok(padded.warnings.some((w) => w.includes('空白')))
})

test('enabled 是停用的唯一真值，默认 true', () => {
  const on = parseRole('---\nname: 甲\ndescription: 乙\ngroup: review\n---\n正文', { id: 'a' })
  assert.equal(on.role.enabled, true)

  const off = parseRole('---\nname: 甲\ndescription: 乙\ngroup: review\nenabled: false\n---\n正文', { id: 'a' })
  assert.equal(off.role.enabled, false)

  const bad = parseRole('---\nname: 甲\ndescription: 乙\nenabled: nope\n---\n正文', { id: 'a' })
  assert.equal(bad.ok, false)
  assert.ok(bad.errors.some((e) => e.includes('enabled')))
})

test('serializeRole：group 总是写出；enabled 只在 false 时写出', () => {
  const on = parseRole('---\nname: 甲\ndescription: 乙\ngroup: review\n---\n正文', { id: 'a' })
  const textOn = serializeRole(on.role)
  assert.match(textOn, /group: review/)
  assert.ok(!textOn.includes('enabled'), '默认启用不写出来，免得每个文件都多一行')

  const off = parseRole('---\nname: 甲\ndescription: 乙\ngroup: review\nenabled: false\n---\n正文', { id: 'a' })
  assert.match(serializeRole(off.role), /enabled: false/)
})
