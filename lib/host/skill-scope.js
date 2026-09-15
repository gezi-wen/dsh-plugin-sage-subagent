/**
 * 把角色的「子代理专属技能」注册进该子代理自己的作用域。
 *
 * 机制（已实测）：官方 skill 注册表是分层的，注册落进「调用者 ctx 所属的 scope」。
 * 因此从 `agent.ctx` 里注册的技能，**只有那个 agent 看得见** —— 主代理与兄弟子代理都看不见。
 * 读的时候合并「全局层 ∪ 本作用域链」，近者胜；本插件**只做加法**，不做收窄。
 *
 * 关键约束：注册必须在 `agent/created` 里同步完成 —— 该事件发布在 setup 之后、
 * 首次提示词装配之前，晚一步首次请求的目录就不会带上这些技能。
 */

/**
 * 给一个子代理注册它角色声明的技能。
 *
 * @param {object} scopedCtx - 子代理自己的 ctx（`agent.ctx`）。
 * @param {{ roleId: string, skillNames: string[], pool: object[], onDiagnostic: (message: string) => void }} options
 * @returns {number} 成功注册的技能数。
 */
export function registerRoleSkills(scopedCtx, options) {
  const { roleId, skillNames, pool, onDiagnostic } = options
  if (!Array.isArray(skillNames) || skillNames.length === 0) return 0

  const skills = scopedCtx.get('skills')
  if (skills === undefined) {
    onDiagnostic(`[subagent-roles] 角色 ${roleId} 声明了技能，但 skills 服务不可用，本次跳过`)
    return 0
  }

  const byName = new Map(pool.map((item) => [item.name, item]))
  let registered = 0

  for (const name of skillNames) {
    const skill = byName.get(name)
    if (skill === undefined) {
      // 响亮失败：角色点名了一个技能池里没有的技能。不静默跳过。
      onDiagnostic(`[subagent-roles] 角色 ${roleId} 声明的技能 "${name}" 不在技能池里（跳过）`)
      continue
    }
    try {
      skills.register({
        name: skill.name,
        description: skill.description,
        content: skill.content,
        source: 'runtime',
        ...(skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse }),
      })
      registered += 1
    } catch (error) {
      onDiagnostic(
        `[subagent-roles] 角色 ${roleId} 的技能 "${name}" 注册失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  return registered
}
