/**
 * 角色定义的数据契约：字段表、校验、frontmatter 解析与序列化。
 *
 * 纯逻辑模块：不碰文件系统、不碰 Cordis、无副作用 —— 单测覆盖。
 * 所有业务判断都住在这里；host/ 下的模块只做接线。
 *
 * 设计要点：
 *   - 未识别的 frontmatter 键**响亮失败**（连同键名），不静默丢弃 —— 手写配置文件时
 *     一个错别字最坏的结果是「配了但没生效」，那比报错难查得多。
 *   - 每条错误都带字段路径，能直接指给用户看。
 *   - 归一化输出（fillDefault）与校验分开：校验只管对错，归一化只管补默认值。
 */
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

/** 角色 id：即文件名（不含 .md）。 */
export const ROLE_ID_RE = /^[a-z0-9][a-z0-9-]{0,31}$/

/** 子代理专属技能名：kebab-case。 */
export const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]*$/

/** 后台模式取值。 */
export const BACKGROUND_MODES = ['one-shot', 'continuable']

/**
 * 分组：**从角色派生**，不是一张白名单。
 *
 * 写一个角色带 `group: 我的项目`，就多出一个叫「我的项目」的组；该组最后一个角色被删掉
 * 或改走，这个组就消失。所以这里没有（也不该有）权威的组清单，更没有单独的组定义文件。
 *
 * `SUGGESTED_GROUPS` 只是**内置默认角色用的初始值**，给用户一个起点；用户完全可以不用。
 * 组名**就是显示名**（中文也行）——它既是标识也是名字，不值得再搞一层 id ↔ 显示名的映射。
 *
 * **一个角色仍然只属于一个组**（group 是单值）。这条是硬的：让一个角色同时出现在两个组，
 * 「A 组整组关闭」就会牵连 B 组，两个开关控制一个状态、怎么显示都是错的。想要两份，
 * 复制一份换个标识即可——两者从此各有独立开关。
 *
 * **组开关本身不存状态**：它只是「把这组每个角色的 enabled 改一遍」的批量动作。
 * 唯一真值是每个角色的 `enabled`，所以组开关和角色开关永远不可能打架。
 */
export const SUGGESTED_GROUPS = ['工程实践', '审查把关', '调研与写作', '语言与框架']

/** group 省略时的归属（兼容没有该字段的旧文件）。 */
export const DEFAULT_GROUP = '工程实践'

/** 组名长度上限（防手滑贴进来一整段）。 */
export const GROUP_MAX_LENGTH = 32

/**
 * 校验一个分组名。合法返回 null，否则返回原因。
 *
 * 约束只有「像个名字」这几条：非空、不含控制字符与零宽字符、长度有上限。
 * **首尾空白由调用方 trim**（并给一条提示），因为那属于用户手滑、不算非法值。
 */
export function validateGroupName(value) {
  if (typeof value !== 'string') return '必须是字符串'
  const trimmed = value.trim()
  if (trimmed === '') return '不能为空'
  if (trimmed.length > GROUP_MAX_LENGTH) return `最长 ${GROUP_MAX_LENGTH} 个字符`
  // 控制字符（含换行、制表）与零宽字符会让两个看起来一样的名字变成两个组
  if (/[\u0000-\u001f\u007f\u200b-\u200f\ufeff]/.test(trimmed)) {
    return '不能含控制字符或零宽字符'
  }
  return null
}

/** 允许出现在 frontmatter 里的键。多一个都算错。 */
export const KNOWN_FIELDS = [
  'name',
  'description',
  'group',
  'enabled',
  'skills',
  'tools',
  'model',
  'maxDepth',
  'allowRedelegation',
  'backgroundMode',
]

/**
 * 默认递归深度。
 *
 * 语义提醒：`maxDepth` 是「子代理自身深度的上限」。父代理在深度 0，子代理就是深度 1，
 * 所以 **0 会让这个角色根本派不出去**（不是「它不能再往下派」）。默认 1 = 允许派发、
 * 但不允许它再派孙代理，配合 `allowRedelegation: false` 正好。
 */
export const DEFAULT_MAX_DEPTH = 1

/** frontmatter 分隔符。 */
const FENCE = '---'

/**
 * 拆分 frontmatter 与正文。
 * @param {string} text - 角色文件全文。
 * @returns {{ frontmatter: string | undefined, body: string }}
 */
export function splitFrontmatter(text) {
  const normalized = String(text).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (!normalized.startsWith(FENCE + '\n') && normalized.trimStart() !== FENCE) {
    return { frontmatter: undefined, body: normalized }
  }
  const lines = normalized.split('\n')
  if (lines[0].trim() !== FENCE) return { frontmatter: undefined, body: normalized }
  let end = -1
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === FENCE) {
      end = i
      break
    }
  }
  if (end === -1) return { frontmatter: undefined, body: normalized }
  return {
    frontmatter: lines.slice(1, end).join('\n'),
    body: lines.slice(end + 1).join('\n'),
  }
}

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)

const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== ''

/**
 * 校验并归一化一个角色定义。
 *
 * @param {string} text - 角色文件全文（frontmatter + 正文）。
 * @param {{ id: string, sourcePath?: string }} context - 文件名推导出的 id 与来源路径。
 * @returns {{ ok: boolean, role?: object, errors: string[], warnings: string[] }}
 */
export function parseRole(text, context) {
  const errors = []
  const warnings = []
  const id = context && context.id

  if (typeof id !== 'string' || !ROLE_ID_RE.test(id)) {
    errors.push(`id（文件名）"${String(id)}" 不合法：只允许小写字母、数字、连字符，且以字母或数字开头（1-32 字符）`)
  }

  const { frontmatter, body } = splitFrontmatter(text)
  if (frontmatter === undefined) {
    errors.push('缺少 frontmatter：文件必须以 --- 开头的 YAML 段落起始')
    return { ok: false, errors, warnings }
  }

  let data
  try {
    data = parseYaml(frontmatter)
  } catch (error) {
    errors.push(`frontmatter YAML 解析失败：${error instanceof Error ? error.message : String(error)}`)
    return { ok: false, errors, warnings }
  }
  if (!isPlainObject(data)) {
    errors.push('frontmatter 必须是一个 YAML 映射（键值对）')
    return { ok: false, errors, warnings }
  }

  for (const key of Object.keys(data)) {
    if (!KNOWN_FIELDS.includes(key)) {
      errors.push(`未知字段 "${key}"：允许的字段是 ${KNOWN_FIELDS.join(' / ')}（检查是否拼错）`)
    }
  }

  if (!isNonEmptyString(data.name)) errors.push('name 必填，且必须是非空字符串')
  if (!isNonEmptyString(data.description)) {
    errors.push('description 必填：写「何时用它」（触发场景），不写职责 —— 它是主代理选角色的唯一依据')
  }

  const persona = typeof body === 'string' ? body.trim() : ''
  if (persona === '') errors.push('正文（人设 / 系统提示词）不能为空')

  const skills = []
  if (data.skills !== undefined) {
    if (!Array.isArray(data.skills)) {
      errors.push('skills 必须是数组')
    } else {
      for (const item of data.skills) {
        if (!isNonEmptyString(item)) {
          errors.push(`skills 里的每一项都必须是非空字符串，收到 ${JSON.stringify(item)}`)
          continue
        }
        if (!SKILL_NAME_RE.test(item)) {
          errors.push(`技能名 "${item}" 不合法：只允许小写字母、数字、连字符`)
          continue
        }
        if (!skills.includes(item)) skills.push(item)
      }
    }
  }

  const tools = { allow: [], deny: [] }
  if (data.tools !== undefined) {
    if (!isPlainObject(data.tools)) {
      errors.push('tools 必须是一个映射，形如 { allow: [...], deny: [...] }')
    } else {
      for (const key of Object.keys(data.tools)) {
        if (key !== 'allow' && key !== 'deny') {
          errors.push(`tools 里未知的键 "${key}"：只允许 allow / deny`)
        }
      }
      for (const key of ['allow', 'deny']) {
        const value = data.tools[key]
        if (value === undefined) continue
        if (!Array.isArray(value)) {
          errors.push(`tools.${key} 必须是数组`)
          continue
        }
        for (const name of value) {
          if (!isNonEmptyString(name)) {
            errors.push(`tools.${key} 里每一项都必须是非空字符串，收到 ${JSON.stringify(name)}`)
            continue
          }
          // 本插件只用精确工具名：官方 tools.restrict() 是集合掩码，不支持通配，
          // 且未知名会硬抛错。写通配只会让派发被否决，所以在这里就拦下。
          if (name.includes('*')) {
            errors.push(`tools.${key} 里的 "${name}" 含通配符：官方 tools.restrict() 只接受精确工具名`)
            continue
          }
          tools[key].push(name)
        }
      }
    }
  }

  const chain = []
  const switchOn = []
  if (data.model !== undefined) {
    if (!isPlainObject(data.model)) {
      errors.push('model 必须是一个映射，形如 { chain: [{ provider, model }] }')
    } else {
      for (const key of Object.keys(data.model)) {
        if (key !== 'chain' && key !== 'switchOn') {
          errors.push(`model 里未知的键 "${key}"：只允许 chain / switchOn`)
        }
      }
      const rawSwitchOn = data.model.switchOn
      if (rawSwitchOn !== undefined) {
        if (!Array.isArray(rawSwitchOn)) {
          errors.push('model.switchOn 必须是数组（失败码字符串）')
        } else {
          for (const code of rawSwitchOn) {
            if (!isNonEmptyString(code)) {
              errors.push(`model.switchOn 里每一项都必须是非空字符串，收到 ${JSON.stringify(code)}`)
              continue
            }
            if (!switchOn.includes(code)) switchOn.push(code)
          }
        }
      }
      const rawChain = data.model.chain
      if (rawChain !== undefined) {
        if (!Array.isArray(rawChain)) {
          errors.push('model.chain 必须是数组')
        } else {
          rawChain.forEach((entry, index) => {
            const at = `model.chain[${index}]`
            if (!isPlainObject(entry)) {
              errors.push(`${at} 必须是映射`)
              return
            }
            for (const key of Object.keys(entry)) {
              if (!['provider', 'model', 'effort', 'label', 'maxTokens'].includes(key)) {
                errors.push(`${at} 里未知的键 "${key}"：只允许 provider / model / effort / label / maxTokens`)
              }
            }
            if (entry.maxTokens !== undefined
              && (typeof entry.maxTokens !== 'number' || !Number.isSafeInteger(entry.maxTokens) || entry.maxTokens <= 0)) {
              errors.push(`${at}.maxTokens 必须是正整数（不写则用模型默认值）`)
            }
            if (!isNonEmptyString(entry.provider)) errors.push(`${at}.provider 必填`)
            if (!isNonEmptyString(entry.model)) errors.push(`${at}.model 必填`)
            if (entry.effort !== undefined && !isNonEmptyString(entry.effort)) {
              errors.push(`${at}.effort 必须是非空字符串`)
            }
            if (entry.label !== undefined && !isNonEmptyString(entry.label)) {
              errors.push(`${at}.label 必须是非空字符串`)
            }
            if (isNonEmptyString(entry.provider) && isNonEmptyString(entry.model)) {
              chain.push({
                provider: entry.provider,
                model: entry.model,
                ...(isNonEmptyString(entry.effort) ? { effort: entry.effort } : {}),
                ...(isNonEmptyString(entry.label) ? { label: entry.label } : {}),
                ...(typeof entry.maxTokens === 'number' && Number.isSafeInteger(entry.maxTokens) && entry.maxTokens > 0
                  ? { maxTokens: entry.maxTokens }
                  : {}),
              })
            }
          })
          const seen = new Set()
          for (const entry of chain) {
            const key = `${entry.provider}/${entry.model}/${entry.effort ?? ''}`
            if (seen.has(key)) warnings.push(`model.chain 里有重复候选 ${key}（会被去重后仍保留，建议删掉）`)
            seen.add(key)
          }
        }
      }
    }
  }

  // 组是自由的：任何「像个名字」的值都行。这里只挡空值、控制字符和超长。
  let group = DEFAULT_GROUP
  if (data.group !== undefined) {
    const problem = validateGroupName(data.group)
    if (problem !== null) {
      errors.push(`group ${JSON.stringify(data.group)} 不合法：${problem}`)
    } else {
      const trimmed = data.group.trim()
      if (trimmed !== data.group) {
        // trim 掉而不是报错：首尾空白是手滑，不是非法值。但要说一声，
        // 否则用户会以为「工程实践」和「工程实践 」是两个组。
        warnings.push(`group 首尾有空白，已按「${trimmed}」处理`)
      }
      group = trimmed
    }
  } else {
    warnings.push(`没有指定 group，已归入「${DEFAULT_GROUP}」；建议显式写一个分组`)
  }

  // `enabled` 是角色启停的**唯一真值**。分组开关只是批量改它的快捷方式，自身不存状态。
  let enabled = true
  if (data.enabled !== undefined) {
    if (typeof data.enabled !== 'boolean') {
      errors.push('enabled 必须是 true / false')
    } else {
      enabled = data.enabled
    }
  }

  let maxDepth = DEFAULT_MAX_DEPTH
  if (data.maxDepth !== undefined) {
    if (typeof data.maxDepth !== 'number' || !Number.isSafeInteger(data.maxDepth) || data.maxDepth < 0) {
      errors.push(`maxDepth 必须是非负整数，收到 ${JSON.stringify(data.maxDepth)}`)
    } else {
      maxDepth = data.maxDepth
      if (maxDepth === 0) {
        warnings.push('maxDepth: 0 表示「这个角色完全派不出去」。想停用一个角色请用 enabled: false —— 那才是停用的正规开关，maxDepth 只管深度')
      }
    }
  }

  // 子代理**永远**不允许再往下派。这不是「默认值」，是硬规则：
  // 层层分包会让一个任务在无人监督下指数扩散，成本与可控性都会失控。
  // 所以逃生开关本身被判为非法配置 —— 让危险的写法**不可表达**，
  // 而不是给个默认 false 然后指望没人去改它。
  let allowRedelegation = false
  if (data.allowRedelegation !== undefined) {
    if (typeof data.allowRedelegation !== 'boolean') {
      errors.push('allowRedelegation 必须是 true / false')
    } else if (data.allowRedelegation === true) {
      errors.push(
        'allowRedelegation: true 不被允许：本插件下子代理永远不能再往下派子代理'
        + '（层层分包会让一个任务无人监督地扩散）。删掉这个字段即可。',
      )
    } else {
      allowRedelegation = false
    }
  }

  let backgroundMode = 'one-shot'
  if (data.backgroundMode !== undefined) {
    if (!BACKGROUND_MODES.includes(data.backgroundMode)) {
      errors.push(`backgroundMode 只能是 ${BACKGROUND_MODES.join(' / ')}`)
    } else {
      backgroundMode = data.backgroundMode
    }
  }

  if (skills.length > 0 && tools.allow.length > 0 && !tools.allow.includes('skill')) {
    warnings.push('技能白名单里没有 "skill"：官方技能目录只在 `skill` 工具可见时发布，收窄工具会让技能目录整体消失（派发时会自动补上 "skill"）')
  }

  if (maxDepth > 1) {
    warnings.push(
      `maxDepth=${maxDepth} 没有实际作用：子代理永远不能再往下派，所以派发时一律按`
      + '「刚好允许这一层」计算（父深度+1）。写 1 或删掉这个字段都行。',
    )
  }

  if (errors.length > 0) return { ok: false, errors, warnings }

  return {
    ok: true,
    errors,
    warnings,
    role: {
      id,
      name: data.name.trim(),
      description: data.description.trim(),
      group,
      enabled,
      persona,
      skills,
      tools,
      model: { chain, switchOn },
      maxDepth,
      allowRedelegation,
      backgroundMode,
      sourcePath: context && context.sourcePath ? context.sourcePath : null,
    },
  }
}

/**
 * 把角色对象序列化回文件文本（frontmatter + 正文）。
 * 字段顺序固定，便于 diff。
 * @param {object} role - parseRole 返回的归一化角色。
 * @returns {string}
 */
export function serializeRole(role) {
  const data = {
    name: role.name,
    description: role.description,
    group: role.group || DEFAULT_GROUP,
  }
  // enabled 默认 true，只在 false 时写出来 —— 保持文件简洁，也让 diff 只出现真正的改动
  if (role.enabled === false) data.enabled = false
  if (role.skills && role.skills.length > 0) data.skills = [...role.skills]
  if (role.tools && (role.tools.allow.length > 0 || role.tools.deny.length > 0)) {
    data.tools = {}
    if (role.tools.allow.length > 0) data.tools.allow = [...role.tools.allow]
    if (role.tools.deny.length > 0) data.tools.deny = [...role.tools.deny]
  }
  if (role.model && ((role.model.chain && role.model.chain.length > 0) || (role.model.switchOn && role.model.switchOn.length > 0))) {
    data.model = {}
    if (role.model.chain && role.model.chain.length > 0) {
      data.model.chain = role.model.chain.map((entry) => ({
        provider: entry.provider,
        model: entry.model,
        ...(entry.effort ? { effort: entry.effort } : {}),
        ...(entry.label ? { label: entry.label } : {}),
        ...(entry.maxTokens ? { maxTokens: entry.maxTokens } : {}),
      }))
    }
    if (role.model.switchOn && role.model.switchOn.length > 0) data.model.switchOn = [...role.model.switchOn]
  }
  if (role.maxDepth !== DEFAULT_MAX_DEPTH) data.maxDepth = role.maxDepth
  if (role.allowRedelegation) data.allowRedelegation = true
  if (role.backgroundMode !== 'one-shot') data.backgroundMode = role.backgroundMode

  const yaml = stringifyYaml(data, { lineWidth: 0 }).trimEnd()
  return `---\n${yaml}\n---\n${role.persona.trim()}\n`
}
