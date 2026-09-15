/**
 * 模型响应测试：两层，代价完全不同，UI 上必须分开讲。
 *
 *   ① **免费校验**（`llm.resolveCallConfig`）：查注册表与模型元数据，**不联网、不花 token**。
 *      能回答「这个 provider/model/强度组合配得对不对」，**回答不了「它真能响应吗」**。
 *   ② **真实探针**（`llm.stream` + maxTokens:1）：真发一次最小请求，能回答「能不能响应」
 *      并量出首字延迟 —— 但它花 token，且对端可能计入配额。
 *
 * 官方**没有**任何健康检查/探针 API（2026-09-15 全仓核实），所以这是自己搭的；
 * 范本照 `dsh-session-title-llm` 的一次性调用写法。
 */
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { candidateConfig } from '../shared/model-chain.js'

/** 探针默认超时。 */
export const DEFAULT_PROBE_TIMEOUT_MS = 20000

/**
 * 把一次检查结果压成一句人话（纯函数，UI 与日志共用）。
 * @param {{ ok: boolean, stage: string, detail?: string, ms?: number }} result
 * @returns {string}
 */
export function summarizeCheck(result) {
  if (result.ok) {
    const unlisted = result.listed === false ? '（注意：不在该 provider 的目录里，目录是参考性的）' : ''
    if (result.stage === 'resolve') return `配置可解析（未发真实请求）${unlisted}`
    return `可响应（首包 ${result.ms} ms）${unlisted}`
  }
  if (result.stage === 'resolve') return `配置解析失败：${result.detail}`
  if (result.stage === 'timeout') return `探针超时（${result.ms} ms 内没有响应）`
  return `请求失败：${result.detail}`
}

/**
 * 检查一条路由。
 *
 * @param {object} ctx - host Cordis context。
 * @param {{ provider: string, model: string, effort?: string }} candidate
 * @param {{ probe?: boolean, timeoutMs?: number }} [options] - `probe: true` 才发真实请求。
 * @returns {Promise<{ ok: boolean, stage: 'resolve'|'probe'|'timeout', detail?: string, code?: string, ms?: number }>}
 */
export async function checkRoute(ctx, candidate, options = {}) {
  const llm = ctx.get('llm')
  if (llm === undefined) {
    return { ok: false, stage: 'resolve', detail: 'llm 服务不可用' }
  }

  const config = candidateConfig(candidate)

  // ① 免费校验
  try {
    await llm.resolveCallConfig(config)
  } catch (error) {
    return { ok: false, stage: 'resolve', detail: error instanceof Error ? error.message : String(error) }
  }

  // ①b 目录成员检查（同样免费、本地查表）。
  // 实测教训：`resolveCallConfig` **挡不住模型名写错** —— deepseek-official 上写一个不存在的
  // model id 会一路发到服务端才被拒（INVALID_REQUEST）。所以这里额外查一次目录，
  // 给 UI 一个「这个名字不在该 provider 的目录里」的预警。
  // 注意目录是**参考性**的（官方原话：an adapter may accept an unlisted model id），
  // 所以 unlisted **不是错误**，只是提示。
  let listed
  try {
    if (typeof llm.listModels === 'function') {
      const models = await llm.listModels(candidate.provider)
      if (Array.isArray(models)) listed = models.some((model) => model && model.id === candidate.model)
    }
  } catch {
    // 目录读不到就不给结论
  }

  if (options.probe !== true) {
    return { ok: true, stage: 'resolve', ...(listed === undefined ? {} : { listed }) }
  }

  // ② 真实探针
  const timeoutMs = typeof options.timeoutMs === 'number' && options.timeoutMs > 0
    ? options.timeoutMs
    : DEFAULT_PROBE_TIMEOUT_MS
  const started = Date.now()
  let timedOut = false
  const controller = new AbortController()
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort(new Error('probe timeout'))
  }, timeoutMs)

  let failure
  let firstChunkMs
  try {
    const messages = [createUserMessage({ content: [{ type: 'text', text: 'ping' }] })]
    const stream = llm.stream({
      ...config,
      maxTokens: 1,
      messages,
      signal: controller.signal,
    })
    for await (const chunk of stream) {
      if (firstChunkMs === undefined) firstChunkMs = Date.now() - started
      if (chunk !== null && typeof chunk === 'object' && chunk.type === 'finish') {
        const reason = chunk.reason
        if (reason !== undefined && reason !== null && reason.kind === 'error') failure = reason.failure
      }
    }
  } catch (error) {
    if (timedOut) {
      return { ok: false, stage: 'timeout', ms: Date.now() - started }
    }
    return {
      ok: false,
      stage: 'probe',
      detail: error instanceof Error ? error.message : String(error),
    }
  } finally {
    clearTimeout(timer)
  }

  if (timedOut) return { ok: false, stage: 'timeout', ms: Date.now() - started }
  if (failure !== undefined) {
    return {
      ok: false,
      stage: 'probe',
      detail: failure.message,
      ...(failure.code === undefined ? {} : { code: failure.code }),
    }
  }
  return { ok: true, stage: 'probe', ms: firstChunkMs === undefined ? Date.now() - started : firstChunkMs }
}
