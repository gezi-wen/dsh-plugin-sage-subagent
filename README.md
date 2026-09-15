# dsh-plugin-sage-subagent

给「子代理（subagent）」定义**有名有姓的角色**：每个角色自带人设、专属技能、工具权限、
模型链（含失败顺序回退）、启停状态与递归深度，**不影响主代理与其他子代理**。

开箱自带 **4 组 32 个默认角色**；**分组能从角色派生，也能自己建、自己改名**。与官方 `subagent` 工具**并存**。

## 安装

```bash
# 装进某个 profile（推荐）
dsh plugin --profile web add dsh-plugin-sage-subagent

# 或者直接在 profile 目录里用 npm / pnpm 装
cd <DSH_HOME>/profiles/web
pnpm add dsh-plugin-sage-subagent
```

装完**重启那个 profile 的实例**，就能在「设置 → 子代理角色」看到面板。

第一次打开时，如果你的 `<DSH_HOME>/.agent-roles/` 是空的，插件会自动铺开这 32 个默认角色；
里面已经有角色就**完全不动** —— 不覆盖你的文件，也不会把你删掉的内置角色塞回来。

## 为什么是「role」这个词

DSH 核心已经占用了三个近义词：`profile`（部署 profile，`--profile web`）、
`persona`（部署人格字段）、`preset`（会话预设）。`role` 未被占用，且语义准确。

## 快速了解

- **角色存文件**：`<DSH_HOME>/.agent-roles/<id>.md`，可 git、可 diff、手改最顺手
- **默认角色**：插件包内置 `defaults/roles/`，**首次加载时若角色目录为空则自动铺开**；
  目录里已经有角色就完全不动（不覆盖、也不把用户删掉的角色塞回来）
- **分组**：从角色派生 —— 写一个 `group` 值就多一个组，没有组定义文件。**一个角色只属于一个组**
- **启停**：每个角色一个开关，列表里直接拨；也可以整组开/关
- **模型链**：有序候选，第一个不可用时按错误码自动往下切
- **子代理永远不能再往下派**（硬规则，见下）

## 分组

**分组是从角色派生出来的，不是一张写死的清单。**

写一个角色带 `group: 我的项目`，就多出一个叫「我的项目」的组；该组最后一个角色被删掉或改走，
这个组就消失。所以没有「组定义文件」要维护，也没有「先建组、再放角色」这种顺序要求。

- 组名**就是显示名**，中文也行 —— 它既是标识也是名字，不需要 id ↔ 显示名的映射
- 编辑角色时，分组下拉列出「有角色的组 ∪ 内置建议组」，最后一项是 **＋ 新建分组…**
- 选中某个组时，列表头上有 **重命名** —— 它会把这一组所有角色的 `group` 字段一起改写
- **chip 只显示有角色的组**，空组不占位置

### 内置建议分组（4 组）

| 组 | 装什么 | 角色数 | 默认 |
|---|---|---|---|
| 工程实践 | **动手做东西** | 6 | 开 |
| 审查把关 | **检查做得对不对** | 7 | 开 |
| 调研与写作 | **想清楚、写出来**（不直接改代码） | 7 | 开 |
| 语言与框架 | 特定语言的专家 | 12 | **关** |

前三个是**按「你要它干什么」分的** —— 动手、检查、思考表达，任何人做任何事都落在这三类里。
第四个单独拎出来，是因为语言专家有 12 个、而且默认关着，需要一个「整组开关」一次放出来。

**这四个只是内置默认角色用的初始值**，你完全可以不用，去建自己的组。

### 三条状态规则（改代码前务必理解）

1. **`enabled` 是启停的唯一真值。**
2. **分组开关不存状态** —— 它只是「把这组每个角色的 `enabled` 改一遍」的批量动作。
   这样组开关和角色开关**永远不可能打架**。
3. **一个角色只属于一个组**（`group` 是单值）。「同一角色出现在两个组」在单组模型下物理不可能，
   从根上消灭了「A 组关掉牵连 B 组」的问题。想要同样的角色出现在另一个组，
   **复制一份、换个标识** —— 两者从此各有独立开关，互不牵连（界面里报错提示会直接给这个动作）。

> 组名允许**任意像个名字的值**（非空、不含控制字符、≤ 32 字符、首尾空白自动 trim）。
> 只有这几条形状约束就够了 —— 但也不能一条都没有：否则「工程实践」和「工程实践 」
> 会变成两个看起来一模一样的组。

## 默认角色集（4 组 32 个）

人设一律 **3–5 行**，只写「职责边界 + 交付标准」，**不写步骤** ——
步骤该由主代理按当下情况决定，写死在角色里等于替它做决定、把它的手脚捆住。

**工程实践** `explorer` 代码探索者 · `builder` 实现者 · `debugger` 调试员 ·
`tester` 测试员 · `designer` 界面设计 · `ops` 运维员

**审查把关** `review-code` 代码审查 · `review-security` 安全审查 · `review-perf` 性能审查 ·
`review-arch` 架构审查 · `review-test` 测试审查 · `review-api` 接口审查 · `review-project` 项目审查

> 审查是重灾区：审查不到位直接养出屎山。所以这一组有统一的硬要求 ——
> 只在真有问题时才提、没问题就说没问题、**不要凑数**；按影响排序，风格问题最多提一次；
> 每条写清「什么条件下出问题 + 影响 + 怎么改」。
> `review-test` 单独说一句：**测试本身没人审查**，它是假绿和「测试写得像实现注释」的源头。

**调研与写作** `architect` 架构师 · `scout` 检索员 · `researcher` 调研员 ·
`writer` 技术写作 · `slides` 演示文稿 · `analyst` 数据分析（默认关） · `paper` 学术写作（默认关）

> 这一组里 `analyst` / `paper` 默认关（给做科研的人用），所以它的 chip 显示 `5/7`。
> **组内混着开关状态是正常的** —— 启停一律由每个角色自己的 `enabled` 说了算，组不决定默认值。

**语言与框架**（默认关）`python-pro` · `typescript-pro` · `javascript-pro` · `golang-pro` ·
`rust-engineer` · `java-architect` · `cpp-pro` · `csharp-developer` · `sql-pro` ·
`react-specialist` · `vue-expert` · `powershell-7-expert`

默认角色由 `tools/generate-default-roles.mjs` 生成：内容集中一处，改完重跑，不会漏改某一个。

## 角色文件格式

位置：`<DSH_HOME>/.agent-roles/<id>.md`（可用环境变量 `SAGE_AGENT_ROLES_DIR` 覆盖）。
**frontmatter 是元数据，markdown 正文就是人设 / 系统提示词。**

```markdown
---
name: 代码探索者
description: 要摸清一块陌生代码的结构、依赖与入口时用它；只读，不改任何文件
group: 工程实践
enabled: true
skills:
  - repo-survey
tools:
  allow:
    - read
    - glob
    - grep
    - skill
model:
  chain:
    - provider: deepseek-official
      model: deepseek-flash
    - provider: deepseek-official
      model: deepseek-v4-pro
  switchOn:
    - RATE_LIMIT
    - TIMEOUT
maxDepth: 1
backgroundMode: one-shot
---
你是「代码探索者」。把一块陌生代码摸清楚，交回能直接拿去做决定的结论。你不修改任何文件。
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `name` | ✅ | 显示名 |
| `description` | ✅ | **何时用它**（写触发场景，不写职责）—— 进工具描述，是主代理选角色的**唯一**依据 |
| （正文） | ✅ | 人设 / 系统提示词 |
| `group` | | 任意「像个名字」的值（中文也行）。**组是派生的**：写一个新值就多一个组。省略则归入 `工程实践` 并给提示；首尾空白自动 trim |
| `enabled` | | 默认 `true`。**停用只看这个字段** |
| `skills` | | 子代理专属技能池里的技能名（**只做加法**，见下） |
| `tools` | | `allow` / `deny`，**精确工具名**（不支持通配符） |
| `model.chain` | | 有序候选；省略则继承父代理 |
| `model.switchOn` | | 命中哪些错误码才往下切（默认覆盖「路由服务不了我们」那一组，**不含** `INVALID_REQUEST`） |
| `maxDepth` | | 默认 1。写大于 1 没有实际作用（见「硬规则」）。**`0` 是「这个角色完全派不出去」—— 但停用请用 `enabled: false`** |
| `backgroundMode` | | `one-shot`（默认）或 `continuable` |

未识别的 frontmatter 键会**响亮失败**（连同键名），不静默丢弃。

## 标识唯一与防覆盖

文件名即标识，文件系统保证 `<id>.md` 只有一个。所以真正要防的**不是「重复注册」，而是「静默覆盖」**——
新建一个已存在的标识会把那个角色的文件整个抹掉。

| 时机 | 行为 |
|---|---|
| 新建时标识撞了 | 报错，并写明**它已经在哪个组里**，同时给一个「复制它到本组」的动作 |
| 编辑时改了标识撞了别人 | 同样报错 |
| **宿主侧写文件那一步** | **再挡一道**（`saveRole` 默认 `mode: 'create'`） |

最后一条不能省：前端校验是给用户看的，宿主侧那道是给「`.md` 被手改」或「RPC 被直接调用」兜底的。
**只信前端的结果，就是某天有人的角色被静默抹掉。**

## 硬规则：子代理永远不能再往下派

这不是默认值，是**结构性事实**。层层分包会让一个任务在无人监督下指数扩散，成本与可控性一起失控。
所以 `allowRedelegation: true` 会被判为**非法配置**（写 `false` 或直接删掉这个字段都可以），
**没有任何开关能打开它**。

实现是**调用时刻的动态 guard**，注册在子代理自己的 `agent.ctx` 上：

```js
scoped.tools.guard((execution) =>
  execution.name === 我们的工具名 || execution.name.startsWith('subagent')
    ? '本角色不允许再往下派子代理（allowRedelegation: false）'
    : undefined)
```

**为什么必须这么做**（三条都是实测踩出来的，别改回去）：

1. **`maxDepth` 挡不住**。它是「我这一次创建的这个孩子」的深度上限，管不到那个孩子以后自己派谁——
   实测：`maxDepth=1` 的子代理照样成功派出了孙代理，因为孙代理那一层用的是
   **官方委派工具实例自己**的配置。
2. **`tools.restrict()` 删不掉官方委派工具**。它注册在 agent 本层，而官方明确
   「restriction 只过滤继承来的工具，永不过滤本层自己的注册」。
3. **黑名单不能预先算**。官方委派工具是「逐 agent、稍后注册」的，`agent/created` 那一刻的快照里
   可能只有 `subagent_fork` 而没有 `subagent`；按快照算名单会漏掉主入口，子代理照样派得出去。
   所以 guard 里必须是**调用时刻的前缀判断**，不能查表。

## 子代理专属技能（只做加法）

技能正文放 `<DSH_HOME>/.agent-roles/skills/<名>/SKILL.md`，**只注册进子代理自己的作用域**
（`agent.ctx` + `ctx.skills.register`），因此只有该子代理看得见。

> ⚠️ 视图是「全局层 ∪ 本作用域链」。所以**全局技能目录对子代理仍然可见**——
> 本插件只做加法，不做收窄。收窄（同名遮蔽）已实测可行，留作后续可选项。

## 明确不做

- **不做「按子代理指定 MCP」**。MCP 工具由 host 平面的 `dsh-mcp-client` 全局注册，
  没有官方的按 agent 挂载入口。需要时**在派发 prompt 里写清**让子代理去用即可。
- **不做语言专家导入桥**。曾经有过一个「从 `<DSH_HOME>/skills/language-specialists/` 导入」的功能，
  2026-09-15 删除：那是某个特定环境专有的技能库，别的开发者装上根本没有这个目录，按钮点了只会是空的。
  语言专家改为**内置的默认角色**。
- **用户自定义分组？做。** 组从角色派生，想建就建、想改名就改名（见上「分组」）。
  这里曾经写的是「不做」，理由是「六个固定组够用、自定义会把唯一指向搞复杂」——
  后半句是概念混淆：**「组可以自定义」和「一个角色只能属于一个组」是两件事**，
  后者才是唯一指向的关键，前者完全无害。2026-09-15 纠正。
- 不新增自定义 session 事件类型，不新增自定义 `source.kind`（会让会话在后续 DSH 版本读不出来）。

## 模块规则（防腐化，改代码前先读）

```
lib/
  index.js            host 半：装配与生命周期（薄）
  client.js           client 半：槽注册 + 面板（**单文件**，见下）
  shared/*.js         纯逻辑：无文件系统、无 Cordis、无副作用 ← 单测覆盖
  host/*.js           运行时接线：读写、注册、事件（薄）
defaults/roles/*.md   内置默认角色（由 tools/ 生成）
docs/                 设计定稿、样式真源、官方视觉契约
tools/                生成脚本
```

1. **跨层调用只允许 `lib/* → shared/* → 无`**。`shared/` 不许 import `host/` 或 `lib/`。
2. `shared/` 与 `host/role-store.js` 的业务判断必须可单测；`host/` 其余模块只做接线。
3. 新增一个职责就新增一个模块，不要把逻辑塞进 `index.js`。

### 为什么 client.js 是单文件

浏览器半边的模块加载器（`dsh-client-modules`）只解析**模块图里已注册的 specifier**
（包名，以及去掉尾部 `/client` 的规范化形式）。相对路径不在图里，`require('./x.js')` 会直接抛错。
**官方和所有第三方插件的 client.js 都是单文件**，原因就在这里。

### CSS 从哪来

`lib/client.js` 里的 `const CSS` 那一段**是生成的，不要手改**。样式真源是 `docs/panel.css`：

```powershell
node tools/sync-panel-css.mjs
```

它做四件事：剥掉布局稿专用段（审阅工具条、视图互斥）、剥掉官方外壳段（`.overlay`/`.panel`/`.nav`/`.options`
——那些由 DSH 提供）、给类选择器加 `sr-` 前缀（避免与其它插件撞车）、把全局元素选择器收进 `.sr-root` 作用域。

> ⚠️ 顺序不能换：**先前缀化，再收作用域**。反过来的话 `.sr-root` 会被前缀化二次改名成 `.sr-sr-root`。
> ⚠️ `docs/panel.css` 的**注释里不要出现带前导点的类名** —— 抽取脚本会把注释里的 `.xxx` 一起前缀化。

## 开发与验证

> 下面这些是**给从源码仓库开发的人**的。用 npm 装的话，包里只有 `lib/` + `defaults/` + 文档，
> 没有 `tests/` 和 `tools/`（`files` 白名单刻意如此）。

按技能 `dsh-plugin-development` 的隔离流程：fork/开发 → 挂 `web-test` profile（`link:`）
→ 三级验证（`--dump-config` 验组合 / 模块解析 / 真启动打标记）→ 确认后才动生产。

```powershell
# 纯逻辑单测（pwsh 不展开 glob，显式列文件最稳）
$files = Get-ChildItem tests -Filter *.spec.js | ForEach-Object { $_.FullName }
node --test @files

node tools/generate-default-roles.mjs   # 重新生成默认角色
node tools/sync-panel-css.mjs           # 样式注入 client.js
```

**测写操作时记得隔离角色目录**，别拿真实数据试：

```powershell
$env:SAGE_AGENT_ROLES_DIR = "$env:TEMP\roles-test"   # 临时目录就行，别拿真实数据试
node $env:DSH_HOME\..\npm\node_modules\@deepseek-ai\dsh\lib\bin.js --profile web-test --port 0 --no-open
```

空目录会触发默认角色铺开；启动日志里那行
`[subagent-roles] loaded reason=startup roles=N skills=M dir=...` 就是三级验证的标记。

## 已知的坑（都踩过，别改回去）

1. **`ctx.logger` 的输出不进 stdout**（只上 Web 日志面）—— 打标记必须用 `console.log`。
2. **静态 `ToolDefinition.parameters` 是原始 JSON Schema**，不是动态工具 DSL 的逐字段 `required: true`。
3. **技能白名单要自动补 `skill`** —— 不然官方技能目录整体消失（子代理看到的目录 0 条）。
4. **`resolveCallConfig` 挡不住模型名写错** —— 额外查一次 `llm.listModels()` 做 `listed` 提示。
5. **回退链必须每次请求显式写完整配置** —— 失败请求的配置会写进持久请求头，增量改写下一次 attempt 会拿到旧值。
6. **CSS `[hidden]` 会被 `display: flex` 盖掉** —— `.sr-roleCard[hidden]{display:none}` 必须显式写。
7. **别把对象塞进 JSX children** —— 思考强度项是 `{ id, name, description }` 对象（`LlmReasoningEffortInfo`），
   直接当 `<option>` 的 children 会触发 **React error #31**，整棵子树卸载、面板变空白。
   凡是渲染来自 RPC 的值，先确认它是字符串还是对象。
8. **`projectRole`（host/rpc.js）是手写字段列表** —— schema 加了新字段必须追到这个投影点，
   否则前端拿到的 role 上根本没有那个字段（表现是分组计数全 `0/0`）。
9. **RPC 错误响应的 `error.details` 是必填** —— DSH 的 connection 层校验
   `code`/`message`/`details` 三者齐全，少一个就抛 `connection: invalid server-response failure`，
   真正的错误信息被丢掉、界面上只剩那句英文。
10. **`roles.list` 的投影不含 `persona`**（人设正文大，列表页用不到），所以**切开关要走
    `roles.setEnabled`**，不能拿列表里的对象回传给 `roles.save` —— 那会崩在 `persona.trim()`。
11. **作用域化时不要加 `color: inherit`** —— `.sr-root button`（0,1,1）的特异性高于
    `.sr-btnPrimary`（0,1,0），会把主按钮文字色盖成继承色，深色主题下白底白字、按钮变成一块空白。

## 模块解析（改依赖前先读）

本插件在 `$DSH_HOME` 树之外，Node 向上查找永远够不到 DSH 的依赖闭包。所以：

```powershell
# 直接在插件目录做 junction 指向闭包
New-Item -ItemType Junction -Path "node_modules\<包名>" -Target "$env:DSH_HOME\profiles\node_modules\<包名>"
```

peer 一律写 `*`，DSH 升级后闭包自动变新，本文件不用动。

## License

**Apache-2.0** —— 见 [LICENSE](LICENSE)，署名与第三方说明见 [NOTICE](NOTICE)。

面板 UI 遵循 DeepSeek Harness 官方设计语言（MIT）。**没有复制 DSH 源码**：
尺寸、颜色、间距与交互模式都是对着官方公布的 CSS 变量（`--dsw-*`）和产物里量出来后
**重新实现**的 —— 这一点在 NOTICE 里也写明了。

