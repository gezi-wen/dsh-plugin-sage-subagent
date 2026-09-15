/**
 * 单一委派工具：`role` 参数选角色，其余与官方 subagent 同形。
 *
 * 为什么是「单一工具 + 参数」而不是「每角色一个工具」：后者会随角色数量撑爆工具表，
 * 而且增删角色会改变模型见过的工具名集合，缓存与提示词稳定性都受影响。
 *
 * 借用的官方底座（Phase 0 实测过的接缝）：
 *   - `ctx.subagents.start(name, request)`：request 里的 `persona` / `toolFilter` /
 *     `agentOptions` / `maxDepth` 是**逐次调用生效**的，这正是角色能力的落点。
 *   - `ctx.subagents.startContinuable(...)`：可续子代理，调用方只拿 childId。
 */
import { checkToolNames, listVisibleToolNames } from './tool-surface.js'
import { candidateConfig } from '../shared/model-chain.js'
// 值导入同时也把 cordis 的 `ctx.subagents` 类型合并带进来；settleRun 用于后台一次性任务。
import { settleRun } from '@deepseek-ai/dsh-subagent'

/**
 * 把链上一个候选翻译成官方 `agentOptions`。
 * @param {{ provider: string, model: string, effort?: string } | undefined} candidate
 * @returns {object | undefined}
 */
export function agentOptionsForCandidate(candidate) {
  if (candidate === undefined) return undefined
  return candidateConfig(candidate)
}

/**
 * 链首的 agentOptions（纯函数版本，单测用；派发路径走 pickHeadCandidate 的预检版）。
 * @param {object} role
 * @returns {object | undefined}
 */
export function headAgentOptions(role) {
  const head = role.model && Array.isArray(role.model.chain) ? role.model.chain[0] : undefined
  return agentOptionsForCandidate(head)
}

/**
 * 派发前的免费预检：按顺序挑出**第一条能解析的路由**当链首。
 *
 * 这是「派发前免费校验」那一半（用户 2026-09-15 选的语义）：`resolveCallConfig` 只查
 * 注册表与模型元数据，**不联网、不花 token**，所以可以放心对整条链逐条试。
 * 它证明不了「真能响应」—— 那是运行中回退负责的事。
 *
 * @param {object} ctx - host Cordis context。
 * @param {readonly object[]} chain
 * @param {(message: string) => void} onDiagnostic
 * @returns {Promise<{ candidate: object | undefined, skipped: { candidate: object, reason: string }[] }>}
 */
export async function pickHeadCandidate(ctx, chain, onDiagnostic) {
  if (!Array.isArray(chain) || chain.length === 0) return { candidate: undefined, skipped: [] }

  const llm = ctx.get('llm')
  if (llm === undefined || typeof llm.resolveCallConfig !== 'function') {
    // 拿不到 llm 服务时不猜，直接用链首；解析失败会在派发时响亮报错。
    return { candidate: chain[0], skipped: [] }
  }

  const skipped = []
  for (const candidate of chain) {
    try {
      await llm.resolveCallConfig(candidateConfig(candidate))
      return { candidate, skipped }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      skipped.push({ candidate, reason })
      onDiagnostic(
        `[subagent-roles] 链上候选 ${candidate.provider}/${candidate.model} 解析不了，跳过：${reason}`,
      )
    }
  }
  return { candidate: undefined, skipped }
}

/**
 * 生成模型面向的工具描述。
 *
 * 角色清单里**带上 description** —— 只给名字的话，主代理只能靠猜选角色，
 * 这是同类插件最实的一处缺陷（实测：它们的工具描述里每行只有 `- "id": 名字`）。
 *
 * @param {object[]} roles - 当前角色表。
 * @returns {string}
 */
export function buildToolDescription(roles) {
  const base =
    'Delegate a self-contained task to a configured subagent role and return its final result. '
    + 'Use this to offload focused, independent work so it does not consume this conversation\'s context. '
    + 'The subagent runs to completion and you receive only its final answer, not its intermediate steps. '
    + 'Give it a complete, standalone prompt: it does not see this conversation.'

  if (roles.length === 0) {
    return `${base}\n\nNo roles are configured yet, so this tool cannot be used.`
  }

  const lines = roles.map((role) => `  - "${role.id}" (${role.name}): ${role.description}`)
  return `${base}\n\nPick the role whose description matches the task. Available roles:\n${lines.join('\n')}`
}

/**
 * 把角色的 tools 配置翻译成官方 `toolFilter`；两边都空则省略。
 *
 * **强制保留 `skill`**：官方技能目录只在「该 agent 解析到的 `skill` 工具仍是官方实例」时
 * 发布（`dsh-tool-skill` 的发布门控）。所以一个角色只要声明了技能，白名单就不能把 `skill`
 * 拿掉 —— 否则我们注册的技能一个都看不见，而且**全局技能目录也会一起消失**，
 * 用户完全无法自查。实测踩过：白名单 `[read, glob, grep]` + 声明技能 → 子代理目录 0 条。
 *
 * @param {object} role
 * @param {(message: string) => void} [onDiagnostic]
 * @returns {object | undefined}
 */
export function toolFilterFor(role, onDiagnostic) {
  const allow = [...role.tools.allow]
  const deny = role.tools.deny

  if (role.skills.length > 0 && allow.length > 0 && !allow.includes('skill')) {
    allow.push('skill')
    if (onDiagnostic) {
      onDiagnostic(
        `[subagent-roles] 角色 ${role.id} 声明了技能，白名单已自动补上 "skill"（否则技能目录不会发布）`,
      )
    }
  }

  if (allow.length === 0 && deny.length === 0) return undefined
  return {
    ...(allow.length === 0 ? {} : { allow }),
    ...(deny.length === 0 ? {} : { deny }),
  }
}

/**
 * 解析角色实际生效的递归深度上限。
 *
 * 语义：`maxDepth` 是**本次创建的这个孩子**的深度上限（父深度 + 1 就是它自己的深度）。
 * 所以「刚好允许这一层」= `parentDepth + 1`，再与角色自己写的上限取小。
 *
 * ⚠️ 别指望它来阻止层层分包 —— 实测证明它管不到：`maxDepth` 只约束「我这一次创建的孩子」，
 * 那个孩子以后自己派谁，用的是**它看到的那个官方委派工具实例**的配置。
 * 「子代理不能再用委派工具」由 `agent-inject` 里的 guard 负责（那才是真正生效的闸门）。
 * 这里的值只是顺手把「这一层」封住，属于纵深防御。
 *
 * @param {object} role
 * @param {number} parentDepth - 调用方 agent 自己的委派深度。
 * @returns {number}
 */
export function effectiveMaxDepth(role, parentDepth) {
  const own = Number.isSafeInteger(parentDepth) && parentDepth >= 0 ? parentDepth : 0
  return Math.max(0, Math.min(role.maxDepth, own + 1))
}

/** 非 completed 的 stopReason 一律转成错误，不把半截输出当成功。 */
function stopReasonError(result) {
  switch (result.stopReason) {
    case 'completed':
      return undefined
    case 'aborted':
      return 'subagent run was cancelled'
    case 'error':
      return 'subagent run failed'
    case 'max-tokens':
      return 'subagent run hit its token limit before finishing'
    case 'refusal':
      return 'subagent declined the task'
    default:
      return `subagent run ended abnormally (${String(result.stopReason)})`
  }
}

/** 把子代理输出块拼成纯文本。 */
function outputText(output) {
  if (!Array.isArray(output)) return ''
  return output
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
}

/**
 * 构造委派工具定义。
 *
 * @param {object} options
 * @param {object} options.ctx - host Cordis context。
 * @param {() => object[]} options.listRoles - 读当前角色表。
 * @param {{ push: (parentId: string, roleId: string) => void }} options.registry - 待派发登记表。
 * @param {(message: string) => void} options.onDiagnostic
 * @param {string} options.toolName - 共存模式 `delegate`；接管模式 `subagent`。
 * @returns {object} ToolDefinition
 */
export function buildDispatchTool(options) {
  const { ctx, listRoles, registry, onDiagnostic, toolName } = options

  return {
    name: toolName,
    get description() {
      return buildToolDescription(listRoles())
    },
    // 注意：静态 ToolDefinition 的 `parameters` 是**原始 JSON Schema**
    // （`{ type:'object', properties, required:[…] }`），不是动态工具 DSL 里那种
    // 逐字段写 `required: true` 的形状。写错会在模型侧 400：
    // "Invalid schema for function … is not of type string"。
    parameters: {
      type: 'object',
      properties: {
        role: {
          type: 'string',
          description: '要使用的子代理角色 id。省略则用第一个已配置的角色。',
        },
        description: {
          type: 'string',
          description: '这次委派的三五字短描述，用于展示。',
        },
        prompt: {
          type: 'string',
          description:
            '完整、自包含的任务描述。子代理看不到本对话，所以它需要的一切都要写进来。',
        },
        run_in_background: {
          type: 'boolean',
          description:
            '设为 true 时启动一个保留对话的后台子代理，只返回它的 id（后续用 send_message 继续派活）。',
        },
      },
      required: ['description', 'prompt'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'string' },
      render(_args, value) {
        return [{ type: 'text', text: String(value) }]
      },
    },

    async execute(args, exec) {
      const roles = listRoles()
      if (roles.length === 0) throw new Error('subagent roles: 还没有配置任何角色（目录里没有合法的 .md 角色文件）')

      const roleId = args.role === undefined || args.role === '' ? roles[0].id : args.role
      const role = roles.find((item) => item.id === roleId)
      if (role === undefined) {
        throw new Error(`subagent roles: 未知角色 "${String(args.role)}"。可用角色：${roles.map((r) => r.id).join(', ')}`)
      }

      const parent = exec.agent
      if (!parent) throw new Error('subagent roles: 本工具需要调用方 agent（exec.agent 为空）')

      // 工具名先对着「父代理真实可见的工具集」核一遍：官方 tools.restrict() 遇到未知名
      // 会硬抛错并否决子代理创建，那个报错停在官方层，用户很难和自己的角色文件对上号。
      const declared = [...role.tools.allow, ...role.tools.deny]
      if (declared.length > 0) {
        const available = listVisibleToolNames(ctx, parent)
        if (available.length > 0) {
          const { unknown } = checkToolNames(declared, available)
          if (unknown.length > 0) {
            throw new Error(
              `subagent roles: 角色 "${role.id}" 声明了当前不存在的工具：${unknown.join(', ')}。`
              + `（很可能是 MCP 被关掉了；当前可见工具共 ${available.length} 个）`,
            )
          }
        }
      }

      const parentDepth = typeof parent.session?.header?.delegationDepth === 'number'
        ? parent.session.header.delegationDepth
        : 0

      const request = {
        label: args.description,
        prompt: [{ type: 'text', text: args.prompt }],
        parent,
        maxDepth: effectiveMaxDepth(role, parentDepth),
        persona: role.persona,
      }
      const toolFilter = toolFilterFor(role, onDiagnostic)
      if (toolFilter !== undefined) request.toolFilter = toolFilter
      // 派发前免费预检：跳过解析不了的候选，用第一条能用的当链首。
      const chain = role.model && Array.isArray(role.model.chain) ? role.model.chain : []
      const picked = await pickHeadCandidate(ctx, chain, onDiagnostic)
      if (chain.length > 0 && picked.candidate === undefined) {
        throw new Error(
          `subagent roles: 角色 "${role.id}" 的模型链上没有任何一条路由能解析：`
          + picked.skipped.map((item) => `${item.candidate.provider}/${item.candidate.model}（${item.reason}）`).join('；'),
        )
      }
      const agentOptions = agentOptionsForCandidate(picked.candidate)
      if (agentOptions !== undefined) request.agentOptions = agentOptions

      // 登记「这个父代理接下来会生出一个属于 role 的子代理」，供 agent/created 里
      // 往子代理作用域注册专属技能（那个事件是唯一赶在首次提示词装配之前的钩子）。
      // 本工具不声明 isConcurrencySafe，调度器按独占处理，所以同一父代理的派发是串行的，
      // FIFO 取值是确定的。
      registry.push(String(parent.id), role.id)

      if (args.run_in_background === true) {
        if (role.backgroundMode === 'one-shot') {
          // 后台一次性任务：跑在一个 Job 里，调用方拿 job id，
          // 之后用 job_output / job_kill 收结果或停掉（与官方 tool-subagent 的同名路径一致）。
          const jobs = ctx.get('jobs')
          if (jobs === undefined) {
            throw new Error(
              'subagent roles: 后台一次性任务需要 jobs 服务（@deepseek-ai/dsh-jobs + @deepseek-ai/dsh-tool-jobs）。'
              + '也可以把该角色的 backgroundMode 改成 continuable。',
            )
          }
          const jobId = jobs.start({
            kind: 'subagent',
            label: args.description,
            owner: parent,
            run: () => {
              const controller = new AbortController()
              const start = ctx.subagents.start('spawn', { ...request, signal: controller.signal })
              void start.catch(() => {
                // 启动失败由 done 里统一报出，这里只兜住未处理的拒绝。
              })
              return {
                cancel: (reason) => controller.abort(reason ?? 'background subagent task killed'),
                done: (async () => {
                  try {
                    return await settleRun(await start)
                  } catch (error) {
                    return controller.signal.aborted
                      ? { status: 'killed' }
                      : { status: 'failed', detail: error instanceof Error ? error.message : String(error) }
                  }
                })(),
              }
            },
          })
          return `started background subagent task ${String(jobId)}`
        }
        const started = await ctx.subagents.startContinuable({
          provider: 'spawn',
          label: args.description,
          request,
          signal: exec.signal,
        })
        return `started ${role.name} subagent ${started.childId}`
      }

      const run = await ctx.subagents.start('spawn', { ...request, signal: exec.signal })
      try {
        const result = await run.result
        const failure = stopReasonError(result)
        if (failure !== undefined) throw new Error(`subagent roles: ${failure}`)
        return `completed ${role.name} subagent ${String(run.id)}\n${outputText(result.output)}`
      } finally {
        try {
          await run.dispose()
        } catch (error) {
          onDiagnostic(`[subagent-roles] 释放子代理 run 失败：${error instanceof Error ? error.message : String(error)}`)
        }
      }
    },
  }
}
