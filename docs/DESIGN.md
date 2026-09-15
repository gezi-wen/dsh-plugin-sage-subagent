# dsh-plugin-sage-subagent · 设计定稿

> 2026-09-15 设计评审通过，开始实现。
>
> - **视觉唯一真源**：静态布局稿（四视图可切，含列表/编辑/空态/冲突四个视图）
> - **抽出样式**：`docs/panel.css`（落码时整段嵌进 `lib/client.js`，数值别手改）
> - **官方视觉契约**：`docs/official-ui-language.md`（每个尺寸/颜色的官方出处与行号）

---

## 一、面板结构

挂载：`settings.section` slot，`id: "subagent-roles"`。
外壳由官方提供，**section 根元素在布局上就是 `.VOzbGW_options` 的直接子元素**（外壳用
`display:contents` 包裹）——**不要自己加 max-width 或外层 padding**，内边距由外壳给
`0 24px 24px`，可用宽 564px。

### 视图① 角色列表

```
页头（16/24 500 + 14/22 tertiary）
接管子代理派发                                    [总开关]
[全部] [工程实践 2/3] [审查把关 3/3] [规划与调研 2/2] …   ← 分组筛选 chip，n/m 计数
工程实践 · 3              整组启用 [开关]   [+ 新建角色]
┌────────────────────────────────────────────────┐
│ ● 代码探索者  explorer                    ›  [开关] │  ← 卡右侧：箭头进编辑，开关管启停
│   摸清陌生代码，交回能据以决策的结论              │
│   只读  深度 1                                   │
└────────────────────────────────────────────────┘
```

### 视图② 角色编辑（下钻）

面包屑 `‹ 子代理角色 / 探索者`（**这是「返回上级」的官方答案**）→ 竖排 `.field` 表单
→ 模型链（候选卡片 + 添加候选 + 响应测试 + 折叠的错误码）→ 技能 chips → 工具权限
→ 人设 textarea → 高级（折叠）→ **sticky 底栏** `[删除角色] … [取消] [保存]`。

### 视图③ 空态

官方 `.zGbnIq_modelEmpty` 的虚线框模式 + 一个「新建角色」按钮。**不给多个入口。**

### 视图④ 标识冲突（防呆）

新建/改标识撞名时，标识输入框标红 + 行内报错：

> 标识 **review-security** 已被占用，它已经在「审查把关」组里。换一个标识，
> 或者**复制它到本组**。

**报错必须给出路**——用户被拦住后的下一个念头就是"那我还想在这儿用一个怎么办"，
把动作直接放进报错里。

---

## 二、视觉基线（全部取自官方真值）

| 元素 | 值 | 出处 |
|---|---|---|
| 表单字段 | `.field` **竖排**：label(12/500) 上、input 中、hint 下，gap 6 | `settings-models` |
| 输入框 | 32px / r8 / `bg-layer-1` / **14px**；focus `border-color: brand-primary` | 同上 |
| 占位符 | `label-dimmed` | 同上 |
| 页头 | 16px/24px 500 + 14px/22px tertiary，gap 12 | `.zGbnIq_title` / `_intro` |
| 按钮 | 36px / r18 / 14px（sm 28 / r14 / 12px，`padding:0 10px`） | `_button_cfgyt_4` |
| 卡片 | r16 / `border-l4` / `bg-layer-3`，hover 换 `border-color: label-dimmed` | `.YyYd_a_card` |
| Tag | **999px 胶囊** / `padding:1px 8px` / 11px / lh 17px / w500 | `_tag_brmue_4` |
| 开关 | 36×20 / r10 / 轨道 `border-l3` / 选中 `brand-primary` / thumb 16px `translate(16px)` | `_switch_1vyxu_10` |
| 面包屑 | `.crumb`（tertiary，hover `interactive-bg-hover`）/ `.crumbCurrent`(500) | `ui-conversation` |
| chip 激活态 | `bg = button-primary-fill`（**黑底白字**） | `message-feedback .chipActive` |
| 分组计数 | 全开 `state-success-primary`，未全开 `label-caption` | 参考 skill-mcp-panel |
| 字段报错 | `state-error-primary` | `.zGbnIq_error` |

**两条硬规矩**：

1. **不要加 `letter-spacing`** —— 官方设置 UI 里 0 处使用。
2. 官方 `--dsw-alias-label-error` / `--dsw-alias-bg-layer-4` 是**未定义变量**（官方自己的 bug），
   别抄；用 `--dsw-alias-state-error-primary` / `--dsw-alias-bg-layer-3`。

---

## 三、数据模型

角色文件 `<DSH_HOME>/.agent-roles/<id>.md`，**文件名即 id**。

```yaml
---
name: 代码探索者           # 显示名
group: 工程实践            # 单值；组名就是显示名，中文也行
enabled: true              # 唯一真值
description: 摸清陌生代码，交回能据以决策的结论
skills: [repo-survey]
tools:
  allow: [read, glob, grep, skill]
model:
  chain: []
  switchOn: []
maxDepth: 1
backgroundMode: false
---
（frontmatter 以下的正文 = 人设 / 系统提示词）
```

### 状态语义（重要）

- **`enabled` 是唯一的启用真值。**
- **分组开关不存状态**，它只是一个"把这组每个角色的 `enabled` 改一遍"的批量动作。
  这样组开关和角色开关**永远不可能打架**。
- **一个角色只属于一个组**（`group` 单值）。"同一角色出现在两个组"在单组模型下物理不可能，
  从根上消灭了"A 组关掉牵连 B 组"的问题。
- **`maxDepth: 0` 不再表示停用**（旧语义作废），停用只看 `enabled`。

### 唯一标识与防覆盖

文件系统保证 `<id>.md` 只有一个，所以真正要防的**不是"重复注册"，而是"静默覆盖"**——
新建一个已存在的标识会把那个角色的文件覆盖掉。

| 时机 | 行为 |
|---|---|
| 新建时标识撞了 | 报错 + 写明它在哪个组 |
| 编辑时改标识撞了别人 | 同样报错 |
| **宿主侧写文件那一步** | **也要挡一道**（不能只信前端：`.md` 可被手改、RPC 可被直接调用） |

想让同样的角色也出现在另一个组 → **复制一份、换个标识**（视图④ 的报错里直接给这个动作）。
两者从此各有独立开关，互不牵连。

---

## 四、分组

**分组从角色派生，不是一张写死的清单。** 写一个角色带 `group: 我的项目` 就多一个组；
该组最后一个角色被删或改走，组就消失。**没有组定义文件**，也没有「先建组再放角色」的顺序要求。

- 组名就是显示名（中文也行）—— 既是标识也是名字，**不搞 id ↔ 显示名映射**
- chip **只显示有角色的组**，空组不占位置
- 分组下拉 = 有角色的组 ∪ 内置建议组，最后一项 **＋ 新建分组…**
- 选中某组时列表头有 **重命名**（走 `roles.setGroup`，批量改写该组角色的 `group`）
- 形状约束：非空、无控制字符、≤ 32 字符、首尾空白自动 trim。**没有枚举白名单**

### 内置建议分组（4 组，只给默认角色当初始值）

| 组 | 装什么 | 角色数 | 默认 |
|---|---|---|---|
| 工程实践 | 动手做东西 | 6 | 开 |
| 审查把关 | 检查做得对不对 | 7 | 开 |
| 调研与写作 | 想清楚、写出来 | 7 | 开 |
| 语言与框架 | 特定语言的专家 | 12 | **关** |

前三组按「你要它干什么」划分（动手 / 检查 / 思考表达）；语言专家单独成组，因为 12 个且默认关，
需要一个整组开关。**这四个不是白名单**，用户完全可以不用。

> ⚠️ **2026-09-15 纠正的一处设计错误**：原设计写的是「不做用户自定义分组」，
> 理由是「六个固定组够用；自定义分组会把唯一指向这条搞复杂」。**后半句是概念混淆** ——
> 「组可自定义」与「一个角色只能属于一个组」是两件独立的事，后者才是唯一指向的关键。
> 把两件事打包否掉，等于把自己的分类当成了所有人的分类（和「语言专家导入桥」同一个毛病）。

---

## 五、默认角色集（4 组 32 个）

人设**每个 3–5 行**，只写「职责边界 + 交付标准」，**不写步骤**——
设计评审 2026-09-15 明确：**过度的设定会阻碍模型发挥**。

**工程实践（6）**：`explorer` 代码探索者 · `builder` 实现者 · `debugger` 调试员 ·
`tester` 测试员 · `designer` 界面设计 · `ops` 运维员

**审查把关（7）**：`review-code` 代码审查 · `review-security` 安全审查 · `review-perf` 性能审查 ·
`review-arch` 架构审查 · `review-test` 测试审查 · `review-api` 接口审查 · `review-project` 项目审查

**调研与写作（7）**：`architect` 架构师 · `scout` 检索员 · `researcher` 调研员 ·
`writer` 技术写作 · `slides` 演示文稿 · `analyst` 数据分析（默认关） · `paper` 学术写作（默认关）

> 组内混着开关状态是正常的：启停一律由每个角色自己的 `enabled` 决定，**组不决定默认值**。

**语言与框架（12，默认关）**：`python-pro` · `typescript-pro` · `javascript-pro` · `golang-pro` ·
`rust-engineer` · `java-architect` · `cpp-pro` · `csharp-developer` · `sql-pro` ·
`react-specialist` · `vue-expert` · `powershell-7-expert`

**审查组的统一硬要求**（针对"不好的审查养出屎山"）：

> 只在真有问题时才提，没问题就说没问题，**不要凑数**；按影响排序，风格问题最多提一次，
> 不要淹没真问题；每条写清**触发条件 + 影响 + 怎么改**；区分「确定是问题」和「可能有问题」。

`review-test` 另加一句：**测试本身没人审查**，是假绿和"测试写得像实现注释"的源头，
所以它盯的是"这个测试真的能失败吗"。

落地方式：插件包内置 `defaults/roles/*.md`，**首次加载时若 `.agent-roles/` 为空则复制过去**，
绝不覆盖已存在的文件。

---

## 六、明确不做

- **不做「按子代理指定 MCP」**（连字段都不留）——MCP 由 host 平面全局注册，没有按 agent 挂载的官方入口
- **不做语言专家导入桥**——那是本机 `language-specialists` 技能专有的东西，别的开发者没有
  （2026-09-15 设计评审指出后删除）
- ~~不做用户自定义分组~~ —— **2026-09-15 改为支持**。组从角色派生，可建可改名。
- **不允许子代理再往下派**——反后门是硬规则，`allowRedelegation` 是非法配置

---

## 七、已知的坑（落码时注意）

1. **`ctx.logger` 的输出不进 stdout** —— 三级验证的"打标记"必须用 `console.log`
2. **静态 `ToolDefinition.parameters` 是原始 JSON Schema**，不是动态工具 DSL 的逐字段 `required:true`
3. **技能白名单要自动补 `skill`** —— 不然官方技能目录整体消失（子代理目录 0 条）
4. **`resolveCallConfig` 挡不住模型名写错** —— 额外查一次 `llm.listModels()` 做 `listed` 提示
5. **回退链必须每次请求显式写完整配置** —— 失败请求的配置会写进持久请求头
6. **CSS `[hidden]` 会被 `display:flex` 盖掉** —— 分组筛选就踩过这个，
   `.roleCard[hidden]{display:none}` 必须显式写
7. **别把对象塞进 JSX children** —— 思考强度项是 `{ id, name, description }` 对象
   （`LlmReasoningEffortInfo`），直接当 `<option>` 的 children 会触发 **React error #31**，
   整棵子树被卸载、设置面板变空白。**这就是「点编辑整块空白」的真身**（2026-09-15 复现定位）。
   凡是渲染来自 RPC 的值，先确认它是字符串还是对象。
8. **`projectRole`（host/rpc.js）是手写字段列表** —— schema 加了新字段必须追到这个投影点，
   否则前端拿到的 role 上根本没有那个字段（表现是分组计数全 `0/0`）。加字段时记得全局搜一遍
   谁在投影 role。
