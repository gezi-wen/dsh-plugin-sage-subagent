/**
 * 角色文件的读写与监听。
 *
 * 这一层是「薄接线 + 一点 I/O 规则」：目录扫描、原子写、变更通知。
 * 所有字段层面的判断都在 shared/role-schema.js，这里不重复。
 */
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { watch } from 'node:fs'
import { join } from 'node:path'
import { parseRole, serializeRole, ROLE_ID_RE } from '../shared/role-schema.js'

/** 角色目录名（挂在 $DSH_HOME 下）。 */
export const ROLES_DIR_NAME = '.agent-roles'

/** 环境变量覆盖：照 SAGE_MEM_DIR 的先例。 */
export const ROLES_DIR_ENV = 'SAGE_AGENT_ROLES_DIR'

/**
 * 解析角色根目录。
 * @param {{ dshHome: string, env?: Record<string, string | undefined> }} options
 * @returns {string} 绝对路径。
 */
export function resolveRolesDir(options) {
  const env = options.env ?? {}
  const override = env[ROLES_DIR_ENV]
  if (typeof override === 'string' && override.trim() !== '') return override.trim()
  return join(options.dshHome, ROLES_DIR_NAME)
}

/** 一个角色的文件路径。 */
export function rolePath(dir, id) {
  return join(dir, `${id}.md`)
}

/** 技能池目录（子代理专属技能）。 */
export function skillPoolDir(dir) {
  return join(dir, 'skills')
}

/** 确保角色目录存在。 */
export async function ensureRolesDir(dir) {
  await mkdir(dir, { recursive: true })
}

const isRoleFile = (name) => name.endsWith('.md') && !name.startsWith('.') && !name.startsWith('_')

/**
 * 扫描并解析整个角色目录。
 *
 * 坏文件不会中断扫描：它进 diagnostics，其余角色照常可用 —— 但**绝不静默**，
 * 调用方必须把 diagnostics 报给用户。
 *
 * @param {string} dir - 角色根目录。
 * @returns {Promise<{ roles: object[], diagnostics: { path: string, id: string, errors: string[], warnings: string[] }[] }>}
 */
export async function loadRoles(dir) {
  const roles = []
  const diagnostics = []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (error) {
    if (error && error.code === 'ENOENT') return { roles, diagnostics }
    throw error
  }

  const files = entries
    .filter((entry) => entry.isFile() && isRoleFile(entry.name))
    .map((entry) => entry.name)
    .sort()

  for (const name of files) {
    const path = join(dir, name)
    const id = name.slice(0, -3)
    let text
    try {
      text = await readFile(path, 'utf8')
    } catch (error) {
      diagnostics.push({ path, id, errors: [`读取失败：${error instanceof Error ? error.message : String(error)}`], warnings: [] })
      continue
    }
    const result = parseRole(text, { id, sourcePath: path })
    if (result.ok) {
      roles.push(result.role)
      if (result.warnings.length > 0) diagnostics.push({ path, id, errors: [], warnings: result.warnings })
    } else {
      diagnostics.push({ path, id, errors: result.errors, warnings: result.warnings })
    }
  }

  return { roles, diagnostics }
}

/**
 * 原子写入一个角色文件（临时文件 + rename）。
 *
 * @param {string} dir - 角色根目录。
 * @param {object} role - 归一化角色对象。
 * @param {{ mode?: 'create' | 'update' }} [options]
 *   `create`（**默认**）在标识已被占用时拒绝；`update` 才允许覆盖已有文件。
 *   默认取严格的那一侧：安全特性不能靠调用方记得传参才生效。
 * @returns {Promise<string>} 写入的绝对路径。
 * @throws 标识被占用时抛错，`error.code === 'ROLE_ID_TAKEN'`，
 *   并带 `error.existing = { id, name, group }`，供界面提示「它已经在哪个组里」。
 */
export async function saveRole(dir, role, options = {}) {
  const mode = options.mode ?? 'create'

  // 路径穿越防线：id 会被直接拼进文件名，不校验的话 "../x" 能写到目录外面去。
  // parseRole 也校验 id，但 saveRole 可能被直接调用，这一层不能省。
  if (!role || typeof role.id !== 'string' || !ROLE_ID_RE.test(role.id)) {
    throw new Error(
      `角色 id ${JSON.stringify(role && role.id)} 不合法：只允许小写字母、数字、连字符，且以字母或数字开头`,
    )
  }

  await ensureRolesDir(dir)
  const target = rolePath(dir, role.id)

  if (mode === 'create') {
    let existingText = null
    try {
      existingText = await readFile(target, 'utf8')
    } catch {
      // 文件不存在 —— 可以新建
    }
    if (existingText !== null) {
      // 这里挡的是**静默覆盖**，不是「重复注册」：新建一个已存在的标识会把那个角色的
      // 文件整个抹掉。只信前端校验不够 —— .md 可以被手改，RPC 也可以被直接调用。
      const parsed = parseRole(existingText, { id: role.id, sourcePath: target })
      const existing = parsed.ok
        ? { id: role.id, name: parsed.role.name, group: parsed.role.group }
        : { id: role.id, name: null, group: null }
      // 组名现在就是显示名，不需要再映射一次
      const where = existing.group ? `它已经在「${existing.group}」组里` : '目录下已有一个同名文件'
      const error = new Error(`标识 ${role.id} 已被占用：${where}`)
      error.code = 'ROLE_ID_TAKEN'
      error.existing = existing
      throw error
    }
  }

  const tmp = `${target}.tmp-${process.pid}`
  await writeFile(tmp, serializeRole(role), 'utf8')
  await rename(tmp, target)
  return target
}

/**
 * 首次使用时，把插件内置的默认角色铺进角色目录。
 *
 * **只在目录不存在、或一个角色文件都没有的时候才铺。** 刻意不做「缺哪个补哪个」：
 * 用户删掉某个内置角色是他的明确意图，下次启动又把它塞回来是骚扰。
 * 反过来，已经有角色（哪怕只有一个）就完全不动 —— 所以也绝不会覆盖任何人的文件。
 *
 * 铺的时候是**原样复制**、不走 serializeRole：默认角色的文件本身就是手写的最终形态，
 * 再序列化一遍只会把注释和字段顺序洗掉。
 *
 * @param {string} dir - 角色根目录。
 * @param {string} defaultsDir - 插件包内的 defaults/roles。
 * @returns {Promise<{ seeded: number, skipped: boolean, reason?: string }>}
 */
export async function seedDefaultRoles(dir, defaultsDir) {
  try {
    const entries = await readdir(dir)
    if (entries.some((name) => isRoleFile(name))) return { seeded: 0, skipped: true }
  } catch (error) {
    if (!error || error.code !== 'ENOENT') throw error
    // 目录还不存在 —— 继续往下铺
  }

  let files
  try {
    files = (await readdir(defaultsDir)).filter((name) => name.endsWith('.md')).sort()
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { seeded: 0, skipped: false, reason: '插件包里没有 defaults/roles 目录' }
    }
    throw error
  }
  if (files.length === 0) return { seeded: 0, skipped: false, reason: 'defaults/roles 是空的' }

  await ensureRolesDir(dir)
  for (const name of files) {
    await writeFile(join(dir, name), await readFile(join(defaultsDir, name), 'utf8'), 'utf8')
  }
  return { seeded: files.length, skipped: false }
}

/**
 * 删除一个角色文件。不存在时视为成功（幂等）。
 * @returns {Promise<boolean>} 是否真的删掉了文件。
 */
export async function removeRole(dir, id) {
  const target = rolePath(dir, id)
  try {
    await stat(target)
  } catch {
    return false
  }
  await rm(target)
  return true
}

/**
 * 监听角色目录的变化（新增 / 修改 / 删除），带去抖。
 *
 * 手改文件是本插件的一等用法，所以热重载不是可选项。
 *
 * @param {string} dir - 角色根目录。
 * @param {() => void} onChange - 去抖后的回调。
 * @param {{ debounceMs?: number }} [options]
 * @returns {() => void} 停止监听的 disposer。
 */
export function watchRoles(dir, onChange, options = {}) {
  const debounceMs = options.debounceMs ?? 200
  let timer
  let watcher
  let closed = false

  const schedule = () => {
    if (closed) return
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      onChange()
    }, debounceMs)
  }

  try {
    watcher = watch(dir, { persistent: false }, schedule)
  } catch {
    // 目录还不存在等情况：不监听，由调用方在创建目录后重试。
    return () => {}
  }

  return () => {
    closed = true
    if (timer !== undefined) clearTimeout(timer)
    if (watcher !== undefined) watcher.close()
  }
}
