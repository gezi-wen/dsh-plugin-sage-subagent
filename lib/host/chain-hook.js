/**
 * 把「模型链的运行中回退」接到子代理自己的作用域上。
 *
 * 挂载点（Phase 0 实测确认，都是 agent 作用域的水位事件，只对注册者那个 agent 生效）：
 *   - `agent/request`        → 每次请求返回要用的完整 `LlmCallConfig`
 *   - `agent/request-error`  → 失败时返回 `{kind:'retry'}` 即接管恢复
 *
 * ⚠️ 顺序陷阱：官方的模型选择监听器是在 `await next()` **之后**覆盖 provider/model 的，
 * 而瀑布链里后注册者在内层。我们同样在 `next()` 之后返回自己的值，实测能生效
 * （Phase 0：子代理实际路由变成了我们写的那个），但改这里之前先重跑一次那个验证。
 */
import {
  advance,
  applyRoute,
  createChainState,
  currentCandidate,
  DEFAULT_SWITCH_ON,
  describeProgress,
  shouldSwitch,
} from '../shared/model-chain.js'

/**
 * 给一个子代理装链回退。
 *
 * 只有链长 ≥ 2 才需要装：单候选没有「下一个」可切，派发时已经把链首写进
 * `agentOptions`，不必多挂两个监听器。
 *
 * @param {object} agent - 刚创建的 agent。
 * @param {object} role - 归一化角色。
 * @param {(message: string) => void} onDiagnostic
 * @returns {{ index: number, switches: number } | null} 链运行态（没装则 null）。
 */
export function installChainFailover(agent, role, onDiagnostic) {
  const chain = role.model && Array.isArray(role.model.chain) ? role.model.chain : []
  if (chain.length < 2) return null

  const switchOn = Array.isArray(role.model.switchOn) && role.model.switchOn.length > 0
    ? role.model.switchOn
    : DEFAULT_SWITCH_ON
  const state = createChainState(chain)
  const agentId = String(agent.id)

  agent.ctx.on('agent/request', async (payload, next) => {
    const base = await next()
    const candidate = currentCandidate(state)
    return applyRoute(base, candidate)
  })

  agent.ctx.on('agent/request-error', async (payload, next) => {
    const failure = payload && payload.failure
    const code = failure && typeof failure.code === 'string' ? failure.code : '(无码)'

    if (!shouldSwitch(failure, switchOn)) {
      // 不在切换集合里：放行，让官方重试策略或终态处理接手。
      return next()
    }
    if (!advance(state)) {
      // 链耗尽：如实失败上报，**不**静默降级到父模型。
      onDiagnostic(
        `[subagent-roles] 模型链耗尽（${describeProgress(state)}）code=${code}，如实上报不再切换`,
      )
      return next()
    }

    console.log(
      `[subagent-roles] chain switch agent=${agentId} to=${describeProgress(state)} `
      + `model=${currentCandidate(state).provider}/${currentCandidate(state).model} code=${code}`,
    )
    return { kind: 'retry' }
  })

  return state
}
