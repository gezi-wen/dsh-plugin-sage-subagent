/**
 * 子代理专属技能池的扫描。
 *
 * 布局：`<角色根目录>/skills/<技能名>/SKILL.md`
 *
 * 这些技能**只注册进子代理自己的作用域**（见 host/skill-scope.js），
 * 所以主代理与其他子代理看不见。这里只负责把磁盘上的正文读出来，
 * 注册的事不归它管。
 */
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { splitFrontmatter, SKILL_NAME_RE } from '../shared/role-schema.js'

/** 技能定义文件名。 */
export const SKILL_FILE = 'SKILL.md'

/**
 * 解析一份 SKILL.md 的 frontmatter（复用角色那套拆分逻辑）。
 * @param {string} text
 * @returns {{ name?: string, description?: string, whenToUse?: string, content: string }}
 */
export function parseSkillFile(text) {
  const { frontmatter, body } = splitFrontmatter(text)
  const meta = {}
  if (frontmatter !== undefined) {
    // 只取我们认识的三个键；技能 frontmatter 允许有别的字段（比如官方技能的扩展），
    // 所以这里不像角色那样对未知键报错。
    for (const line of frontmatter.split('\n')) {
      const match = /^(name|description|whenToUse):\s*(.*)$/.exec(line.trim())
      if (match === null) continue
      let value = match[2].trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      meta[match[1]] = value
    }
  }
  return { ...meta, content: body.trim() }
}

/**
 * 扫描技能池。
 * @param {string} dir - 技能池目录（通常是 `<角色根目录>/skills`）。
 * @returns {Promise<{ skills: object[], diagnostics: { name: string, path: string, errors: string[] }[] }>}
 */
export async function scanSkillPool(dir) {
  const skills = []
  const diagnostics = []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (error) {
    if (error && error.code === 'ENOENT') return { skills, diagnostics }
    throw error
  }

  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = entry.name
    const path = join(dir, name, SKILL_FILE)
    if (!SKILL_NAME_RE.test(name)) {
      diagnostics.push({ name, path, errors: [`技能目录名 "${name}" 不合法：只允许小写字母、数字、连字符`] })
      continue
    }
    let text
    try {
      text = await readFile(path, 'utf8')
    } catch {
      diagnostics.push({ name, path, errors: [`缺少 ${SKILL_FILE}`] })
      continue
    }
    const parsed = parseSkillFile(text)
    const errors = []
    if (typeof parsed.description !== 'string' || parsed.description.trim() === '') {
      errors.push('SKILL.md 的 frontmatter 必须有 description（它进技能目录，是模型决定要不要加载它的唯一依据）')
    }
    if (parsed.content === '') errors.push('SKILL.md 的正文不能为空')
    if (errors.length > 0) {
      diagnostics.push({ name, path, errors })
      continue
    }
    skills.push({
      name: parsed.name && parsed.name.trim() !== '' ? parsed.name.trim() : name,
      description: parsed.description.trim(),
      ...(parsed.whenToUse ? { whenToUse: parsed.whenToUse } : {}),
      content: parsed.content,
      path,
    })
  }

  return { skills, diagnostics }
}
