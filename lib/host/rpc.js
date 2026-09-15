/**
 * 插件自己的 `/api` 精确路由（browser → host）。
 *
 * 走 `ctx.connection.fetch.register` 而不是专用的 `connection.rpc.handle` 通道：
 * 0.1.5 的 web profile 拓扑下专用通道挂不上（webserver 与 connection 是兄弟 loader 行），
 * 表现是浏览器侧 `HTTP 405`。精确 Fetch 路线与官方 `dsh-client-file-upload` 同模式，
 * `/api` 载体本身负责信任栅栏与浏览器认证。
 *
 * 报文形状与官方一致：`POST /api/<method>`，body 是
 * `{ type:'client-request', rpcId, method, payload }`，回
 * `{ type:'server-response', rpcId, result:{ ok:true, value } | { ok:false, error } }`。
 */
import { checkRoute } from './model-health.js'
import { parseRole, serializeRole, validateGroupName } from '../shared/role-schema.js'
import { removeRole, saveRole } from './role-store.js'
import { listToolNamesForPicker } from './tool-surface.js'

/** 对外暴露的角色视图：只带 UI 需要的叶子字段，不把内部对象整包丢出去。 */
function projectRole(role) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    skills: [...role.skills],
    tools: { allow: [...role.tools.allow], deny: [...role.tools.deny] },
    model: {
      chain: role.model.chain.map((entry) => ({ ...entry })),
      switchOn: [...role.model.switchOn],
    },
    group: role.group,
    enabled: role.enabled,
    maxDepth: role.maxDepth,
    backgroundMode: role.backgroundMode,
    sourcePath: role.sourcePath,
  }
}

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
})

const ok = (rpcId, value) => json({ type: 'server-response', rpcId, result: { ok: true, value } })
// ⚠️ error.details 是**必填**：DSH 的 connection 层会校验
// `typeof error.code === 'string' && typeof error.message === 'string' && isRecord(error.details)`。
// 少一个就抛 "connection: invalid server-response failure" —— 真正的错误信息被丢掉，
// 界面上只剩那句没用的英文（2026-09-15：撞名冲突的友好提示就是这么消失的）。
const fail = (rpcId, message, details) => json({
  type: 'server-response',
  rpcId,
  result: { ok: false, error: { code: 'internal', message, details: details ?? {} } },
})

/**
 * 解析并校验请求信封。
 * @returns {{ envelope?: object, response?: Response }}
 */
async function readEnvelope(request, endpoint) {
  if (request.method !== 'POST') return { response: new Response('method not allowed', { status: 405 }) }

  let body
  try {
    body = await request.json()
  } catch {
    return { response: new Response('body is not JSON', { status: 400 }) }
  }
  const envelope = body
  const shapeOk = envelope !== null && typeof envelope === 'object'
    && envelope.type === 'client-request'
    && typeof envelope.rpcId === 'string'
    && typeof envelope.method === 'string'
  if (!shapeOk) {
    return { response: json({ type: 'server-response', rpcId: 'invalid-request', result: { ok: false, error: { code: 'internal', message: 'invalid client-request message', details: {} } } }, 400) }
  }
  if (envelope.method !== endpoint) {
    return { response: json({ type: 'server-response', rpcId: envelope.rpcId, result: { ok: false, error: { code: 'internal', message: `method ${JSON.stringify(envelope.method)} does not match endpoint ${JSON.stringify(endpoint)}`, details: {} } } }, 400) }
  }
  return { envelope }
}

/**
 * 注册全部路由。
 * @param {object} ctx - host Cordis context。
 * @param {{ state: object, onDiagnostic: (m: string) => void }} deps
 */
export function registerRpc(ctx, deps) {
  const { state, onDiagnostic, reload } = deps

  const endpoints = {
    /** 角色表（UI 的主数据源）。 */
    'subagent-roles.roles.list': async () => ({
      roles: state.roles.map(projectRole),
      diagnostics: state.diagnostics.map((item) => ({
        id: item.id,
        path: item.path,
        errors: [...item.errors],
        warnings: [...item.warnings],
      })),
      skillsDir: state.skillsDir,
      rolesDir: state.rolesDir,
      poolSkills: state.skills.map((skill) => ({ name: skill.name, description: skill.description })),
    }),

    /** 单条路由检查。payload: { provider, model, effort?, probe? } */
    'subagent-roles.route.check': async (payload) => {
      const p = payload ?? {}
      if (typeof p.provider !== 'string' || typeof p.model !== 'string' || p.provider === '' || p.model === '') {
        throw new Error('payload 需要 { provider, model }')
      }
      const candidate = {
        provider: p.provider,
        model: p.model,
        ...(typeof p.effort === 'string' && p.effort !== '' ? { effort: p.effort } : {}),
      }
      return checkRoute(ctx, candidate, { probe: p.probe === true })
    },

    /** 整条链逐候选检查。payload: { roleId, probe? } */
    'subagent-roles.chain.check': async (payload) => {
      const p = payload ?? {}
      const role = state.roles.find((item) => item.id === p.roleId)
      if (role === undefined) throw new Error(`未知角色 ${JSON.stringify(p.roleId)}`)
      const results = []
      for (const candidate of role.model.chain) {
        results.push({
          candidate: { ...candidate },
          result: await checkRoute(ctx, candidate, { probe: p.probe === true }),
        })
      }
      return { roleId: role.id, results }
    },

    /** 单个角色的完整定义（**含 persona 正文**）。payload: { id }
     *
     * 为什么不塞进 roles.list：语言专家导入的人设每个 6–13 KB，30 个就是几百 KB，
     * 而列表页根本用不到正文。编辑器打开时按需取一份。 */
    'subagent-roles.roles.get': async (payload) => {
      const id = payload === null || payload === undefined ? undefined : payload.id
      if (typeof id !== 'string' || id === '') throw new Error('payload 需要 { id }')
      const role = state.roles.find((item) => item.id === id)
      if (role === undefined) throw new Error(`未知角色 ${JSON.stringify(id)}`)
      return { role: { ...projectRole(role), persona: role.persona } }
    },

    /** 落盘一个角色。payload: { role, mode?: 'create' | 'update' }
     *
     *  mode 默认 create —— 标识撞车时**不覆盖**，而是回一个 conflict 结果，
     *  让界面提示「它已经在哪个组里」。宿主侧这一道省不得：.md 可以被手改、RPC 也能被
     *  直接调用，只信前端校验的话，迟早有人的角色被静默抹掉。 */
    'subagent-roles.roles.save': async (payload) => {
      const role = payload === null || payload === undefined ? undefined : payload.role
      if (role === null || typeof role !== 'object') throw new Error('payload 需要 { role }')
      const mode = payload.mode === 'update' ? 'update' : 'create'
      // 落盘前先跑一遍「序列化 → 解析」往返：写不出来的东西不许进文件。
      // 这样 UI 传来的任何形状都会被同一套规则拦下，文件系统里永远只有合法角色。
      const text = serializeRole(role)
      const parsed = parseRole(text, { id: role.id })
      if (!parsed.ok) throw new Error(parsed.errors.join('；'))
      try {
        const path = await saveRole(state.rolesDir, parsed.role, { mode })
        await reload('rpc-save')
        return { saved: parsed.role.id, path, warnings: parsed.warnings }
      } catch (error) {
        if (error && error.code === 'ROLE_ID_TAKEN') {
          return { conflict: true, message: error.message, existing: error.existing, id: parsed.role.id }
        }
        throw error
      }
    },

    /** 只改启停。payload: { ids: [...], enabled: bool }
     *
     * 为什么不复用 roles.save：roles.list 给前端的投影**不含 persona**（人设正文很大，
     * 列表页根本用不到），而 serializeRole 需要它 —— 拿投影回传去 save 会直接崩在
     * `role.persona.trim()`（2026-09-15 实测：`Cannot read properties of undefined`）。
     * 宿主侧的 state.roles 才是完整对象，所以「切开关」这件事在宿主侧做。
     *
     * 这条也是「整组开关」的落点：组开关不存状态，它就是把这一组每个角色的 enabled 改一遍。
     */
    'subagent-roles.roles.setEnabled': async (payload) => {
      const p = payload ?? {}
      const ids = Array.isArray(p.ids) ? p.ids.filter((item) => typeof item === 'string' && item !== '') : []
      if (ids.length === 0) throw new Error('payload 需要 { ids: [...] }')
      if (typeof p.enabled !== 'boolean') throw new Error('payload 需要 { enabled: true | false }')
      const updated = []
      const missing = []
      for (const id of ids) {
        const role = state.roles.find((item) => item.id === id)
        if (role === undefined) {
          missing.push(id)
          continue
        }
        await saveRole(state.rolesDir, Object.assign({}, role, { enabled: p.enabled }), { mode: 'update' })
        updated.push(id)
      }
      await reload('rpc-set-enabled')
      return { updated, missing, enabled: p.enabled }
    },

    /** 给一个分组改名。payload: { from, to }
     *
     *  组是**从角色派生**的，没有单独的组定义文件，所以「给组改名」就是这一件事：
     *  把该组所有角色的 `group` 字段批量指到新名字上。改完这一组的角色都在新名下，
     *  旧名因为没有任何角色引用，自动消失。
     *
     *  同样在宿主侧做，不复用 roles.save —— 那条路要完整的 persona，而列表里的是投影。
     */
    'subagent-roles.roles.setGroup': async (payload) => {
      const p = payload ?? {}
      const from = typeof p.from === 'string' ? p.from.trim() : ''
      const to = typeof p.to === 'string' ? p.to.trim() : ''
      if (from === '' || to === '') throw new Error('payload 需要 { from, to }，且都不能为空')
      if (from === to) return { updated: [], from, to }

      const problem = validateGroupName(to)
      if (problem !== null) throw new Error(`新分组名不合法：${problem}`)

      const targets = state.roles.filter((role) => role.group === from)
      const updated = []
      for (const role of targets) {
        await saveRole(state.rolesDir, Object.assign({}, role, { group: to }), { mode: 'update' })
        updated.push(role.id)
      }
      await reload('rpc-set-group')
      return { updated, from, to }
    },

    /** 删除一个角色文件。payload: { id } */
    'subagent-roles.roles.remove': async (payload) => {
      const id = payload === null || payload === undefined ? undefined : payload.id
      if (typeof id !== 'string' || id === '') throw new Error('payload 需要 { id }')
      const removed = await removeRole(state.rolesDir, id)
      await reload('rpc-remove')
      return { removed, id }
    },

    /** 真实模型目录：provider → model → 该模型的思考强度选项。给编辑器的下拉用。 */
    'subagent-roles.models.list': async () => {
      const llm = ctx.get('llm')
      if (llm === undefined) return { providers: [], unavailable: true }
      const providers = []
      for (const provider of llm.listProviders()) {
        const entry = { id: String(provider.id), name: String(provider.name ?? provider.id), models: [] }
        try {
          const models = await llm.listModels(provider.id)
          for (const model of models) {
            let efforts = []
            try {
              const info = await llm.resolveModelInfo(provider.id, model.id)
              const reasoning = info === null || info === undefined ? undefined : info.reasoning
              if (reasoning !== undefined && reasoning !== null && Array.isArray(reasoning.efforts)) efforts = reasoning.efforts
            } catch {
              // 单个模型解析不了就不给强度列表，不影响其它模型
            }
            entry.models.push({ id: String(model.id), name: String(model.name ?? model.id), efforts })
          }
        } catch (error) {
          entry.error = error instanceof Error ? error.message : String(error)
        }
        providers.push(entry)
      }
      return { providers }
    },

    /** 工具名集合（全局 ∪ 活着的 agent 的视图），给工具白名单选择器用。
     *  `scope: 'global-only'` 表示当前没有活着的 agent，只拿到全局视图。 */
    'subagent-roles.tools.list': async () => listToolNamesForPicker(ctx),
  }

  ctx.inject(['connection'], (rpcCtx) => {
    const connection = rpcCtx.connection
    if (connection === undefined || connection.fetch === undefined) {
      onDiagnostic('[subagent-roles] connection.fetch 不可用，RPC 路由未注册（UI 将读不到角色表）')
      return
    }
    for (const [endpoint, handler] of Object.entries(endpoints)) {
      const path = `/api/${endpoint}`
      connection.fetch.register({
        path,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: async (request) => {
          const parsed = await readEnvelope(request, endpoint)
          if (parsed.response !== undefined) return parsed.response
          const rpcId = parsed.envelope.rpcId
          try {
            const value = await handler(parsed.envelope.payload)
            return ok(rpcId, value)
          } catch (error) {
            return fail(rpcId, error instanceof Error ? error.message : String(error))
          }
        },
      })
    }
    console.log(`[subagent-roles] RPC routes registered: ${Object.keys(endpoints).join(', ')}`)
  })
}
