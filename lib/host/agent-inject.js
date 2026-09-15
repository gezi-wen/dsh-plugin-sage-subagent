/**
 * 逐 agent 的注入与「反后门」规则。
 *
 * 这是全插件最容易写出安全事故的一层，所以规则写死在这里：
 *
 *   1. **只向顶层 agent 注入委派工具**（接管模式下影子官方 `subagent`）。
 *      子代理永远不通过我们获得委派能力。
 *   2. 子代理若 `allowRedelegation: false`，主动把它**继承到的**委派工具 deny 掉。
 *      之所以必须主动做：官方 `tools.restrict()` 明确**不过滤本作用域自己的注册**，
 *      而「继承到的工具」正是 restrict 能管的那部分 —— 这是官方设计（要保住委派机制本身），
 *      所以「谁注入、谁负责收回」是插件自己的责任。同类插件正是在这里翻的车：
 *      它无条件往每个 agent 注入委派工具，结果角色白名单形同虚设。
 *   3. **绝不把 `restrict()` 对齐到本作用域的注册** —— 官方对未知名与本层名都会硬抛错。
 *      所以 deny 之前先看这个名字对该 agent 是否真的可见。
 */
import { registerRoleSkills } from './skill-scope.js'
import { installChainFailover } from './chain-hook.js'
import { DEFAULT_SWITCH_ON } from '../shared/model-chain.js'

/** 官方可能存在的委派工具名；接管模式下我们的工具名就是 `subagent`。 */
const OFFICIAL_DELEGATION_TOOLS = ['subagent', 'subagent_fork']

/**
 * 「待派发登记表」：父代理即将生出哪个角色的子代理。
 *
 * 为什么需要它：角色专属技能必须在 `agent/created` 里注册（那是唯一赶在首次提示词装配
 * 之前的钩子），但那个事件只给一个 `agent`，不说它是为哪个角色生的。父会话 id 是能在
 * 子会话 header 上读到的（`header.parentSession`），所以按父会话 id 排队。
 *
 * 派发工具刻意不声明 `isConcurrencySafe`，调度器按独占处理 —— 同一父代理的派发是串行的，
 * 因此 FIFO 取值是确定的。
 * @returns {{ push: Function, take: Function, size: Function }}
 */
export function createRoleDispatchRegistry() {
  const pending = new Map()
  return {
    push(parentId, roleId) {
      const queue = pending.get(parentId) ?? []
      queue.push(roleId)
      pending.set(parentId, queue)
    },
    take(parentId) {
      const queue = pending.get(parentId)
      if (queue === undefined || queue.length === 0) return undefined
      const roleId = queue.shift()
      if (queue.length === 0) pending.delete(parentId)
      return roleId
    },
    size() {
      let total = 0
      for (const queue of pending.values()) total += queue.length
      return total
    },
  }
}

/**
 * 读一个 agent 的委派深度与来源。
 * @param {object} agent
 * @returns {{ depth: number, isChild: boolean, parentSession: string | undefined }}
 */
export function readAgentLineage(agent) {
  const header = agent.session.header
  const depth = typeof header.delegationDepth === 'number' ? header.delegationDepth : 0
  return {
    depth,
    isChild: header.origin === 'subagent' || depth > 0,
    parentSession: header.parentSession === undefined ? undefined : String(header.parentSession),
  }
}

/**
 * 「不许再往下派」的主闸门：在该子代理自己的 ctx 上注册一个 guard。
 *
 * 为什么必须是 guard（实测教训，两条都验过）：
 *   - `maxDepth` 只是「我这一次创建的孩子」的上限，管不到那个孩子以后自己派谁 ——
 *     实测 maxDepth=1 的子代理照样成功派出了孙代理；
 *   - `tools.restrict()` 删不掉官方委派工具，因为它注册在 agent 本层，
 *     官方明确「restriction 只过滤继承来的工具，永不过滤本层自己的注册」。
 *
 * 官方为此提供了 `guard()`：注册在 `agent.ctx` 上只对该 agent 生效，命中即否决调用，
 * 与工具注册在哪一层无关。这就是「谁注入、谁负责收回」的正确形态。
 *
 * @returns {string[]} 实际被 guard 覆盖的工具名（从该 agent 当前可见工具里推出来的）。
 */
function installDelegationGuard(agent, toolName, onDiagnostic) {
  const tools = agent.ctx.get('tools')
  if (tools === undefined || typeof tools.guard !== 'function') {
    onDiagnostic('[subagent-roles] 注册委派 guard 失败：tools.guard 不可用')
    return []
  }

  // ⚠️ 判定必须是**调用时刻的动态判断**，不能预先算黑名单。
  // 实测踩过：官方委派工具是「逐 agent、稍后注册」的，`agent/created` 那一刻的快照里
  // 可能只有 `subagent_fork` 而没有 `subagent` —— 按快照算的黑名单会漏掉主入口，
  // 子代理照样能派孙代理（实测：确实派成功了）。
  // 所以：任何以 `subagent` 开头的工具名 + 我们自己的工具名，一律否决。
  const isDelegationTool = (name) => name === toolName || name.startsWith('subagent')

  try {
    agent.ctx.inject(['tools'], (scoped) => {
      scoped.tools.guard((execution) => {
        const name = execution && execution.name
        if (typeof name !== 'string' || name === '') return undefined
        if (!isDelegationTool(name)) return undefined
        console.log(`[subagent-roles] guard DENIED ${name} for ${String(agent.id)}`)
        return '本角色不允许再往下派子代理（allowRedelegation: false）'
      })
    })
    return [toolName, 'subagent*']
  } catch (error) {
    onDiagnostic(
      `[subagent-roles] 注册委派 guard 失败：${error instanceof Error ? error.message : String(error)}`,
    )
    return []
  }
}

/**
 * 次闸门：收回**我们自己注册的**委派工具（少一个可见的诱因）。
 * @returns {string[]} 实际被 deny 的工具名。
 */
function revokeDelegationTools(agent, toolName, onDiagnostic) {
  const tools = agent.ctx.get('tools')
  if (tools === undefined || typeof tools.schemas !== 'function') {
    onDiagnostic(`[subagent-roles] 收回委派工具：tools 服务不可用（typeof=${typeof tools}）`)
    return []
  }

  let visible
  try {
    visible = tools.schemas(agent).map((schema) => schema.name)
  } catch (error) {
    onDiagnostic(`[subagent-roles] 读取子代理工具表失败：${error instanceof Error ? error.message : String(error)}`)
    return []
  }

  // ⚠️ 边界（Phase 0 实测）：官方 `tools.restrict()` **不过滤本作用域自己的注册**。
  // 官方委派工具 `subagent` 是逐 agent 注册进各自 `agent.ctx` 的，所以从同一个 ctx 里
  // 既删不掉它、把它写进 filter 还会抛错。因此：
  //   - 「不许再往下派」真正生效的机制是**深度上限**（见 dispatch-tool 的 maxDepth 封顶），
  //     官方会在派发时响亮拒绝；
  //   - 这里只收回我们自己**全局注册**的那个工具名 —— 它属于「继承来的工具」，
  //     正是 restrict 管得着的部分。
  const toDeny = visible.includes(toolName) ? [toolName] : []
  const officialStillVisible = OFFICIAL_DELEGATION_TOOLS.filter((name) => visible.includes(name))
  if (officialStillVisible.length > 0) {
    onDiagnostic(
      `[subagent-roles] 注意：${officialStillVisible.join(', ')} 仍对该子代理可见`
      + '（官方委派工具注册在 agent 本层，工具过滤删不掉）；「不许再往下派」由深度上限封顶生效',
    )
  }
  onDiagnostic(`[subagent-roles] 收回委派工具：visible=${visible.length} deny=[${toDeny.join(',')}]`)
  if (toDeny.length === 0) return []

  try {
    agent.ctx.tools.restrict({ deny: toDeny })
    return toDeny
  } catch (error) {
    onDiagnostic(
      `[subagent-roles] 收回子代理的委派工具失败（${toDeny.join(', ')}）：${error instanceof Error ? error.message : String(error)}`,
    )
    return []
  }
}

/**
 * 装 `agent/created` 处理器。
 *
 * @param {object} options
 * @param {object} options.ctx - host Cordis context。
 * @param {object} options.state - 插件状态（含 roles / skills）。
 * @param {object} options.registry - 待派发登记表。
 * @param {() => object[]} options.listRoles
 * @param {string} options.toolName - 我们注册的委派工具名。
 * @param {'coexist' | 'takeover'} options.mode
 * @param {(message: string) => void} options.onDiagnostic
 */
export function installAgentHandlers(options) {
  const { ctx, state, registry, listRoles, toolName, mode, onDiagnostic } = options

  ctx.on('agent/created', (payload) => {
    const agent = payload && payload.agent
    if (!agent) return

    let lineage
    try {
      lineage = readAgentLineage(agent)
    } catch (error) {
      onDiagnostic(`[subagent-roles] 读取 agent lineage 失败：${error instanceof Error ? error.message : String(error)}`)
      return
    }

    // ── 子代理：注册角色专属技能 + 按需收回委派工具 ──────────────────
    if (lineage.isChild) {
      const roleId = lineage.parentSession === undefined ? undefined : registry.take(lineage.parentSession)
      const role = roleId === undefined ? undefined : listRoles().find((item) => item.id === roleId)

      if (role === undefined) {
        // 不是我们派出去的子代理（别的插件/官方工具派的）：不碰它。
        return
      }

      if (role.skills.length > 0) {
        try {
          agent.ctx.inject(['skills'], (scoped) => {
            const count = registerRoleSkills(scoped, {
              roleId: role.id,
              skillNames: role.skills,
              pool: state.skills,
              onDiagnostic,
            })
            console.log(`[subagent-roles] role=${role.id} child=${String(agent.id)} skills-registered=${count}`)
          })
        } catch (error) {
          onDiagnostic(
            `[subagent-roles] 角色 ${role.id} 的技能注入失败：${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }

      // ── 模型链的运行中回退 ────────────────────────────────────────
      // 链长 ≥ 2 才装监听器；链首已经由派发写进 agentOptions 了。
      const chainState = installChainFailover(agent, role, onDiagnostic)
      if (chainState !== null) {
        console.log(
          `[subagent-roles] role=${role.id} child=${String(agent.id)} chain=${role.model.chain.length} `
          + `switchOn=${(role.model.switchOn.length > 0 ? role.model.switchOn : DEFAULT_SWITCH_ON).join('|')}`,
        )
      }

      // ── 硬规则：角色子代理永远不能再往下派 ────────────────────────
      // 无条件安装，没有开关。层层分包会让一个任务在无人监督下指数扩散，
      // 所以「能不能再派」不是一个配置项，是结构性事实。
      //
      // 主闸门：guard（唯一真正生效的机制，见 installDelegationGuard 的说明）。
      const blocked = installDelegationGuard(agent, toolName, onDiagnostic)
      if (blocked.length > 0) {
        console.log(`[subagent-roles] role=${role.id} child=${String(agent.id)} guard-blocks=${blocked.join(',')}`)
      }
      // 次闸门：能删就把我们自己那个全局工具删掉，少一个可见的诱因。
      const revoked = revokeDelegationTools(agent, toolName, onDiagnostic)
      if (revoked.length > 0) {
        console.log(`[subagent-roles] role=${role.id} child=${String(agent.id)} revoked=${revoked.join(',')}`)
      }
      return
    }

    // ── 顶层 agent：接管模式下影子官方委派工具 ──────────────────────
    // 共存模式不需要在这里做任何事：我们的工具是全局注册的，顶层 agent 自然看得见，
    // 而子代理那边由上面的 deny 规则收回。
    if (mode !== 'takeover') return
    if (toolName !== 'subagent') return
    try {
      agent.ctx.inject(['tools'], (scoped) => {
        scoped.tools.register(options.buildTool())
        console.log(`[subagent-roles] takeover: shadowed "subagent" for ${String(agent.id)}`)
      })
    } catch (error) {
      onDiagnostic(
        `[subagent-roles] 接管注入失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  })
}
