/**
 * role-store / skill-pool 的单测：只碰临时目录，不碰 DSH、不碰 Cordis。
 *
 * 覆盖的关键行为：
 *   - 坏文件不中断整批扫描（其余角色照常可用），但一定进 diagnostics
 *   - 原子写入可往返
 *   - 删除幂等
 *   - 缺少目录时返回空结果而不是抛错
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadRoles, saveRole, removeRole, rolePath, seedDefaultRoles, skillPoolDir } from '../lib/host/role-store.js'
import { scanSkillPool } from '../lib/host/skill-pool.js'

async function withTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'roles-test-'))
  try {
    await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

const roleText = (name, description = '何时用它') => `---\nname: ${name}\ndescription: ${description}\ngroup: 工程实践\n---\n人设正文`

test('缺少目录时返回空结果而不是抛错', async () => {
  await withTempDir(async (dir) => {
    const result = await loadRoles(join(dir, 'nope'))
    assert.deepEqual(result.roles, [])
    assert.deepEqual(result.diagnostics, [])
  })
})

test('坏文件不中断整批扫描，且进 diagnostics', async () => {
  await withTempDir(async (dir) => {
    await writeFile(join(dir, 'good.md'), roleText('好角色'), 'utf8')
    await writeFile(join(dir, 'broken.md'), '---\nname: 缺描述\n---\n正文', 'utf8')
    await writeFile(join(dir, '_ignored.md'), roleText('下划线跳过'), 'utf8')
    await writeFile(join(dir, 'notes.txt'), '不是角色文件', 'utf8')

    const { roles, diagnostics } = await loadRoles(dir)
    assert.equal(roles.length, 1)
    assert.equal(roles[0].id, 'good')
    assert.equal(diagnostics.length, 1)
    assert.equal(diagnostics[0].id, 'broken')
    assert.ok(diagnostics[0].errors.some((e) => e.includes('description 必填')))
  })
})

test('saveRole 原子写入后可往返读回', async () => {
  await withTempDir(async (dir) => {
    const role = {
      id: 'explorer',
      name: '探索者',
      description: '只读侦察',
      persona: '你是探索者。',
      skills: ['repo-survey'],
      tools: { allow: ['read'], deny: [] },
      model: { chain: [{ provider: 'p', model: 'm' }] },
      maxDepth: 1,
      allowRedelegation: false,
      backgroundMode: 'one-shot',
    }
    const written = await saveRole(dir, role)
    assert.equal(written, rolePath(dir, 'explorer'))
    const text = await readFile(written, 'utf8')
    assert.match(text, /name: 探索者/)

    const { roles, diagnostics } = await loadRoles(dir)
    // 这个角色既收了工具白名单又带技能 → 应当只有「白名单漏掉 skill」的警示，没有错误。
    assert.equal(diagnostics.filter((item) => item.errors.length > 0).length, 0)
    assert.ok(diagnostics.some((item) => item.warnings.some((w) => w.includes('skill'))))
    assert.equal(roles.length, 1)
    assert.deepEqual(roles[0].skills, ['repo-survey'])
    assert.equal(roles[0].persona, '你是探索者。')
  })
})

test('removeRole 幂等', async () => {
  await withTempDir(async (dir) => {
    await saveRole(dir, {
      id: 'a', name: '甲', description: '乙', persona: '正文',
      skills: [], tools: { allow: [], deny: [] }, model: { chain: [] },
      maxDepth: 1, allowRedelegation: false, backgroundMode: 'one-shot',
    })
    assert.equal(await removeRole(dir, 'a'), true)
    assert.equal(await removeRole(dir, 'a'), false)
  })
})

test('技能池：合法技能入列，坏技能进 diagnostics', async () => {
  await withTempDir(async (dir) => {
    const pool = skillPoolDir(dir)
    await mkdir(join(pool, 'repo-survey'), { recursive: true })
    await writeFile(
      join(pool, 'repo-survey', 'SKILL.md'),
      '---\nname: repo-survey\ndescription: 快速摸清一个仓库的骨架\n---\n先看目录再看入口。',
      'utf8',
    )
    await mkdir(join(pool, 'no-desc'), { recursive: true })
    await writeFile(join(pool, 'no-desc', 'SKILL.md'), '---\nname: no-desc\n---\n正文', 'utf8')
    await mkdir(join(pool, 'empty-body'), { recursive: true })
    await writeFile(join(pool, 'empty-body', 'SKILL.md'), '---\ndescription: 有描述没正文\n---\n', 'utf8')
    await mkdir(join(pool, 'missing-file'), { recursive: true })

    const { skills, diagnostics } = await scanSkillPool(pool)
    assert.equal(skills.length, 1)
    assert.equal(skills[0].name, 'repo-survey')
    assert.match(skills[0].content, /先看目录/)
    assert.equal(diagnostics.length, 3)
  })
})

test('seedDefaultRoles：空目录铺默认集，已有角色则完全不动', async () => {
  await withTempDir(async (dir) => {
    const rolesDir = join(dir, 'roles')
    const defaultsDir = join(dir, 'defaults')
    await mkdir(defaultsDir, { recursive: true })
    await writeFile(join(defaultsDir, 'a.md'), roleText('甲'), 'utf8')
    await writeFile(join(defaultsDir, 'b.md'), roleText('乙'), 'utf8')

    // 角色目录还不存在 —— 铺
    const first = await seedDefaultRoles(rolesDir, defaultsDir)
    assert.equal(first.seeded, 2)
    assert.equal((await loadRoles(rolesDir)).roles.length, 2)

    // 删掉一个内置角色后重启：**不能**把它塞回来（那是用户的明确意图），也不补缺
    await rm(join(rolesDir, 'b.md'))
    const second = await seedDefaultRoles(rolesDir, defaultsDir)
    assert.equal(second.seeded, 0)
    assert.equal(second.skipped, true)
    assert.equal((await loadRoles(rolesDir)).roles.length, 1, '删掉的内置角色不该被塞回来')
  })
})

test('seedDefaultRoles：插件包里没有 defaults 目录时给出原因而不是抛错', async () => {
  await withTempDir(async (dir) => {
    const result = await seedDefaultRoles(join(dir, 'roles'), join(dir, 'nope'))
    assert.equal(result.seeded, 0)
    assert.equal(result.skipped, false)
    assert.match(result.reason, /defaults/)
  })
})
