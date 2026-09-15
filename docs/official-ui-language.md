# DSH 官方 Web 设置面板视觉/结构语言（只读侦察报告）

只读侦察，未修改任何文件。**两点先更正**：

1. 代码不在 `dist/`，在 **`lib/`**：`lib/client.js` = 浏览器半边；`lib/types/**.d.ts` = 完整类型契约。`lib/*.js` **未压缩**（有行号）；**CSS 是压缩过的单行字符串常量**（`const css$3 = ".Xxx_a_b{…}"`）。
2. `@deepseek-ai/dsh-client-ui-primitives`（Button/Modal/Switch/Icon* 来源）**不是磁盘上的包**，是 `dsh-web-frontend` bundle 里的虚拟模块（`index-DuF6ti6g.js`：`"@deepseek-ai/dsh-client-ui-primitives": Wg`）。它的 **CSS 落在共享样式表 `index-DPX2bQLO.css`**，类名形如 `._button_cfgyt_4`、`._switch_1vyxu_10`、`._tag_brmue_4`。

> **实操结论**：CSS Module 类名带每包哈希（`VOzbGW_` / `zGbnIq_` / `qSYn7G_` / `_cfgyt_`…），**重建即变，不要硬编码**。用下面的 `--dsw-*` 变量 + 相同数值，套自己的类名。

| 来源 | 角色 |
|---|---|
| `dsh-client-ui-settings-general/lib/client.js` | 设置外壳（面板 + 导航）+ General 页 |
| `dsh-client-ui-settings/lib/types/client/contract/slots.d.ts` | 全部 settings slot 类型与 props |
| `dsh-client-ui-settings-models/lib/client.js` | Models 页（字段最全） |
| `dsh-client-ui-settings-plugins/lib/client.js` | Plugins 页（卡片 / 开关 / tab） |
| `dsh-client-ui-settings-plugin-inventory/lib/client.js` | 插件清单页（网格卡片 / 搜索 / 空状态） |
| `dsh-client-ui-subagent/lib/client.js` | 子代理 UI |
| `dsh-client-ui-theme/lib/client.js` | **设计令牌定义**（不在共享 CSS 里！） |
| `dsh-web-frontend/dist/assets/index-DPX2bQLO.css` | 共享原语 CSS（单行 51949 B，449 规则） |

---

## 1. 设置对话框外壳

来自 `dsh-client-ui-settings-general/lib/client.js`（`SettingsPanel`，L99–172）。类前缀 `VOzbGW_`。

### 1.1 嵌套顺序（官方 DOM 树，原样）

```
div.VOzbGW_overlay                    role="presentation"
├─ div.VOzbGW_mask                    aria-hidden="true"，onClick=close
└─ div.VOzbGW_panel                   role="dialog" aria-modal="true" aria-labelledby=<titleId>
   ├─ nav.VOzbGW_nav                                    ← 左侧导航栏
   │  ├─ div.VOzbGW_navTitle  id=<titleId>              ← renderSlot("settings.header")
   │  └─ div.VOzbGW_navList
   │     └─ button.VOzbGW_navCell (+ .VOzbGW_active)    ← 每个 section 一行
   │        ├─ <Icon className="VOzbGW_navIcon" size={16}>
   │        └─ span.VOzbGW_navLabel
   └─ div.VOzbGW_content
      ├─ div.VOzbGW_header
      │  ├─ div.VOzbGW_actions                          ← renderSlot("settings.action")
      │  └─ button.VOzbGW_close
      │     ├─ <IconCloseOutline16 size={14}>
      │     └─ span.VOzbGW_hiddenLabel                  ← renderSlot("settings.close")
      └─ div.VOzbGW_options                             ← 唯一滚动容器
         └─ renderSlot("settings.section", {close}, { only: active })
```

### 1.2 外壳规则

```css
.VOzbGW_overlay { z-index:1000; justify-content:center; align-items:center; display:flex; position:fixed; inset:0 }
.VOzbGW_mask { background:var(--dsw-alias-bg-mask-1); backdrop-filter:var(--dsw-mask-blur); position:absolute; inset:0 }
.VOzbGW_panel { z-index:1; background:var(--dsw-alias-bg-layer-2); width:800px; max-width:calc(100vw - 48px); height:min(800px,100vh - 48px); box-shadow:var(--dsw-elevation-prominent); border-radius:32px; --dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2); --dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2); display:flex; position:relative; overflow:hidden }
.VOzbGW_nav { box-sizing:border-box; flex-direction:column; flex:none; gap:18px; width:188px; padding:22px 12px 0; display:flex }
.VOzbGW_navTitle { color:var(--dsw-alias-label-primary); padding:0 12px; font-size:16px; font-weight:500; line-height:24px }
.VOzbGW_navList { flex-direction:column; gap:4px; display:flex }
.VOzbGW_navCell { box-sizing:border-box; cursor:pointer; height:40px; color:var(--dsw-alias-label-primary); text-align:left; background:0 0; border:none; border-radius:12px; align-items:center; gap:8px; padding:9px 16px 9px 12px; font-family:inherit; font-size:14px; font-weight:400; line-height:22px; display:flex }
.VOzbGW_navCell:hover { background:var(--dsw-specific-sidebar-nav-item-hover) }
.VOzbGW_navCell.VOzbGW_active { background:var(--dsw-specific-sidebar-nav-item-active) }
.VOzbGW_navIcon { flex:none }
.VOzbGW_navLabel { white-space:nowrap; text-overflow:ellipsis; flex:1; min-width:0; overflow:hidden }
.VOzbGW_content { flex-direction:column; flex:1; min-width:0; display:flex }
.VOzbGW_header { box-sizing:border-box; flex:none; justify-content:space-between; align-items:flex-start; gap:8px; height:54px; padding:20px 14px 8px 10px; display:flex }
.VOzbGW_actions { justify-content:flex-end; align-items:center; gap:8px; min-width:0; margin-left:auto; display:flex }
.VOzbGW_close { cursor:pointer; width:28px; height:28px; color:var(--dsw-alias-label-primary); background:0 0; border:none; border-radius:28px; justify-content:center; align-items:center; padding:0; display:inline-flex }
.VOzbGW_close:hover { background:var(--dsw-alias-interactive-bg-hover) }
.VOzbGW_options { flex:1; min-height:0; padding:0 24px 24px; overflow-y:auto }
.VOzbGW_hiddenLabel { clip:rect(0 0 0 0); white-space:nowrap; width:1px; height:1px; position:absolute; overflow:hidden }
```

要点：**`.VOzbGW_options` 是唯一滚动容器**（`overflow-y:auto`），它是**块级容器不是 flex**，内边距 `0 24px 24px`（**顶部 0**）；面板背景 `--dsw-alias-bg-layer-2`（不是 layer-1）、圆角 `32px`、上限 `800×800`；默认选中 **第一行**（`rows.find(r=>r.id===activeId)?.id ?? rows[0]?.id`）；打开时焦点自动落到关闭按钮；`Escape` 由挂在 `document` 上的 keydown 关闭（仅打开期间挂载）；关闭按钮圆角 `28px`（共享原语 `._close_w1urq_61` 是 `8px`）且**无** `:focus-visible` 规则。

### 1.3 侧栏触发按钮（打开设置那一行）

```css
.VOzbGW_triggerRow { flex:none; align-items:center; gap:8px; width:calc(100% + 4px); margin:4px -2px; display:flex }
.VOzbGW_triggerRow.VOzbGW_railRow { width:36px; margin:8px 0 10px }
.VOzbGW_trigger { box-sizing:border-box; cursor:pointer; width:auto; min-width:0; height:42px; color:var(--dsw-alias-label-primary); background:0 0; border:none; border-radius:12px; flex:1; align-items:center; gap:8px; margin:0; padding:0 10px 0 8px; font-family:inherit; font-size:14px; line-height:22px; display:flex; overflow:hidden }
.VOzbGW_trigger:hover { background:var(--dsw-alias-interactive-bg-hover) }
.VOzbGW_trigger.VOzbGW_rail { corner-shape:round; border-radius:50%; flex:none; justify-content:center; gap:0; width:36px; height:36px; margin:0; padding:0 }
.VOzbGW_triggerLabel { white-space:nowrap; overflow:hidden }
```

### 1.4 导航图标硬编码（`navIcon(id)`，L76–93）

`"models"`→`IconDataOutline16`；`"agent-presets"`→`IconAgentPresetOutline16`；`"plugins"`→`IconPersonalizationOutline16`；**其它（含第三方）全部兜底 `IconSettingsOutline16`**。均 `size: 16`、`className: VOzbGW_navIcon`（=`flex:none`）。**没有**第三方自定义图标 seat。

---

## 2. Section header 模式

设置页**没有**外壳渲染的内容标题栏：内容列头部只有 `settings.action` + 关闭按钮，**对话框标题文字在左栏顶部**（`.VOzbGW_navTitle`）。每个 section 自己画标题。

**A. Models 页（`zGbnIq_`）——最标准。** 结构：`div.zGbnIq_section > h2.zGbnIq_title + p.zGbnIq_intro + p.zGbnIq_notice（条件，只读提示）+ p.zGbnIq_savedNotice（条件，role="status" aria-live="polite"）+ ul.zGbnIq_rows`

```css
.zGbnIq_section { max-width:720px; color:var(--dsw-alias-label-primary); flex-direction:column; gap:12px; display:flex }
.zGbnIq_title { color:var(--dsw-alias-label-primary); margin:0; font-size:16px; font-weight:500; line-height:24px }
.zGbnIq_intro { color:var(--dsw-alias-label-tertiary); margin:0; font-size:14px; line-height:22px }
.zGbnIq_notice { color:var(--dsw-alias-state-warn-label); margin:0; font-size:12px; line-height:18px }
.zGbnIq_savedNotice { color:var(--dsw-alias-state-success-primary); margin:0; font-size:12px; line-height:18px }
.zGbnIq_rows { flex-direction:column; gap:8px; margin:12px 0 0; padding:0; list-style:none; display:flex }
```

**B. Plugins 页（`pbvGtq_`）——标题更大，tab 下划线做分隔**

```css
.pbvGtq_section { max-width:760px; color:var(--dsw-alias-label-primary); flex-direction:column; gap:12px; display:flex }
.pbvGtq_heading { margin:0; font-size:18px; font-weight:600 }   /* 无 line-height */
.pbvGtq_intro { color:var(--dsw-alias-label-tertiary); margin:0; font-size:13px }
.pbvGtq_tabs { border-bottom:.5px solid var(--dsw-alias-border-l2); align-items:flex-end; gap:22px; margin-top:2px; display:flex }
.pbvGtq_tab { color:var(--dsw-alias-label-tertiary); font:inherit; cursor:pointer; background:0 0; border:0; padding:7px 1px 9px; font-size:13px; line-height:20px; position:relative }
.pbvGtq_tab:hover, .pbvGtq_tab[data-active=true] { color:var(--dsw-alias-label-primary) }
.pbvGtq_tab[data-active=true]:after, .pbvGtq_tab:focus-visible:after { background:var(--dsw-alias-label-primary); content:""; border-radius:2px 2px 0 0; height:2px; position:absolute; bottom:-1px; left:0; right:0 }
.pbvGtq_panel { min-width:0; padding-top:2px }
.pbvGtq_cards { flex-direction:column; gap:10px; margin:0; padding:0; list-style:none; display:flex }
.pbvGtq_empty { color:var(--dsw-alias-label-tertiary); margin:0; font-size:13px }
```

**C. 插件清单页**：`section { width:100%; max-width:760px; gap:14px }`。

**分隔线**：Models 页标题下方**没有**分隔线（只靠 `gap:12px`）；Plugins 页只有 tab 行有 `border-bottom:.5px solid var(--dsw-alias-border-l2)`。**「标题 + 副标题 + 顶部横向细线」这个模式在设置页不存在**——细线用在字段行之间（§3.1B / §3.5D）。

---

## 3. 可复用字段行模式

### 3.1 带标签的文本输入

**A. Models 页（`div.field` 组式）**：`div.field > span.fieldLabel + input.input + (p.advancedHint | p.error)`

```css
.zGbnIq_field { flex-direction:column; gap:6px; display:flex }
.zGbnIq_fieldLabel { color:var(--dsw-alias-label-secondary); align-items:center; gap:10px; font-size:12px; font-weight:500; line-height:18px; display:inline-flex }
.zGbnIq_input { box-sizing:border-box; border:.5px solid var(--dsw-alias-border-l4); width:100%; height:32px; font:inherit; background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-primary); border-radius:8px; padding:0 10px; font-size:14px; line-height:22px }
.zGbnIq_input:focus { border-color:var(--dsw-alias-brand-primary); outline:none }
.zGbnIq_input::placeholder { color:var(--dsw-alias-label-dimmed) }
.zGbnIq_input:disabled { opacity:.6; cursor:default }
.zGbnIq_advancedHint { color:var(--dsw-alias-label-tertiary); margin:0; font-size:12px; line-height:18px }
.zGbnIq_error { color:var(--dsw-alias-state-error-primary); margin:0; font-size:12px; line-height:18px }
```

**B. Plugins 页（`At1oFq_`，行式 + 行间分隔线 + 重置按钮）**

```css
.At1oFq_field { flex-direction:column; gap:6px; padding:12px 0; display:flex }
.At1oFq_field+.At1oFq_field { border-top:.5px solid var(--dsw-alias-border-l2) }
.At1oFq_head { align-items:center; gap:8px; display:flex }
.At1oFq_label { min-width:0; color:var(--dsw-alias-label-primary); flex:1; font-size:13px; font-weight:500; line-height:1.5 }
.At1oFq_badges { align-items:center; gap:8px; display:inline-flex }
.At1oFq_reset { font:inherit; color:var(--dsw-alias-label-secondary); cursor:pointer; background:0 0; border:none; padding:0; font-size:12px; line-height:1.5 }
.At1oFq_reset:hover:not(:disabled) { color:var(--dsw-alias-label-primary) }
.At1oFq_input { border:.5px solid var(--dsw-alias-border-l4); background:var(--dsw-alias-bg-layer-3); height:34px; font:inherit; color:var(--dsw-alias-label-primary); border-radius:8px; padding:0 12px; font-size:13px; line-height:1.5 }
.At1oFq_input:focus-visible { border-color:var(--dsw-alias-brand-primary); outline:none }
.At1oFq_input:disabled { color:var(--dsw-alias-label-tertiary); cursor:default }
.At1oFq_inputInvalid { border-color:var(--dsw-alias-label-error) }   /* ← 该变量未定义，见 §4.6 */
.At1oFq_invalid { color:var(--dsw-alias-label-error); margin:0; font-size:12px; line-height:1.5 }
.At1oFq_hint { color:var(--dsw-alias-label-tertiary); margin:0; font-size:12px; line-height:1.5 }
```

**C. 共享原语输入容器**（可选，比裸 input 多一层边框容器）

```css
._wrap_1g6ru_1 { display:inline-flex; align-items:center; gap:6px; height:32px; padding:0 8px; border:.5px solid var(--dsw-alias-border-l4); border-radius:8px; background:var(--dsw-alias-bg-layer-1) }
._wrap_1g6ru_1:focus-within { border-color:var(--dsw-alias-brand-primary) }
._input_1g6ru_25 { flex:1; min-width:0; border:none; outline:none; background:transparent; font-size:14px; line-height:22px; color:var(--dsw-alias-label-primary) }
._input_1g6ru_25::placeholder { color:var(--dsw-alias-label-dimmed) }
```

**D. 搜索框（清单页，带图标）**

```css
.qSYn7G_search { width:100%; color:var(--dsw-alias-label-tertiary); align-items:center; display:flex; position:relative }
.qSYn7G_search>svg { pointer-events:none; position:absolute; left:12px }
.qSYn7G_search input { border:.5px solid var(--dsw-alias-border-l4); background:var(--dsw-alias-bg-layer-1); width:100%; height:36px; color:var(--dsw-alias-label-primary); font:inherit; border-radius:10px; outline:none; padding:0 34px 0 36px; font-size:13px }
.qSYn7G_search input:focus-visible { border-color:var(--dsw-alias-state-business-primary); box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent) }
```

### 3.2 下拉：官方用**原生 `<select>`**，不是自定义组件

`dsh-client-ui-settings-models` L1304 / L1684 / L2097 全是 `jsx("select", {…})`，复用 `.zGbnIq_input`，再叠一层内联 SVG 箭头：

```css
select.zGbnIq_input { cursor:pointer; max-width:240px }
.zGbnIq_selectInput { appearance:none; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%2381858C' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); background-position:right 12px center; background-repeat:no-repeat; background-size:12px 12px; padding-right:32px }
```

**自定义弹层确实存在**（共享原语，用于 subagent 目录 / dockkit 菜单）：

```css
._list_1nxmc_8,._submenu_1nxmc_9 { box-sizing:border-box; padding:4px; display:flex; flex-direction:column; gap:0; border:0; border-radius:20px; background:var(--dsw-specific-menu); --dsw-elevation-stroke-color:var(--dsw-alias-border-l1); box-shadow:var(--dsw-elevation-prominent); --dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2); --dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2) }
._list_1nxmc_8 { position:absolute; top:calc(100% + 4px); left:0; z-index:100; min-width:218px; max-width:360px }
._portal_1nxmc_44 { position:fixed; top:auto; left:auto; z-index:1100 }   ._sideTop_1nxmc_52 { top:auto; bottom:calc(100% + 4px) }
._scrollable_1nxmc_22 { max-height:calc(100vh - 24px) }   ._scrollable_1nxmc_22 ._viewport_1nxmc_22 { overflow-y:auto }
._footer_1nxmc_64 { flex:none; display:flex; flex-direction:column; margin-top:4px; padding-top:4px; border-top:.5px solid var(--dsw-alias-border-l2) }
._item_1nxmc_92 { display:flex; align-items:center; gap:8px; width:100%; min-height:40px; padding:8px 10px; border:none; border-radius:10px; background:transparent; cursor:pointer; font-size:14px; line-height:22px; color:var(--dsw-alias-label-primary); text-align:left }
._item_1nxmc_92:hover:not(:disabled) { background:var(--dsw-alias-interactive-bg-hover) }   ._item_1nxmc_92:disabled { opacity:.4; cursor:not-allowed }
._itemIcon_1nxmc_144 { display:inline-flex; flex:none; width:16px; height:16px; align-items:center; justify-content:center; color:var(--dsw-alias-label-tertiary) }
._itemLabel_1nxmc_174 { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
._selected_1nxmc_189 { background:transparent }   ._label_1nxmc_124 { padding:8px 10px; font-size:12px; line-height:16px; color:var(--dsw-alias-label-tertiary) }
._separator_1nxmc_82 { height:.5px; margin:4px 2px; background:var(--dsw-alias-border-l1) }
._list_1nxmc_8._compactList_1nxmc_128 { min-width:164px; padding:2px; border-radius:7px }   ._compactList_1nxmc_128 ._item_1nxmc_92 { min-height:26px; gap:6px; padding:3px 7px; border-radius:5px; font-size:12px; line-height:18px }
._menu_17p4l_444 { position:fixed; z-index:70; min-width:96px; padding:4px; background:var(--dsw-alias-bg-layer-3); border:.5px solid var(--dsw-alias-border-l2); border-radius:6px }
._menuItem_17p4l_460 { padding:5px 8px; border-radius:4px; font-size:var(--dsh-content-font-size-secondary, 13px) }
```

> 建议：要下拉就**照抄原生 `<select>` + `.input` 样式**（与 Models 页完全一致）；必须自定义弹层时按上面数值复刻。

### 3.3 开关 / Toggle

设置页唯一的官方开关是原语 `Switch`（`settings-plugins` L609）。DOM = `<button class="_switch_1vyxu_10" aria-checked>` + `<span class="_thumb_1vyxu_38">`：

```css
._switch_1vyxu_10 { box-sizing:border-box; position:relative; flex:0 0 auto; width:36px; height:20px; padding:2px; border:0; border-radius:10px; corner-shape:round; background:var(--dsw-alias-border-l3); cursor:pointer }
._switch_1vyxu_10[aria-checked=true] { background:var(--dsw-alias-brand-primary) }   ._switch_1vyxu_10:disabled { cursor:default; opacity:.5 }
._switch_1vyxu_10:focus-visible { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:2px }
._thumb_1vyxu_38 { display:block; width:16px; height:16px; border-radius:50%; corner-shape:round; background:var(--dsw-alias-label-primary-foreground); transition:transform .12s ease }
._switch_1vyxu_10[aria-checked=true] ._thumb_1vyxu_38 { transform:translate(16px) }
.vCGm7G_permission { gap:6px; padding:12px 0; display:grid }
.vCGm7G_toggleRow { color:var(--dsw-alias-label-primary); justify-content:space-between; align-items:flex-start; gap:16px; font-size:13px; line-height:1.5; display:flex }
.vCGm7G_toggleLabel { flex:1; min-width:0 }
.vCGm7G_hint, .vCGm7G_notice { margin:0; font-size:12px; line-height:1.5; color:var(--dsw-alias-label-tertiary) }
.vCGm7G_invalid, .vCGm7G_conflict { margin:0; font-size:12px; line-height:1.5; color:var(--dsw-alias-label-error) }
```

> `.zGbnIq_switchThumb` 只出现在 models 包的 CSS Module 映射表里，**该包内无对应规则**（仅 reduced-motion 媒体查询引用一次）。开关真实样式只在共享表的 `_switch_1vyxu_10` / `_thumb_1vyxu_38`。裸 `checkbox` 仅出现在「模型候选列表」（无自定义样式）。

### 3.4 按钮

**共享原语（首选）**

```css
._button_cfgyt_4 { display:inline-flex; align-items:center; justify-content:center; gap:4px; border:none; border-radius:18px; cursor:pointer; font-size:14px; line-height:22px; color:var(--dsw-alias-label-primary); background:transparent; padding:0 14px }
._button_cfgyt_4:disabled { cursor:not-allowed; opacity:.4 }
._md_cfgyt_24 { height:36px }   ._sm_cfgyt_30 { height:28px; font-size:12px; line-height:18px; padding:0 10px; border-radius:14px }
._primary_cfgyt_38 { background:var(--dsw-alias-button-primary-fill); color:var(--dsw-alias-label-primary-foreground) }   ._primary_cfgyt_38:hover:not(:disabled) { background:var(--dsw-alias-button-primary-hover) }
._ghost_cfgyt_47:hover:not(:disabled) { background:var(--dsw-alias-interactive-bg-hover) }   ._ghost_cfgyt_47:active:not(:disabled) { background:var(--dsw-alias-interactive-bg-active) }
._outline_cfgyt_56 { border:.5px solid var(--dsw-alias-border-l3); background:transparent }   ._outline_cfgyt_56:hover:not(:disabled) { background:var(--dsw-alias-interactive-bg-hover) }
._toolbar_cfgyt_65 { background:var(--dsw-alias-button-tool-bar-fill) }   ._toolbar_cfgyt_65:hover:not(:disabled) { background:var(--dsw-alias-button-tool-bar-hover) }
._icon_cfgyt_73 { display:inline-flex; width:16px; height:16px; align-items:center; justify-content:center }
```

**设置页自绘按钮（Models 页，与上面数值几乎一致，额外给了 dashed / 行内小尺寸 / link 变体）**

```css
.zGbnIq_primaryButton, .zGbnIq_secondaryButton, .zGbnIq_addButton { box-sizing:border-box; height:36px; font:inherit; cursor:pointer; border:none; border-radius:18px; justify-content:center; align-items:center; gap:4px; padding:0 14px; font-size:14px; line-height:22px; display:inline-flex }
.zGbnIq_primaryButton { background:var(--dsw-alias-button-primary-fill); color:var(--dsw-alias-label-primary-foreground) }   .zGbnIq_primaryButton:hover:not(:disabled) { background:var(--dsw-alias-button-primary-hover) }
.zGbnIq_secondaryButton, .zGbnIq_addButton { border:.5px solid var(--dsw-alias-border-l3); color:var(--dsw-alias-label-primary); background:0 0 }
.zGbnIq_secondaryButton:hover:not(:disabled), .zGbnIq_addButton:hover:not(:disabled) { background:var(--dsw-alias-interactive-bg-hover) }   .zGbnIq_secondaryButton:hover:not(:disabled) { background:var(--dsw-alias-interactive-bg-hover-solid) }
.zGbnIq_rowActions .zGbnIq_secondaryButton, .zGbnIq_rowActions .zGbnIq_dangerButton { border-radius:14px; height:28px; padding:0 10px; font-size:12px; line-height:18px }
.zGbnIq_linkButton { box-sizing:border-box; height:28px; color:var(--dsw-alias-label-tertiary); font:inherit; cursor:pointer; background:0 0; border:none; border-radius:14px; align-items:center; padding:0 10px; font-size:12px; line-height:18px; display:inline-flex }
.zGbnIq_linkButton:hover:not(:disabled) { background:var(--dsw-alias-interactive-bg-hover); color:var(--dsw-alias-label-secondary) }
.zGbnIq_iconButton { box-sizing:border-box; width:28px; height:28px; color:var(--dsw-alias-label-tertiary); cursor:pointer; background:0 0; border:none; border-radius:6px; justify-content:center; align-items:center; display:inline-flex }
.zGbnIq_iconButton:hover:not(:disabled) { background:var(--dsw-alias-interactive-bg-hover); color:var(--dsw-alias-label-primary) }
.zGbnIq_addButton { border:1px dashed var(--dsw-alias-border-l3); border-radius:16px; flex:1 1 0; gap:6px; min-width:180px; height:44px }
/* 缩写：以上每个按钮类都带这两条（原始选择器逐个列出 primaryButton / secondaryButton / dangerButton / addButton / linkButton / addModelButton / iconButton / customizedSummary） */
.zGbnIq_…:disabled { opacity:.4; cursor:default }   .zGbnIq_…:focus-visible { box-shadow:0 0 0 2px var(--dsw-alias-border-l3); outline:none }
```

> 焦点环官方**不统一**：共享原语与 Models 页用 `box-shadow:0 0 0 2px var(--dsw-alias-border-l3)`；Plugins 页用 `outline:2px solid var(--dsw-alias-brand-primary); outline-offset:-2px`；清单页用 `outline:2px solid var(--dsw-alias-state-business-primary); outline-offset:-2px`。

### 3.5 可点击「列表项 / 卡片」（标题 + 副标题，含 hover / selected）

**A. Plugins 页可展开卡片（`YyYd_a_`）——最完整**

```css
.YyYd_a_card { border:.5px solid var(--dsw-alias-border-l4); background:var(--dsw-alias-bg-layer-3); border-radius:16px; list-style:none; transition:border-color .16s, background .16s }
.YyYd_a_card:hover { border-color:var(--dsw-alias-label-dimmed) }   .YyYd_a_cardOpen { background:var(--dsw-alias-bg-layer-2); border-color:var(--dsw-alias-label-dimmed) }
.YyYd_a_header { appearance:none; width:100%; font:inherit; color:inherit; text-align:left; cursor:pointer; background:0 0; border:0; border-radius:12px; align-items:center; gap:12px; padding:14px 16px; display:flex }
.YyYd_a_header:focus-visible { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:-2px }
.YyYd_a_headText { flex-direction:column; flex:1; gap:4px; min-width:0; display:flex }
.YyYd_a_name { color:var(--dsw-alias-label-primary); font-size:15px; font-weight:600; line-height:1.4 }
.YyYd_a_description { color:var(--dsw-alias-label-tertiary); font-size:13px; line-height:1.5 }
.YyYd_a_chevron { color:var(--dsw-alias-label-tertiary); flex:none; transition:transform .16s }   .YyYd_a_chevronOpen { transform:rotate(180deg) }
.YyYd_a_body { border-top:.5px solid var(--dsw-alias-border-l2); margin:0 16px; padding-bottom:8px }
.YyYd_a_footer { border-top:.5px solid var(--dsw-alias-border-l2); justify-content:flex-end; align-items:center; gap:8px; padding:12px 0 4px; display:flex }
.YyYd_a_readOnly { color:var(--dsw-alias-label-tertiary); margin:12px 0 0; font-size:12px; line-height:1.5 }
.YyYd_a_failed { min-width:0; color:var(--dsw-alias-label-error); flex:1; margin:0; font-size:12px; line-height:1.5 }
.YyYd_a_discard, .YyYd_a_save { appearance:none; font:inherit; cursor:pointer; border:1px solid #0000; border-radius:8px; padding:5px 14px; font-size:13px; line-height:1.5 }
.YyYd_a_discard { border-color:var(--dsw-alias-border-l2); color:var(--dsw-alias-label-secondary); background:0 0 }   .YyYd_a_discard:hover:not(:disabled) { color:var(--dsw-alias-label-primary); border-color:var(--dsw-alias-label-dimmed) }
.YyYd_a_save { background:var(--dsw-alias-label-primary); color:var(--dsw-alias-bg-layer-3) }   .YyYd_a_discard:disabled, .YyYd_a_save:disabled { opacity:.4; cursor:default }
```

**B. Models 页行卡片**

```css
.zGbnIq_rowCard { border:.5px solid var(--dsw-alias-border-l4); border-radius:16px; flex-direction:column; gap:12px; padding:12px 14px; display:flex }
.zGbnIq_rowHead { align-items:center; gap:10px; display:flex }   .zGbnIq_rowIdentity { align-items:center; gap:6px; min-width:0; display:inline-flex }
.zGbnIq_rowName { color:var(--dsw-alias-label-primary); font-size:14px; font-weight:500; line-height:22px }   .zGbnIq_rowActions { align-items:center; gap:4px; margin-left:auto; display:inline-flex }
```

**C. 清单页双列网格卡片（`qSYn7G_card`）——hover / open 态最清楚**

```css
.qSYn7G_cards { grid-template-columns:repeat(2,minmax(0,1fr)); align-items:start; gap:10px; margin:0; padding:0; list-style:none; display:grid }
.qSYn7G_card { min-width:0; box-shadow:var(--dsw-elevation-stroke); background:var(--dsw-alias-bg-layer-3); border:0; border-radius:14px; overflow:hidden }
.qSYn7G_card[data-open=true] { --dsw-elevation-stroke-color:var(--dsw-alias-border-l1); box-shadow:var(--dsw-elevation-panel) }
.qSYn7G_cardContent { box-sizing:border-box; width:100%; min-height:52px; color:inherit; font:inherit; text-align:left; cursor:pointer; background:0 0; border:0; flex-direction:column; align-items:stretch; padding:12px 14px; display:flex }
.qSYn7G_cardContent:hover, .qSYn7G_card[data-open=true]>.qSYn7G_cardContent { background:var(--dsw-alias-interactive-bg-hover) }
.qSYn7G_cardContent:focus-visible { outline:2px solid var(--dsw-alias-state-business-primary); outline-offset:-2px }
.qSYn7G_cardTitle { flex:1; min-width:0; font-size:14px; font-weight:600; line-height:20px }
.qSYn7G_cardIdentity { width:100%; color:var(--dsw-alias-label-tertiary); font-family:var(--ds-font-family-code); font-size:11px; line-height:16px; display:block }
.qSYn7G_cardDetails { border-top:.5px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-module-platform); padding:10px 14px 12px }
@media (width<=680px) { .qSYn7G_cards { grid-template-columns:minmax(0,1fr) } }
```

**D. General 页通用偏好行（`bVCLcG_` / `_8HJdBW_`）——「标题 + 描述 + 控件」标准形态**

```css
.bVCLcG_row { border-bottom:.5px solid var(--dsw-alias-border-l2); align-items:center; gap:8px; padding:16px 0; display:flex }
.bVCLcG_rowText { flex-direction:column; flex:1; gap:4px; min-width:0; padding-right:48px; display:flex }
.bVCLcG_title { color:var(--dsw-alias-label-primary); font-size:14px; font-weight:400; line-height:22px }   .bVCLcG_desc { color:var(--dsw-alias-label-tertiary); font-size:12px; font-weight:400; line-height:18px }
.bVCLcG_control { align-items:center; gap:8px; display:inline-flex }
._8HJdBW_group { border-bottom:.5px solid var(--dsw-alias-border-l2); flex-direction:column; gap:8px; padding:16px 0; display:flex }   ._8HJdBW_title { color:var(--dsw-alias-label-primary); font-size:14px; font-weight:400; line-height:22px }
._8HJdBW_themeCube { box-sizing:border-box; border:.5px solid var(--dsw-alias-border-l4); font:inherit; color:var(--dsw-alias-label-primary); cursor:pointer; background:0 0; border-radius:20px; flex-direction:column; flex:180px; justify-content:center; align-items:center; gap:4px; padding:20px 32px; font-size:14px; line-height:22px; display:flex }
._8HJdBW_themeCube:hover:not(._8HJdBW_selected) { background:var(--dsw-alias-interactive-bg-hover) }   ._8HJdBW_selected { background:var(--dsw-alias-bg-module-platform); border-color:var(--dsw-static-neutral-bluish-400) }
```

General 容器去掉**最后一行**下边线：`._WvWnq_section{flex-direction:column;width:100%;display:flex}` + `._WvWnq_section>[data-slot="settings.general.item"]>:last-child{border-bottom:none}`。

### 3.6 危险操作（删除）

```css
.zGbnIq_dangerButton { box-sizing:border-box; height:36px; color:var(--dsw-alias-state-error-primary); font:inherit; cursor:pointer; background:0 0; border:none; border-radius:18px; justify-content:center; align-items:center; padding:0 14px; font-size:14px; line-height:22px; display:inline-flex }
.zGbnIq_dangerButton:hover:not(:disabled) { background:var(--dsw-alias-interactive-bg-hover-danger) }
.zGbnIq_iconButtonDanger:hover:not(:disabled) { background:var(--dsw-alias-interactive-bg-hover-danger); color:var(--dsw-alias-state-error-primary) }
.zGbnIq_deleteDialog { width:min(480px,100%) }   .zGbnIq_deleteConfirm:not(:disabled) { border-color:var(--dsw-alias-state-error-primary); color:var(--dsw-alias-state-error-primary) }
.zGbnIq_deleteConfirm:hover:not(:disabled) { background:var(--dsw-alias-interactive-bg-hover-danger) }
._danger_1nxmc_199, ._danger_1nxmc_199 ._itemIcon_1nxmc_144 { color:var(--dsw-alias-state-error-primary) }   ._danger_1nxmc_199:hover:not(:disabled) { background:var(--dsw-alias-interactive-bg-hover-danger) }
```

危险操作**必须走确认对话框**（Models 页用原语 `primitives.Modal`）。弹窗壳：

```css
._root_w1urq_2 { position:fixed; inset:0; z-index:1000; display:flex; align-items:center; justify-content:center; padding:24px }
._mask_w1urq_14 { position:absolute; inset:0; background:var(--dsw-alias-bg-mask-1); backdrop-filter:var(--dsw-mask-blur) }
._dialog_w1urq_22 { position:relative; z-index:1; display:flex; flex-direction:column; gap:20px; width:min(380px,100%); padding:0 0 24px; overflow:hidden; border:0; border-radius:24px; background:var(--dsw-alias-bg-layer-2); box-shadow:var(--dsw-elevation-prominent) }
._header_w1urq_45 { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:22px 14px 12px 24px }
._title_w1urq_53 { margin:0; font-size:16px; line-height:24px; font-weight:500; color:var(--dsw-alias-label-primary) }
._description_w1urq_80 { margin:0; padding:0 24px; font-size:14px; line-height:22px; font-weight:400; color:var(--dsw-alias-label-primary) }
._body_w1urq_89 { display:flex; flex-direction:column; min-width:0; margin-top:20px; padding:0 24px }   ._footer_w1urq_97 { display:flex; align-items:center; justify-content:flex-end; gap:8px; padding:0 24px }
._close_w1urq_61 { flex:none; display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border:none; border-radius:8px; background:transparent; cursor:pointer; color:var(--dsw-alias-label-secondary) }   ._close_w1urq_61:hover { background:var(--dsw-alias-interactive-bg-hover) }
._confirmation_1nu42_1 { width:min(440px,100%); max-height:calc(100vh - 48px); overflow:hidden }
._warning_1nu42_19 { display:flex; align-items:flex-start; gap:10px; color:var(--dsw-alias-label-secondary); font-size:14px; line-height:22px }
._acknowledgement_1nu42_38 { display:flex; align-items:flex-start; gap:10px; margin-top:20px; color:var(--dsw-alias-label-primary); font-size:14px; line-height:22px; cursor:pointer }
._acknowledgement_1nu42_38 input { flex:none; width:16px; height:16px; margin:3px 0 0; accent-color:var(--dsw-alias-button-primary-fill); cursor:pointer }
._modalAction_1nu42_67 { min-width:72px }   ._confirmAction_1nu42_71 { min-width:136px }
```

### 3.7 空状态

设置页**没有**统一空状态组件，各页自绘：

```css
.pbvGtq_empty { color:var(--dsw-alias-label-tertiary); margin:0; font-size:13px }
.zGbnIq_modelEmpty { border:1px dashed var(--dsw-alias-border-l3); text-align:center; border-radius:8px; padding:12px; color:var(--dsw-alias-label-tertiary); margin:0; font-size:12px; line-height:18px }
.zGbnIq_candidateEmpty { color:var(--dsw-alias-label-secondary); text-align:center; margin:24px 0; font-size:13px; line-height:20px }
```

共享表的 `._empty_*` 同样是「`--dsw-alias-label-tertiary` 文字 + 12–14px padding」，**无插图/图标**。

### 3.8 Badge / Chip / Tag

```css
.zGbnIq_rowTag { border:.5px solid var(--dsw-alias-border-l3); color:var(--dsw-alias-label-secondary); border-radius:4px; flex:none; padding:1px 6px; font-size:11px; line-height:16px }
._tag_brmue_4 { display:inline-flex; align-items:center; border-radius:999px; corner-shape:round; padding:1px 8px; font-size:11px; line-height:17px; font-weight:500; white-space:nowrap }
._tag_brmue_4[data-tone=outline] { border:.5px solid var(--dsw-alias-border-l4); color:var(--dsw-alias-label-tertiary) }
._tag_brmue_4[data-tone=solid] { background:var(--dsw-alias-label-primary); color:var(--dsw-alias-bg-layer-3) }
._tag_brmue_4[data-tone=neutral] { background:var(--dsw-alias-bg-module-platform); color:var(--dsw-alias-label-secondary) }
._tag_brmue_4[data-tone=quiet] { color:var(--dsw-alias-label-tertiary) }
._tag_brmue_4[data-tone=success] { background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 10%,transparent); color:var(--dsw-alias-state-success-primary) }
._tag_brmue_4[data-tone=info] { background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,transparent); color:var(--dsw-alias-state-business-primary) }
._tag_brmue_4[data-tone=warning] { background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 12%,transparent); color:var(--dsw-alias-state-warn-primary) }
._tag_brmue_4[data-tone=danger] { background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent); color:var(--dsw-alias-state-error-primary) }
._pill_e3ygd_1 { display:inline-flex; align-items:center; gap:4px; height:24px; padding:0 8px; border:none; border-radius:12px; font-size:12px; line-height:18px; color:var(--dsw-alias-label-secondary); background:var(--dsw-alias-bg-layer-2) }
.zGbnIq_credentialDot { box-sizing:border-box; corner-shape:round; border-radius:50%; flex:none; width:8px; height:8px; display:inline-block }
.zGbnIq_credentialDotConfigured { background:var(--dsw-alias-state-success-primary) }   .zGbnIq_credentialDotMissing { background:var(--dsw-alias-state-error-primary) }
.qSYn7G_brokenNote { background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent); color:var(--dsw-alias-state-error-primary); overflow-wrap:anywhere; white-space:pre-line; border-radius:8px; margin:0; padding:8px 10px; font-size:12.5px; line-height:18px }
```

---

## 4. 实际使用的 CSS 变量

令牌**不在**共享样式表里，由 `dsh-client-ui-theme/lib/client.js` 注入：字符串常量 `design_platform_css_default`（**L1053**，15660 字符）含 4 段 —— SEG0 `body{…}` 73 个 `--dsw-static-*`（浅色）、SEG1 `body[data-ds-dark-theme]{…}` 73 个（深色）、SEG2 `body{…}` **79 个 `--dsw-alias-*`**（浅色）、SEG3 `body[data-ds-dark-theme]{…}` 79 个（深色）。字体令牌在同文件 **L1059**。

### 4.1 语义别名 → 底层令牌（浅色 / 深色）

| 用途 | 变量 | 浅色 | 深色 |
|---|---|---|---|
| 页面背景 | `--dsw-alias-bg-base` | `--dsw-static-neutral-bluish-00` `#fff` | `neutral-bluish-950` `#151517` |
| 卡片/面板 | `--dsw-alias-bg-layer-1` | `bluish-00` `#fff` | `bluish-875` `#232324` |
| 对话框面板 | `--dsw-alias-bg-layer-2` | `bluish-00` `#fff` | `bluish-850` `#2c2c2e` |
| 抬升层/卡片 | `--dsw-alias-bg-layer-3` | `bluish-00` `#fff` | `bluish-800` `#353638` |
| 内嵌块 | `--dsw-alias-bg-module-platform` | `bluish-60` `#f5f6f7` | `bluish-800` `#353638` |
| 主文本 | `--dsw-alias-label-primary` | `bluish-1000` `#0f1115` | `bluish-50` `#f9fafb` |
| 次级文本 | `--dsw-alias-label-secondary` | `bluish-700` `#61666b` | `bluish-300` `#cfd3d6` |
| 三级文本 | `--dsw-alias-label-tertiary` | `bluish-600` `#81858c` | `bluish-400` `#adb2b8` |
| caption | `--dsw-alias-label-caption` | `bluish-400` `#adb2b8` | `bluish-600` `#81858c` |
| 占位符 | `--dsw-alias-label-dimmed` | `bluish-200` `#e1e5ee` | `bluish-750` `#43454a` |
| 主色 | `--dsw-alias-brand-primary` | `bluish-1000` `#0f1115` | `bluish-50` `#f9fafb` |
| 业务蓝 | `--dsw-alias-state-business-primary` | `deepseek-500` `#4176e6` | `deepseek-400` `#679efe` |
| 链接 | `--dsw-alias-link` | `deepseek-500` `#4176e6` | `deepseek-400` `#679efe` |
| 悬停背景 | `--dsw-alias-interactive-bg-hover` | `#2631480f` | `#ffffff14` |
| 悬停（实心） | `--dsw-alias-interactive-bg-hover-solid` | `bluish-75` `#f1f3f5` | `bluish-800` `#353638` |
| 悬停（强调） | `--dsw-alias-interactive-bg-hover-accent` | `#26314824` | `#ffffff3d` |
| 按下 | `--dsw-alias-interactive-bg-active` | `#2631481a` | `#ffffff24` |
| 危险悬停 | `--dsw-alias-interactive-bg-hover-danger` | `#ec13130d` | `#f25a5a26` |
| 危险色 | `--dsw-alias-state-error-primary` | `red-600` `#ec1313` | `red-400` `#f25a5a` |
| 成功 | `--dsw-alias-state-success-primary` | `green-500` `#22c55e` | 同 |
| 警告 | `--dsw-alias-state-warn-primary` | `amber-500` `#f59e0b` | 同 |
| 警告文字 | `--dsw-alias-state-warn-label` | `amber-600` `#dd8629` | 同 |

### 4.2 边框 / 分隔线（4 级 + 2 级反色）

| 变量 | 浅色 | 深色 |
|---|---|---|
| `--dsw-alias-border-l1` | `#0000000a` | `#ffffff0f` |
| `--dsw-alias-border-l2` | `#0000001a` | `#ffffff1f` |
| `--dsw-alias-border-l2-darkmode-thin` | `#0000001a` | `#ffffff0f` |
| `--dsw-alias-border-l3` | `#0000001f` | `#ffffff29` |
| `--dsw-alias-border-l4` | `#00000029` | `#fff3` |
| `--dsw-alias-border-inverted` | `#0000` | `#ffffff0f` |
| `--dsw-alias-border-inverted2` | `#0000` | `#ffffff14` |

**官方用法约定**：输入框/卡片外框 → `border-l4`（`.5px`）；卡片**内部**横向分隔线 → `border-l2`；虚线空状态/添加按钮 → `border-l3`；菜单分隔线 → `border-l1`。

### 4.3 按钮 / 侧栏导航专用别名

| 变量 | 浅色 | 深色 |
|---|---|---|
| `--dsw-alias-button-primary-fill` | `var(--dsw-alias-brand-primary)` | 同 |
| `--dsw-alias-button-primary-hover` | `bluish-750` `#43454a` | `bluish-100` `#ebeef2` |
| `--dsw-alias-button-primary-dimmed` | `bluish-100` `#ebeef2` | `bluish-750` `#43454a` |
| `--dsw-alias-label-primary-foreground` | `bluish-00` `#fff` | `bluish-1000` `#0f1115` |
| `--dsw-alias-button-contrast-fill` | `bluish-700` `#61666b` | `bluish-50` `#f9fafb` |
| `--dsw-alias-button-tool-bar-fill` | `#54555780` | 同 |
| `--dsw-alias-button-tool-bar-hover` | `#54555799` | 同 |
| `--dsw-specific-sidebar-nav-item-hover` | `bluish-75` `#f1f3f5` | `bluish-850` `#2c2c2e` |
| `--dsw-specific-sidebar-nav-item-active` | `bluish-100` `#ebeef2` | `bluish-750` `#43454a` |
| `--dsw-specific-sidebar-nav-item-active-accent` | `deepseek-100` `#e4edfd` | `bluish-800` `#353638` |
| `--dsw-specific-menu` | `var(--dsw-alias-bg-layer-3)` | 同 |
| `--dsw-specific-selector` | `bluish-60` `#f5f6f7` | `bluish-800` `#353638` |
| `--dsw-specific-input-major` | `bluish-00` `#fff` | `bluish-850` `#2c2c2e` |

> `--dsw-specific-sidebar-nav-item-active-accent` **在设置导航里未被使用**——选中态只有背景色变化，文字仍是 `--dsw-alias-label-primary`，**没有强调色文字，也没有左侧色条**。

### 4.4 阴影 / 蒙层 / 滚动条

| 变量 | 值 |
|---|---|
| `--dsw-elevation-prominent` | `var(--dsw-elevation-stroke), 0 3px 8px 0 #0000000a, 0 0 20px 0 #0000000d` |
| `--dsw-elevation-panel` | `var(--dsw-elevation-stroke), 0 3px 8px 0 #00000008, 0 0 16px 0 #00000005` |
| `--dsw-elevation-soft` | `var(--dsw-elevation-stroke), 0 4px 16px 0 #00000008, 0 0 24px 0 #00000008` |
| `--dsw-elevation-stroke` | `0 0 0 .5px var(--dsw-elevation-stroke-color)`（`-stroke-color` 用前就近覆盖为 `--dsw-alias-border-l1` 或 `-l2`） |
| `--dsw-mask-blur` | `blur(2px)` |
| `--dsw-alias-bg-mask-1` | `#0000003d` / `#00000080` |
| `--dsw-alias-bg-overlay` | `bluish-150` `#e9ecf2` / `bluish-700` `#61666b` |
| `--dsw-alias-scrollbar-bg-l1` | `neutral-200` `#e5e5e5` / `neutral-700` `#3c3c3d` |
| `--dsw-alias-scrollbar-bg-l2` | `neutral-200` `#e5e5e5` / `neutral-600` `#545557` |
| `--dsw-alias-scrollbar-hover-l1` | `neutral-300` `#d4d4d4` / `neutral-600` `#545557` |
| `--dsw-alias-scrollbar-hover-l2` | `neutral-300` `#d4d4d4` / `neutral-550` `#65676b` |
| `--dsh-scrollbar-width` | `8px` |
| `--dsh-scrollbar-thumb` / `--dsh-scrollbar-thumb-hover` | 就近覆盖为 `--dsw-alias-scrollbar-bg-l2` / `--dsw-alias-scrollbar-hover-l2`（面板与菜单都这么做） |

### 4.5 `--dsw-static-*` 调色板（换算别名用，浅色基线）

```
neutral-bluish: 00 #fff | 50 #f9fafb | 60 #f5f6f7 | 75 #f1f3f5 | 100 #ebeef2 | 150 #e9ecf2 | 200 #e1e5ee | 300 #cfd3d6
  400 #adb2b8 | 500 #979da6 | 600 #81858c | 700 #61666b | 750 #43454a | 800 #353638 | 850 #2c2c2e | 875 #232324
  900 #1b1b1c | 950 #151517 | 1000 #0f1115
neutral: 50 #fafafa | 100 #f5f5f5 | 150 #ededed | 200 #e5e5e5 | 250 #dcdcdc | 300 #d4d4d4 | 400 #a2a4a6 | 500 #7f8287
  550 #65676b | 600 #545557 | 700 #3c3c3d | 800 #292929 | 850 #212123 | 900 #0f0f0f
deepseek: 50 #edf3fe | 100 #e4edfd | 200 #d3e2ff | 300 #b7c8fe | 400 #679efe | 450 #5686fe | 500 #4176e6 | 600 #4868b2
  800 #34415b | 900 #283142
red: 50 #fef2f2 | 100 #fee2e2 | 400 #f25a5a | 500 #ef4444 | 600 #ec1313 | 900 #570c0c
green: 100 #e6faed | 400 #4ed17e | 500 #22c55e | 900 #233c2c
amber: 100 #fef5e7 | 400 #f7ad31 | 500 #f59e0b | 600 #dd8629 | 900 #27241f
```

### 4.6 两个**被引用但从未定义**的变量（官方自己的 bug，别抄）

- `--dsw-alias-label-error` —— 在 `settings-plugins` 大量使用（`.At1oFq_inputInvalid`、`.At1oFq_invalid`、`.YyYd_a_failed`、`.vCGm7G_invalid`、`.vCGm7G_conflict`、`.vCGm7G_catalogError`），**全树 0 处定义** → 这些规则实际不产生颜色。**正确用 `--dsw-alias-state-error-primary`**。
- `--dsw-alias-bg-layer-4` —— `.vCGm7G_model:hover` 使用，**未定义**（别名只有 layer-1/2/3）→ 用 `--dsw-alias-bg-layer-3` 或 `--dsw-alias-interactive-bg-hover`。

---

## 5. 字体层级

令牌在 `dsh-client-ui-theme/lib/client.js` **L1059**，是**复合 shorthand**（可直接 `font: var(--dsw-font-xs-13)`）：

| 令牌 | 值 |
|---|---|
| `--dsw-font-family` | `-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif` |
| `--ds-font-family-code` | `"SF Mono", "JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", Menlo, Courier, "PingFang SC", "Microsoft YaHei"` |
| `--dsw-font-xxxs-11` / `--dsw-font-xxxs-strong-11` | `11px/14px` / `500 11px/14px` + `var(--dsw-font-family)` |
| `--dsw-font-xxs-12` / `--dsw-font-xxs-strong-12` | `12px/18px` / `500 12px/18px` |
| `--dsw-font-xs-13` / `--dsw-font-xs-strong-13` | `13px/20px` / `500 13px/20px` |
| `--dsw-font-s-14` / `--dsw-font-s-strong-14` | `14px/22px` / `500 14px/22px` |
| `--dsw-font-base-16` / `--dsw-font-base-strong-16` | `16px/24px` / `500 16px/24px` |
| `--dsw-font-m-18` / `--dsw-font-l-20` / `--dsw-font-xl-24` | `500 16px/28px` / `500 20px/28px` / `600 24px/32px` |
| `--dsw-font-markdown-code-font-family` | `var(--ds-font-family-code)` |
| `--dsw-font-markdown-code` / `-code-block` | `12px/19px` / `11px/19px` + `var(--ds-font-family-code)` |

**`--dsw-font-mono` 不存在**（全树无定义；只有 `dsh-client-ui-agent-preset`、`dsh-client-ui-jobs` 引用 → 失效）。**等宽请用 `var(--ds-font-family-code)`**——设置页实际用的就是它（`.qSYn7G_cardIdentity`、`.zGbnIq_candidateId`、`.qSYn7G_entryValue`）。

### 设置 UI 的实际取值（写死 px，不是令牌）

| 元素 | size | weight | line-height | color |
|---|---|---|---|---|
| 对话框标题（navTitle） | `16px` | `500` | `24px` | `--dsw-alias-label-primary` |
| Section 标题（Models `title`） | `16px` | `500` | `24px` | `--dsw-alias-label-primary` |
| Section 标题（Plugins `heading`） | `18px` | `600` | 未设 | 继承 |
| Section 说明（`intro`） | `14px`（Plugins `13px`） | 未设 | `22px` | `--dsw-alias-label-tertiary` |
| 字段标签（Models `fieldLabel`） | `12px` | `500` | `18px` | `--dsw-alias-label-secondary` |
| 字段标签（Plugins `label`） | `13px` | `500` | `1.5` | `--dsw-alias-label-primary` |
| 正文/提示（`advancedHint` / `hint`） | `12px` | 未设 | `18px` | `--dsw-alias-label-tertiary` |
| 输入框文字 | `14px`（Plugins `13px`） | 继承 | `22px`（Plugins `1.5`） | `--dsw-alias-label-primary` |
| 列表项标题（`rowName`） | `14px` | `500` | `22px` | `--dsw-alias-label-primary` |
| 列表项标题（`YyYd_a_name`） | `15px` | `600` | `1.4` | `--dsw-alias-label-primary` |
| 列表项标题（`qSYn7G_cardTitle`） | `14px` | `600` | `20px` | 继承 |
| 列表项副标题（`YyYd_a_description`） | `13px` | 未设 | `1.5` | `--dsw-alias-label-tertiary` |
| 偏好行标题（`bVCLcG_title`） | `14px` | **`400`** | `22px` | `--dsw-alias-label-primary` |
| 偏好行描述（`bVCLcG_desc`） | `12px` | **`400`** | `18px` | `--dsw-alias-label-tertiary` |
| 按钮 | `14px`（small `12px`） | 继承 | `22px`（small `18px`） | 见 §3.4 |
| Tag / 内联标签 | `11px` | `500`（`rowTag` 未设） | `17px`（`rowTag` `16px`） | 见 §3.8 |
| 等宽值（`cardIdentity`、`entryValue`） | `11–12px` | 未设 | `16–18px` | `label-tertiary` / `label-primary` |

**`letter-spacing` 在设置 UI 中一处都没有用**——**不要加字距**。字体渲染：`body{ -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale; text-autospace:normal }`；`button,input,select,textarea{font-family:inherit}`。

---

## 6. 布局数值汇总

| 项 | 值 |
|---|---|
| 面板宽 / 高 / 圆角 | `800px`（`max-width:calc(100vw - 48px)`）/ `min(800px,100vh - 48px)` / `32px` |
| **导航栏宽度** | **`188px`**；内边距 `22px 12px 0`；标题↔列表 gap `18px`；列表 gap `4px` |
| 导航项 | 高 `40px`，圆角 `12px`，内边距 `9px 16px 9px 12px`，图标↔文字 gap `8px`；标题内边距 `0 12px` |
| **内容头部** | 高 `54px`（`flex:none`），`padding:20px 14px 8px 10px`；actions gap `8px` |
| **内容滚动区内边距** | `0 24px 24px`（**顶部 0**） |
| 关闭按钮 | `28×28px`，`border-radius:28px` |
| **Section 最大宽度** | Models `720px`；Plugins `760px`；清单 `760px`；General 无（`width:100%`） |
| Section 纵向 gap / 标题↔列表 | `12px`（Models、Plugins）；清单 `14px`；`ul.rows` 额外 `margin-top:12px` |
| **字段行纵向 gap** | `.field` 内 `6px`（label↔input↔hint）；行间 `gap:8px` 或 `padding:12px 0` + `border-top` |
| **输入框高度** | **`32px`**（Models / 共享原语）；Plugins `34px`；清单搜索 `36px` |
| 输入框圆角 / 内边距 / 边框 | `8px` / `0 10px`（Plugins `0 12px`）/ `.5px solid var(--dsw-alias-border-l4)` |
| 搜索框圆角 / 内边距 | `10px` / `0 34px 0 36px` |
| **按钮高度 / 圆角** | `36px`（md）/ `28px`（sm）/ `44px`（虚线 add）；`18px`（md）/ `14px`（sm、行内） |
| 卡片圆角 | `16px`（Models rowCard / Plugins card）；清单卡 `14px`；菜单 `20px`；对话框 `24px` |
| 卡片内边距 / 边框 | `12px 14px`（Models）/ `14px 16px`（Plugins header）/ `.5px solid var(--dsw-alias-border-l4)`；清单卡用 `box-shadow:var(--dsw-elevation-stroke)` 代替边框 |
| 图标尺寸 | 导航与列表项 `16px`（compact `14px`）；关闭按钮内 `14px` |
| Switch | `36×20px`，thumb `16px`，位移 `translate(16px)`，圆角 `10px` |
| Tag | `padding:1px 8px`，圆角 `999px` |
| 虚线空状态 | `border:.5px dashed var(--dsw-alias-border-l3)`，圆角 `8px`，`padding:12px` |
| 响应式断点 | `width<=680px` 清单卡片转单列；`width<=560px` 对话框 `padding:24px`、主按钮 `width:100%` |
| 滚动条宽 | `--dsh-scrollbar-width: 8px` |
| 过渡 | 卡片 `border-color .16s, background .16s`；chevron `transform .16s`；switch thumb `transform .12s ease`；菜单 chevron `.14s var(--ds-ease-in-out)`；`@media (prefers-reduced-motion:reduce)` 全部关闭 |

---

## 7. `dsh-client-ui-subagent` 到底渲染什么

**它不是一个设置页，也不在聊天时间线里画卡片。** 它注册的是**会话聊天区的两个 seat**：

```js
ctx.slots.inject("conversation.session.header.lineage", () => ctx.slots.register({
  name: "conversation.session.header.lineage", locale: NS, inject: catalogActions }, SubagentHeaderLineage));
ctx.slots.inject("conversation.composer", () => ctx.slots.register({
  name: "conversation.composer", priority: -10, locale: NS, select: selectReadOnlySubagent }, SubagentReadOnlyComposer));
```

`inject`（`index.d.ts`）：**"Required services for conversation slots and session navigation."**

### 7.1 `SubagentHeaderLineage` —— 会话标题旁的血缘面包屑 + 树形目录弹层（类前缀 `ZKlsPq_`）

```
div.ZKlsPq_root (+ .ZKlsPq_switcherRoot)    方向键导航；hover 延迟开合
├─ span.ZKlsPq_separator  "/"                （有祖先时）
├─ button.ZKlsPq_trigger | .ZKlsPq_switcherTrigger (+ .ZKlsPq_ancestorSwitcherTrigger)
│  │  aria-haspopup="tree" aria-expanded
│  ├─ [switcher] span.ZKlsPq_switcherTitle
│  ├─ [count]    span.ZKlsPq_activitySlot → <StateDot state="ongoing">   （有运行中时）
│  │             span.ZKlsPq_count                                      （"3 个子代理"）
│  └─ <IconChevronDownOutline14> / SubagentSwitcherIcon（展开时加 .ZKlsPq_triggerOpen）
└─ open && createPortal(
     div.ZKlsPq_menu  role="tree"
       └─ CatalogRows → 递归 div.ZKlsPq_node
            ├─ div.ZKlsPq_row (button)
            │   ├─ button.ZKlsPq_disclosure (.ZKlsPq_disclosureOpen) 或 span.ZKlsPq_disclosureSpace
            │   ├─ div.ZKlsPq_clickarea
            │   │   ├─ div.ZKlsPq_content → div.ZKlsPq_label (.ZKlsPq_currentLabel) + div.ZKlsPq_summary
            │   │   └─ div.ZKlsPq_metrics → span.ZKlsPq_metricToken (grid-row 1) + span.ZKlsPq_metricDuration (grid-row 2)
            └─ div.ZKlsPq_children   （子树，纯 CSS 画树线）
```

```css
.ZKlsPq_root { align-items:center; gap:10px; min-width:0; display:inline-flex; position:relative }
.ZKlsPq_separator { color:var(--dsw-alias-label-caption); font-size:14px; line-height:20px }
.ZKlsPq_trigger { min-height:28px; color:var(--dsw-alias-label-tertiary); cursor:pointer; background:0 0; border:0; border-radius:6px; align-items:center; padding:3px 2px; font-size:12px; line-height:18px; display:inline-flex; gap:4px }
.ZKlsPq_switcherTrigger { min-width:0; max-width:244px; color:var(--dsw-alias-label-primary); gap:4px; font-weight:500 }
.ZKlsPq_menu { z-index:100; box-sizing:border-box; background:var(--dsw-specific-menu); width:336px; max-width:min(400px,100vw - 32px); max-height:min(560px,100vh - 140px); box-shadow:var(--dsw-elevation-prominent); border-radius:20px; flex-direction:column; padding:4px; display:flex; position:fixed; overflow:auto; --dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2); --dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2); --dsw-elevation-stroke-color:var(--dsw-alias-border-l1) }
.ZKlsPq_row { box-sizing:border-box; width:100%; min-height:50px; color:var(--dsw-alias-label-primary); text-align:left; cursor:pointer; background:0 0; border:0; border-radius:8px; outline:none; align-items:flex-start; gap:8px; padding:7px 8px 7px 11px; font-size:13px; line-height:18px; display:flex; position:relative }
.ZKlsPq_row:hover>.ZKlsPq_clickarea, .ZKlsPq_row:focus-visible>.ZKlsPq_clickarea { background:var(--dsw-alias-interactive-bg-hover) }
.ZKlsPq_clickarea { border-radius:8px; flex:1; align-self:stretch; align-items:flex-start; gap:8px; min-width:0; margin:-7px -8px; padding:7px 8px; display:flex }
.ZKlsPq_label { color:inherit; font-weight:400 }   .ZKlsPq_currentLabel { font-weight:600 }
.ZKlsPq_summary, .ZKlsPq_metrics { color:var(--dsw-alias-label-tertiary); font-size:11px; line-height:16px }
.ZKlsPq_metrics { font-variant-numeric:tabular-nums; text-align:right; white-space:nowrap; flex:none; grid-template-rows:18px 16px; display:grid }
.ZKlsPq_children { margin-left:18px; padding-left:4px; position:relative }
.ZKlsPq_children:before, .ZKlsPq_children>.ZKlsPq_node:before { content:""; border-left:.5px solid var(--dsw-alias-border-l2); position:absolute; left:0 }
.ZKlsPq_children:before { height:26px; top:-26px }   .ZKlsPq_children>.ZKlsPq_node:last-child:before { height:17px; bottom:auto }
.ZKlsPq_children>.ZKlsPq_node>.ZKlsPq_row:before { content:""; border-top:.5px solid var(--dsw-alias-border-l2); width:14px; position:absolute; top:16px; left:-4px }
.ZKlsPq_error { color:var(--dsw-alias-state-error-primary); padding:10px 12px; justify-content:space-between; align-items:center; gap:12px; font-size:12px; line-height:18px; display:flex }
```

> **这是官方呈现子代理的核心方式**：不是面板、不是时间线卡片，而是**会话标题右侧的面包屑切换器 + 树形目录弹层**（有运行中子代理时显示 `StateDot` 与计数）。

### 7.2 `SubagentReadOnlyComposer` —— 只读提示条，替换输入框（类前缀 `XJ7liG_`）

当被寻址的子会话不能接受人工输入时（`reason: 'one-shot' | 'parent-unavailable'`），它顶替 composer：`div.XJ7liG_frame[role=status] > strong + span`。

```css
.XJ7liG_frame { border:.5px solid var(--dsw-alias-border-l4); background:var(--dsw-alias-bg-layer-1); min-height:54px; color:var(--dsw-alias-label-tertiary); border-radius:14px; justify-content:center; align-items:center; gap:8px; margin:0 24px 20px; padding:10px 16px; font-size:13px; line-height:20px; display:flex }
.XJ7liG_frame strong { color:var(--dsw-alias-label-primary); font-weight:510 }
```

> `font-weight:510` 是官方原值（变量字体）——想完全一致可抄，否则用 `500`。

### 7.3 子代理唯一的「设置内」出现处

不在 `dsh-client-ui-subagent` 里，而在 `dsh-client-ui-settings-plugins` 的 **`SubagentModelSelectionCard`**（类前缀 `vCGm7G_`，Plugins 页的一个 tab 卡片）：

```css
.vCGm7G_models { border:.5px solid var(--dsw-alias-border-l4); border-radius:8px; gap:6px; min-width:0; max-height:280px; margin:0; padding:10px; display:grid; overflow:auto }
.vCGm7G_models legend { color:var(--dsw-alias-label-secondary); padding:0 4px; font-size:12px }
.vCGm7G_modelGroup + .vCGm7G_modelGroup { border-top:.5px solid var(--dsw-alias-border-l3); margin-top:4px; padding-top:10px }
.vCGm7G_providerName { color:var(--dsw-alias-label-tertiary); padding:0 6px; font-size:11px; font-weight:500 }
.vCGm7G_model { cursor:pointer; border-radius:6px; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:8px; min-width:0; padding:6px; display:grid }
.vCGm7G_modelName { color:var(--dsw-alias-label-primary); font-size:13px }   .vCGm7G_route { color:var(--dsw-alias-label-tertiary); margin-top:2px; font-size:11px }
```

**结论**：官方**没有**「子代理设置页」这个导航项；子代理配置在 **Plugins 设置页的卡片/tab 里**，子代理导航在**会话标题栏**。

---

## 8. 第三方插件的设置 section 如何挂载

### 8.1 注册调用（官方原样，`dsh-client-ui-settings-models`）

```js
ctx.slots.inject("settings.section", () => ctx.slots.register({
  name: "settings.section", id: "models", order: 10, label: () => t("nav"), inject: injected,
  children: { "settings.models.provider-card": { kind: "keyed", scope: "root" }, /* … */ }
}, ModelsSection));
```

**slot 选项**：`id`（section key，驱动 `only` 过滤 + `navIcon` 查表）、`order`（导航位置）、`label`（注册方本地化的显示文字，函数；locale 变化时重新注册）。**内容文字全部由注册方提供，外壳零文案。**

### 8.2 section 组件收到的 props

来自 `dsh-client-ui-settings/lib/types/client/contract/slots.d.ts`：**只有 `{ close: () => void }`** —— 外壳调用时传入 `onClose`：`renderSlot("settings.section", { close: onClose }, { only: active })`。

- `only: active` → **只有当前选中的 section 被渲染**，其它 section 的组件不挂载。
- 没有 `activeId`、没有 store、没有初始焦点；面板打开状态与当前 section id 都是外壳的组件内 state。

其余 seat 的 props（同文件）：

| slot | kind | owner props |
|---|---|---|
| `settings.trigger` | single | `{ wide: boolean }`（`false` = 56px rail，只显示图标） |
| `settings.header` | single | `{}`（标记字段，外壳不传） |
| `settings.action` | list | `{}` |
| `settings.close` | single | `{}` |
| **`settings.section`** | **list** | **`{ close: () => void }`** |
| `settings.plugins.tab` | list | `{}` |
| `settings.general.item` | list | `{}`（**owner 一个 props 都不传**，标签/取值/写路径全归你自己） |
| `settings.onboarding` | list | `{ stepId, complete(), openSection(id) }` |

### 8.3 外壳套在你的组件外面的东西

`renderSlot` → `SlotOutlet` → `renderOutlet`（`dsh-client-ui-renderer/lib/client.js` L767 起）：

```jsx
<div data-slot="settings.section" style={{ display: "contents" }}>{ /* 你的组件 */ }</div>
```

常量：`const ANCHOR_STYLE = { display: "contents" }`。

- **`display:contents` 意味着这个 div 不产生盒子** → 你的根元素**在布局上就是 `div.VOzbGW_options` 的直接子元素**。
- 因此：`div.VOzbGW_options` 是块级滚动容器（内边距 `0 24px 24px`）；**你的根元素不需要外边距，也不该再套一层 max-width 容器**——照抄官方 section 写法即可：

```jsx
createElement("div", { className: "my-section" }, [
  createElement("h2", { className: "my-title" }, "标题"),
  createElement("p",  { className: "my-intro" }, "说明文字"),
  createElement("ul", { className: "my-rows" }, /* … */)])
```

```css
.my-section { max-width:720px; color:var(--dsw-alias-label-primary); display:flex; flex-direction:column; gap:12px }
.my-title { margin:0; font-size:16px; font-weight:500; line-height:24px }
.my-intro { margin:0; font-size:14px; line-height:22px; color:var(--dsw-alias-label-tertiary) }
.my-rows { display:flex; flex-direction:column; gap:8px; margin:12px 0 0; padding:0; list-style:none }
```

**唯一要自己补的**：CSS 变量定义在 `body` 上（自动可用），但**你的 `<style>` 必须自己注入**。官方各包的样板是往 `document.head` 插带 `data-plugin` / `data-plugin-css` 的 `<style>` 标签（见每个 `const css$N` 之后那几行）。

### 8.4 挂载检查清单

1. `ctx.slots.inject("settings.section", () => ctx.slots.register({ name:"settings.section", id, order, label }, Component))` —— **必须用 `inject` 包一层**，等槽位声明上账后再注册。
2. `id` 若不在 `{"models","agent-presets","plugins"}`，左侧图标走兜底 `IconSettingsOutline16`（外壳**没有**自定义图标 seat）。
3. 组件要接受（通常忽略）`close`。
4. 面板宽 800px − 导航 188px − 横向内边距 48px → **可用内容宽约 564px**；官方 section 的 `max-width:720px` 实际被这个宽度限制（`max-width` 主要面向宽屏）。想铺满用 `width:100%`（General 页做法）。
5. 组件会在**每次切换 section 时重新挂载**（`only` 过滤 + `open &&` 条件渲染），本地 state 不跨切换保留。

---

**明确「未找到」的项**：`--dsw-font-mono` 的定义（不存在，只有失效引用）；设置 UI 中任何 `letter-spacing`（0 处）；`--dsw-alias-label-error` 与 `--dsw-alias-bg-layer-4` 的定义（被引用但从未定义）；第三方 section 自定义图标的 slot（不存在）；`dist/` 下的客户端 bundle（不存在，实际是 `lib/`）。
