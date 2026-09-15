/**
 * dsh-plugin-sage-subagent — host half.
 *
 * 这一层只做装配：定位角色目录、扫描、监听变更、注册委派工具、装逐 agent 处理器。
 * 业务判断在 lib/shared/，其余各自成模块（见 README「模块规则」）。
 *
 * 阶段说明：Phase 2（派发主链）。共存模式已通；接管开关与模型链回退在 Phase 3。
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ensureRolesDir,
  loadRoles,
  resolveRolesDir,
  seedDefaultRoles,
  skillPoolDir,
  watchRoles,
} from './host/role-store.js'
import { scanSkillPool } from './host/skill-pool.js'
import { buildDispatchTool } from './host/dispatch-tool.js'
import { createRoleDispatchRegistry, installAgentHandlers } from './host/agent-inject.js'
import { registerRpc } from './host/rpc.js'

export const name = 'subagent-roles'

/**
 * 硬依赖。
 *
 * `tools`：注册委派工具。
 * `subagents`：派发要用 `ctx.subagents.start()` / `startContinuable()`。
 *   Cordis 的守卫会拦下「未声明就访问服务」（实测报错 `cannot get property "subagents"
 *   without inject`），所以这两个必须显式写出来 —— 委派是本插件的核心能力，
 *   缺失时应让插件停在 waiting，而不是半死不活。
 */
export const inject = ['tools', 'subagents']

/**
 * 共存模式下的工具名。
 *
 * Phase 3 会把它变成设置项（`subagent-roles.control.mode`）：共存 = `delegate` 全局注册，
 * 接管 = `subagent` 逐顶层 agent 影子官方那一份。
 */
const TOOL_NAME = 'delegate'

/** 当前生效的模式。Phase 3 接入设置命名空间后改由它驱动。 */
const MODE = 'coexist'

/**
 * 解析 $DSH_HOME。
 * @param {object} ctx - Cordis context。
 * @returns {string}
 */
function resolveDshHome(ctx) {
  const resolver = ctx.get('dshHomePath')
  if (typeof resolver === 'function') {
    try {
      const home = resolver()
      if (typeof home === 'string' && home.trim() !== '') return home
    } catch {
      // 某些组装下这个解析器不接受空参调用：忽略，走下面的回退。
    }
  }
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv.trim()
  return join(homedir(), '.dsh')
}

/**
 * 插件主体。
 * @param {object} ctx - host Cordis context。
 */
export function apply(ctx) {
  const dshHome = resolveDshHome(ctx)
  const rolesDir = resolveRolesDir({ dshHome, env: process.env })
  const skillsDir = skillPoolDir(rolesDir)
  // 插件包内置的默认角色。用 import.meta.url 定位，不依赖进程 CWD。
  const defaultsDir = fileURLToPath(new URL('../defaults/roles', import.meta.url))

  const state = { dshHome, rolesDir, skillsDir, roles: [], diagnostics: [], skills: [], skillDiagnostics: [] }
  const registry = createRoleDispatchRegistry()

  const onDiagnostic = (message) => {
    console.error(message)
  }

  const listRoles = () => state.roles

  const reload = async (reason) => {
    const rolesResult = await loadRoles(rolesDir)
    const skillsResult = await scanSkillPool(skillsDir)
    state.roles = rolesResult.roles
    state.diagnostics = rolesResult.diagnostics
    state.skills = skillsResult.skills
    state.skillDiagnostics = skillsResult.diagnostics

    // 坏文件绝不静默：逐条报到日志，带文件路径。
    for (const item of state.diagnostics) {
      if (item.errors.length > 0) onDiagnostic(`[subagent-roles] 角色文件有误 ${item.path}: ${item.errors.join('; ')}`)
      for (const warning of item.warnings) onDiagnostic(`[subagent-roles] ${item.path}: ${warning}`)
    }
    for (const item of state.skillDiagnostics) {
      onDiagnostic(`[subagent-roles] 技能池有误 ${item.path}: ${item.errors.join('; ')}`)
    }

    ctx.logger.info(
      `[subagent-roles] apply() 已加载（${reason}）：角色 ${state.roles.length} 个、专属技能 ${state.skills.length} 个、目录 ${rolesDir}`,
    )
    // 终端横幅：ctx.logger 的输出不进 stdout（只上 Web 日志面），而
    // 「插件到底加载没有」必须能在进程输出里一眼看到 —— 三级验证就靠这一行。
    console.log(
      `[subagent-roles] loaded reason=${reason} roles=${state.roles.length} skills=${state.skills.length} dir=${rolesDir}`,
    )
  }

  // ── 委派工具 ────────────────────────────────────────────────────────
  // 全局注册（共存模式）：顶层 agent 自然看得见；子代理那边由 agent-inject 的
  // deny 规则按角色收回。描述用 getter 生成，所以角色表一变，模型看到的清单就是新的，
  // 不需要重新注册。
  let buildTool = () => buildDispatchTool({ ctx, listRoles, registry, onDiagnostic, toolName: TOOL_NAME })
  ctx.inject(['tools'], (scoped) => {
    scoped.tools.register(buildTool())
  })

  // ── 逐 agent 注入 + 反后门 ──────────────────────────────────────────
  installAgentHandlers({
    ctx,
    state,
    registry,
    listRoles,
    toolName: TOOL_NAME,
    mode: MODE,
    onDiagnostic,
    buildTool: () => buildTool(),
  })

  // ── 浏览器可读的 RPC 面（角色表 / 读写 / 模型与工具目录）────────────
  registerRpc(ctx, { state, onDiagnostic, reload })

  // ── 角色表加载与热重载 ──────────────────────────────────────────────
  void (async () => {
    try {
      await ensureRolesDir(rolesDir)
      // 只在目录里一个角色都没有时才铺默认集。已有角色就完全不动 —— 绝不覆盖任何人的文件，
      // 也不会把用户删掉的内置角色又塞回来（见 seedDefaultRoles 的说明）。
      const seed = await seedDefaultRoles(rolesDir, defaultsDir)
      if (seed.seeded > 0) {
        console.log(`[subagent-roles] 首次使用：已铺 ${seed.seeded} 个默认角色到 ${rolesDir}`)
      } else if (seed.reason) {
        onDiagnostic(`[subagent-roles] 未铺默认角色：${seed.reason}`)
      }
      await reload('startup')
    } catch (error) {
      onDiagnostic(`[subagent-roles] 启动加载失败：${error instanceof Error ? error.message : String(error)}`)
    }
  })()

  ctx.effect(() => watchRoles(rolesDir, () => {
    void reload('watch').catch((error) => {
      onDiagnostic(`[subagent-roles] 重载失败：${error instanceof Error ? error.message : String(error)}`)
    })
  }), 'subagent-roles.watch')
}
