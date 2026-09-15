/**
 * 按 agent 取「真实工具集」。
 *
 * 为什么需要它：官方 `tools.restrict()` 是**集合掩码**，不支持通配，而且**未知名会硬抛错**
 * （实测：`tools.restrict() names unknown global tool "…"`）。所以角色配置里的工具名必须在
 * 派发前对着「这个 agent 真实看得见的工具」核一遍，否则子代理创建会被直接否决，
 * 报错还停在官方层，用户很难和角色文件里的笔误对上号。
 */

/**
 * 列出某个 agent 当前可见的工具名。
 *
 * @param {object} ctx - host Cordis context。
 * @param {object} [agent] - viewing scope；省略读全局视图。
 * @returns {string[]} 排序后的工具名；服务不可用时返回空数组。
 */
export function listVisibleToolNames(ctx, agent) {
  const tools = ctx.get('tools')
  if (tools === undefined || typeof tools.schemas !== 'function') return []
  try {
    return tools.schemas(agent).map((schema) => schema.name).sort()
  } catch {
    return []
  }
}

/**
 * 给「工具选择器」用的工具名集合。
 *
 * ⚠️ 别直接用 `listVisibleToolNames(ctx)`（不带 scope）当选择器的数据源 —— 那是**全局视图**，
 * 而官方的 `read` / `grep` / `pwsh` / `web_search` 全都在 **preset（agent）平面**，
 * 全局视图里一个都没有。实测踩过：选择器只列出 12 个工具（全是全局注册的 gui_*），
 * 用户根本选不到真正要用的那些 —— 这正是同类插件被我们否掉的原因之一。
 *
 * 做法：全局视图 ∪ 每个活着 agent 的视图。一个 agent 都没有时退化为全局视图并如实标注。
 *
 * @param {object} ctx - host Cordis context。
 * @returns {{ tools: string[], scope: 'agents'|'global-only' }}
 */
export function listToolNamesForPicker(ctx) {
  const names = new Set(listVisibleToolNames(ctx))
  const agents = ctx.get('agents')
  let sawAgent = false
  if (agents !== undefined && typeof agents.list === 'function') {
    try {
      for (const agent of agents.list()) {
        sawAgent = true
        for (const name of listVisibleToolNames(ctx, agent)) names.add(name)
      }
    } catch {
      // 拿不到 agent 列表就只给全局视图
    }
  }
  return { tools: [...names].sort(), scope: sawAgent ? 'agents' : 'global-only' }
}

/**
 * 校验一组工具名是否都真实存在。
 *
 * @param {string[]} names - 角色声明的工具名。
 * @param {string[]} available - 当前真实可见的工具名。
 * @returns {{ unknown: string[] }}
 */
export function checkToolNames(names, available) {
  const known = new Set(available)
  return { unknown: names.filter((name) => !known.has(name)) }
}
