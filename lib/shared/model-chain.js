/**
 * 模型链的纯逻辑：候选推进、失败分类、路由改写。
 *
 * 纯函数，无 I/O、无 Cordis —— 单测覆盖。真正的接线在 host/chain-hook.js。
 *
 * 两条铁律（都是 Phase 0 实测换来的，别改）：
 *   1. **改写必须是完整配置**。失败请求的配置会被写进持久请求头，重试是从头部重建的；
 *      只改一个字段的「增量」写法会让重试原样带着坏配置再发一遍
 *      （实测：两次 attempt 完全相同的 400）。
 *   2. **路由变了就换一份干净配置**。不继承旧路由的 maxTokens / temperature / stop ——
 *      旧路由的上限对新模型可能超限，正是这个坑把第一次实测打回原形。
 */

/**
 * 默认「值得换路由」的失败码。
 *
 * 全部取自官方词表，语义是「这条路由服务不了我们」：
 *   - `dsh-llm/lib/types/error.js`：`INVALID_CREDENTIAL` / `QUOTA` / `EMPTY_RESPONSE`
 *   - `dsh-llm/lib/types/retry-policy.js` 的 `DEFAULT_RETRYABLE_CODES`：`RATE_LIMIT` / `SERVER` / `TIMEOUT` / `TRANSPORT`
 *   - 适配器实测会用到的：`AUTH` / `NO_ADAPTER`
 *
 * **刻意不在默认集合里**（要开就写进角色的 `model.switchOn`）：
 *   - `INVALID_REQUEST`：那是「我们发的东西不对」，换路由只是把同一个错误再交一遍学费；
 *   - `CONTEXT_WINDOW_EXCEEDED`：内容超窗，换路由确实可能有用（候选窗口更大），
 *     但需要按窗口大小挑候选才有意义，本阶段不做，留给显式配置。
 */
export const DEFAULT_SWITCH_ON = Object.freeze([
  'AUTH',
  'INVALID_CREDENTIAL',
  'QUOTA',
  'RATE_LIMIT',
  'SERVER',
  'TIMEOUT',
  'TRANSPORT',
  'EMPTY_RESPONSE',
  'NO_ADAPTER',
])

/**
 * 这一次失败该不该换路由。
 * @param {{ code?: string } | undefined} failure - `agent/request-error` 给的失败事实。
 * @param {readonly string[]} switchOn - 触发切换的错误码集合。
 * @returns {boolean}
 */
export function shouldSwitch(failure, switchOn) {
  if (failure === undefined || failure === null) return false
  const code = failure.code
  if (typeof code !== 'string' || code === '') return false
  return switchOn.includes(code)
}

/**
 * 一个候选翻译成 `LlmCallConfig` 的核心字段。
 *
 * `maxTokens` 是**可选**的逐候选输出预算：不写就交给模型自己的默认值。
 * 写它的意义在于「这一候选只值得给这么多输出」这种策略，例如把便宜的候选
 * 限成小预算、只在升级到强模型时才放开。
 * @param {{ provider: string, model: string, effort?: string, maxTokens?: number }} candidate
 * @returns {{ provider: string, model: string, reasoningEffort?: string, maxTokens?: number }}
 */
export function candidateConfig(candidate) {
  return {
    provider: candidate.provider,
    model: candidate.model,
    ...(candidate.effort === undefined ? {} : { reasoningEffort: candidate.effort }),
    ...(candidate.maxTokens === undefined ? {} : { maxTokens: candidate.maxTokens }),
  }
}

/**
 * 把候选落到某个已有请求配置上。
 *
 * 同路由 → 只改「候选显式给了、且与现状不同」的字段（不制造无谓的请求头变化）。
 * **换路由 → 返回一份干净配置**：只带候选自己声明的东西，绝不继承旧路由的
 * maxTokens / temperature / stop —— 旧路由的上限对新模型可能超限，Phase 0 就是这么炸的
 * （换过去仍然带着 999999999 的 maxTokens，又一次 400）。
 *
 * @param {object} base - `await next()` 给出的当前配置。
 * @param {object} candidate
 * @returns {object}
 */
export function applyRoute(base, candidate) {
  const sameRoute = base.provider === candidate.provider && base.model === candidate.model
  if (!sameRoute) return candidateConfig(candidate)

  const merged = { ...base }
  let changed = false
  if (candidate.effort !== undefined && base.reasoningEffort !== candidate.effort) {
    merged.reasoningEffort = candidate.effort
    changed = true
  }
  if (candidate.maxTokens !== undefined && base.maxTokens !== candidate.maxTokens) {
    merged.maxTokens = candidate.maxTokens
    changed = true
  }
  return changed ? merged : base
}

/**
 * 建一个链的运行态。每个子代理一份，住在内存里。
 * @param {readonly object[]} chain
 * @returns {{ chain: readonly object[], index: number, switches: number }}
 */
export function createChainState(chain) {
  return { chain, index: 0, switches: 0 }
}

/**
 * 推进到下一个候选。每个候选最多试一次，**不循环**。
 * @param {{ chain: readonly object[], index: number, switches: number }} state
 * @returns {boolean} 是否真的推进了。
 */
export function advance(state) {
  const lastIndex = state.chain.length - 1
  if (state.index >= lastIndex) return false
  state.index += 1
  state.switches += 1
  return true
}

/** 当前候选。 */
export function currentCandidate(state) {
  return state.chain[state.index]
}

/** 人读的链进度，写日志用。 */
export function describeProgress(state) {
  return `${state.index + 1}/${state.chain.length}`
}
