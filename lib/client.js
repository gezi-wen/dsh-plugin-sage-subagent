/**
 * dsh-plugin-sage-subagent — 浏览器半边。
 *
 * 手写成客户端模块系统要求的形状：`window.__ModuleLoader__.load({ id, factory })`。
 *
 * **为什么是单文件**：浏览器半边的模块加载器（dsh-client-modules）只解析模块图里
 * 已注册的 specifier（包名，以及去掉尾部 `/client` 的规范化形式）。相对路径不在图里，
 * `require('./x.js')` 会直接抛错 —— 官方和所有第三方插件的 client.js 都是单文件。
 *
 * **CSS 从哪来**：`const CSS` 那一段由 `tools/sync-panel-css.mjs` 从 `docs/panel.css`
 * 注入（剥布局稿专用段、剥官方外壳段、类名加 sr- 前缀、全局元素收进 .sr-root）。
 * **不要手改那段**，改样式请改 `docs/panel.css` 再跑脚本。
 *
 * 数据走插件自己的 `/api` 精确路由（见 host/rpc.js）：
 *   roles.list / roles.get / roles.save / roles.remove
 *   models.list / tools.list / route.check / chain.check
 *
 * 三条界面上的硬约定：
 *   1. **模型从真实目录里选**，不给自由文本 —— 实测 `resolveCallConfig` 挡不住模型名写错
 *      （会一路发到服务端才被拒），所以让「写错」这件事不可表达。
 *   2. **description 是主代理选角色的唯一依据**，表单里它在最显眼的位置并带说明。
 *   3. **`enabled` 是启停的唯一真值**；分组开关只是「把这组每个角色的 enabled 改一遍」
 *      的批量动作，它自己不存状态 —— 这样组开关和角色开关永远不可能打架。
 */
window.__ModuleLoader__.load({
	id: "dsh-plugin-sage-subagent",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");

		const STYLE_ID = "subagent-roles-style";
		const CSS = `
.sr-root,.sr-root *,.sr-root *::before,.sr-root *::after{box-sizing:border-box}
/* ⚠️ 这里**不要**加 color:inherit。作用域化之后这条规则的特异性是 (0,1,1)，
   高于按钮自己的 (0,1,0)，会把主按钮的文字色盖成继承色 —— 深色主题下父级是白字，
   于是白底白字、按钮变成一块空白（2026-09-15 看图才发现）。官方也只加 font-family。
   写法上注意：本文件的注释里不要出现带前导点的类名，抽取脚本会把它一起前缀化。 */
.sr-root button,.sr-root input,.sr-root select,.sr-root textarea{font-family:inherit}
.sr-root code{font-family:var(--ds-font-family-code);font-size:12px;color:var(--dsw-alias-label-secondary);
  background:var(--dsw-alias-markdown-inline-code);border-radius:4px;padding:1px 4px}
.sr-root svg{display:block;flex:none}
.sr-ico{width:16px;height:16px;stroke:currentColor;stroke-width:1.4;fill:none;stroke-linecap:round;stroke-linejoin:round}
.sr-ico12{width:12px;height:12px}
.sr-ico14{width:14px;height:14px}



/* ---------- 图标按钮 ---------- */
.sr-iconBtn{
  width:28px;height:28px;flex:none;display:inline-flex;align-items:center;justify-content:center;
  border:0;border-radius:50%;background:0 0;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:0;
}
.sr-iconBtn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.sr-iconBtn:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}

/* ============================================================
   section 页头：16/24 500 + 14/22 tertiary，gap 12，无分隔线
   ============================================================ */
.sr-sectionTitle{margin:0;font-size:16px;font-weight:500;line-height:24px}
.sr-sectionIntro{margin:0;font-size:14px;font-weight:400;line-height:22px;color:var(--dsw-alias-label-tertiary)}
.sr-sectionHead{display:flex;flex-direction:column;gap:12px}
/* ---------- 分组筛选 ----------
   激活态沿用官方 message-feedback 的 .sr-chipActive（黑底白字），非激活为描边胶囊。
   计数 n/m：全开时数字变绿（--dsw-alias-state-success-primary）。 */
.sr-groupTabs{display:flex;flex-wrap:wrap;gap:7px;margin-top:14px}
.sr-gtab{
  height:30px;display:inline-flex;align-items:center;gap:6px;padding:0 12px;
  border:.5px solid var(--dsw-alias-border-l4);border-radius:15px;background:0 0;cursor:pointer;
  font-size:13px;line-height:18px;color:var(--dsw-alias-label-secondary);
  transition:background-color var(--ds-transition-duration-fast),border-color var(--ds-transition-duration-fast),color var(--ds-transition-duration-fast);
}
.sr-gtab:hover{background:var(--dsw-alias-interactive-bg-hover)}
.sr-gtab[aria-pressed=true]{
  border-color:var(--dsw-alias-button-primary-fill);
  background:var(--dsw-alias-button-primary-fill);
  color:var(--dsw-alias-label-primary-foreground);
}
.sr-gtabCount{font-family:var(--ds-font-family-code);font-size:11px;line-height:16px;color:var(--dsw-alias-label-caption)}
.sr-gtabCount[data-full=true]{color:var(--dsw-alias-state-success-primary)}
.sr-gtab[aria-pressed=true] .sr-gtabCount{color:inherit;opacity:.72}
.sr-blockHeadLabel{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.sr-block{margin-top:20px}
.sr-blockHead{
  display:flex;align-items:center;gap:8px;margin-bottom:10px;
}
.sr-blockTitle{
  margin:0;flex:1;font-size:12px;font-weight:600;line-height:18px;
  color:var(--dsw-alias-label-tertiary);
}
.sr-blockNote{margin:0 0 10px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}

/* ============================================================
   .sr-field —— 官方竖排表单字段（label 上 / 控件中 / hint 下，gap 6）
   ============================================================ */
.sr-fields{display:flex;flex-direction:column;gap:12px}
.sr-field{display:flex;flex-direction:column;gap:6px}
.sr-fieldLabel{font-size:12px;font-weight:500;line-height:18px;color:var(--dsw-alias-label-secondary)}
.sr-fieldHint{font-size:12px;font-weight:400;line-height:18px;color:var(--dsw-alias-label-tertiary)}
/* 字段级报错：官方 .sr-zGbnIq_error / .sr-At1oFq_invalid 的写法。注意官方那两个类引用的
   --dsw-alias-label-error 是未定义变量（官方自己的 bug），要用 state-error-primary */
.sr-.sr-root input[aria-invalid=true]{border-color:var(--dsw-alias-state-error-primary)}
.sr-fieldError{font-size:12px;font-weight:400;line-height:18px;color:var(--dsw-alias-state-error-primary)}
.sr-fieldError b{font-weight:500}
.sr-linkAction{
  background:0 0;border:0;padding:0;font:inherit;color:var(--dsw-alias-link);
  cursor:pointer;text-decoration:underline;text-underline-offset:2px;
}

.sr-input,.sr-select,.sr-textarea{
  height:32px;border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;
  background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);
  font-size:14px;line-height:22px;padding:0 10px;
  transition:border-color var(--ds-transition-duration-fast),box-shadow var(--ds-transition-duration-fast);
}
.sr-input::placeholder,.sr-textarea::placeholder{color:var(--dsw-alias-label-dimmed)}
.sr-input:focus,.sr-select:focus,.sr-textarea:focus{
  outline:none;border-color:var(--dsw-alias-brand-primary)}
.sr-input.sr-mono{font-family:var(--ds-font-family-code);font-size:13px}
.sr-input.sr-num{width:112px}
.sr-select{
  width:100%;padding:0 26px 0 10px;appearance:none;cursor:pointer;
  background-image:linear-gradient(45deg,transparent 50%,var(--dsw-alias-label-tertiary) 50%),
                   linear-gradient(135deg,var(--dsw-alias-label-tertiary) 50%,transparent 50%);
  background-position:calc(100% - 14px) 13px,calc(100% - 10px) 13px;
  background-size:4px 4px,4px 4px;background-repeat:no-repeat;
}
.sr-textarea{
  height:auto;min-height:168px;resize:vertical;padding:9px 11px;
  font-family:var(--ds-font-family-code);font-size:12.5px;line-height:20px;
}

/* ---------- [R] 通用设置行：文字撑开 + 控件靠右 ---------- */
.sr-row{display:flex;align-items:center;gap:12px;padding:16px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}
.sr-row:last-child{border-bottom:0}
.sr-rowText{display:flex;flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:48px}
.sr-rowTitle{font-size:14px;font-weight:400;line-height:22px}
.sr-rowDesc{font-size:12px;font-weight:400;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.sr-rowRight{flex:none;display:flex;align-items:center;gap:8px}

/* ---------- 开关：轨道 border-l3，选中 brand-primary，thumb 16px ---------- */
.sr-switch{
  flex:none;width:36px;height:20px;border-radius:10px;border:0;padding:0;cursor:pointer;
  background:var(--dsw-alias-border-l3);position:relative;
  transition:background-color var(--ds-transition-duration) var(--ds-ease-in-out);
}
.sr-switch::after{
  content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;
  background:#fff;box-shadow:0 1px 3px #00000040;
  transition:transform var(--ds-transition-duration) var(--ds-ease-in-out);
}
.sr-switch[aria-checked=true]{background:var(--dsw-alias-brand-primary)}
.sr-switch[aria-checked=true]::after{transform:translateX(16px)}

/* ---------- 按钮：36px / r18 / 14px（sm 28 / r14 / 12px） ---------- */
.sr-btn{
  height:36px;display:inline-flex;align-items:center;justify-content:center;gap:5px;
  padding:0 14px;border:0;border-radius:18px;cursor:pointer;white-space:nowrap;
  font-size:14px;font-weight:400;line-height:22px;
  transition:background-color var(--ds-transition-duration-fast) var(--ds-ease-in-out);
}
.sr-btnPrimary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
.sr-btnPrimary:hover{background:var(--dsw-alias-button-primary-hover)}
.sr-btnGhost{background:0 0;color:var(--dsw-alias-label-secondary)}
.sr-btnGhost:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.sr-btnOutline{background:0 0;border:.5px solid var(--dsw-alias-border-l3)}
.sr-btnOutline:hover{background:var(--dsw-alias-interactive-bg-hover)}
.sr-btnDanger{background:0 0;color:var(--dsw-alias-state-error-primary)}
.sr-btnDanger:hover{background:var(--dsw-alias-interactive-bg-hover-danger)}
.sr-btnSm{height:28px;border-radius:14px;padding:0 10px;font-size:12px;line-height:18px}

/* ---------- Tag：999px 胶囊 / padding 1px 8px / lh 17px / w500 ---------- */
.sr-tag{
  display:inline-flex;align-items:center;gap:4px;white-space:nowrap;
  border-radius:999px;padding:1px 8px;font-size:11px;line-height:17px;font-weight:500;
}
.sr-tag[data-tone=outline]{border:.5px solid var(--dsw-alias-border-l4);color:var(--dsw-alias-label-tertiary)}
.sr-tag[data-tone=neutral]{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary)}
.sr-tag[data-tone=quiet]{color:var(--dsw-alias-label-tertiary)}
.sr-tag[data-tone=warning]{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 12%,transparent);color:var(--dsw-alias-state-warn-primary)}
.sr-tag[data-tone=danger]{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);color:var(--dsw-alias-state-error-primary)}
.sr-tag.sr-mono{font-family:var(--ds-font-family-code);font-size:10.5px}

/* ---------- 卡片：r16 / border-l4 / bg-layer-3 / hover 换 border-color ---------- */
.sr-card{
  border:.5px solid var(--dsw-alias-border-l4);border-radius:16px;
  background:var(--dsw-alias-bg-layer-3);
  transition:border-color var(--ds-transition-duration-fast) var(--ds-ease-in-out),
             background-color var(--ds-transition-duration-fast) var(--ds-ease-in-out);
}
.sr-card:hover{border-color:var(--dsw-alias-label-dimmed)}

/* ============================================================
   角色列表
   ============================================================ */
.sr-roleList{display:flex;flex-direction:column;gap:8px;margin:12px 0 0}
/* 外层是 div 不是 button —— 右侧开关也是 button，而 button 不能嵌 button */
.sr-roleCard{
  display:flex;align-items:center;gap:8px;width:100%;
  padding-right:16px;text-align:left;
}
/* 卡片主体：点这里进编辑页 */
.sr-roleMain{
  flex:1;min-width:0;display:flex;align-items:flex-start;gap:12px;
  padding:14px 0 14px 16px;border:0;background:0 0;text-align:left;cursor:pointer;
}
/* 整卡 hover（含右侧开关区），官方 .sr-qSYn7G_cardContent:hover 同款 */
.sr-roleCard:hover{background:var(--dsw-alias-interactive-bg-hover)}
/* 必须显式写这一条：.sr-roleCard 的 display:flex 会盖掉 [hidden] 的 UA 样式 display:none，
   结果分组筛选"点了没反应"。DOM 断言（hidden 属性确实设上了）看不出这个问题，是看图才发现的 */
.sr-roleCard[hidden]{display:none}
/* 停用态：名字降一级。不给整卡加 opacity —— 那会把开关也一起变淡 */
.sr-roleCard[data-off=true] .sr-roleName{color:var(--dsw-alias-label-tertiary)}
.sr-roleCard[data-off=true] .sr-roleDesc{color:var(--dsw-alias-label-caption)}
/* 箭头 = “这块能点进去”，与右侧开关分工：箭头管进入，开关管启停
   颜色用 label-tertiary（官方 .sr-YyYd_a_chevron 同款）—— 最初写 label-dimmed，
   在白卡上几乎不可见，是看图才发现的 */
.sr-roleArrow{flex:none;align-self:center;color:var(--dsw-alias-label-tertiary)}
.sr-roleCard:hover .sr-roleArrow{color:var(--dsw-alias-label-secondary)}
.sr-roleBody{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.sr-roleNameRow{display:flex;align-items:center;gap:7px;min-width:0;flex-wrap:wrap}
.sr-roleName{font-size:15px;font-weight:600;line-height:1.4;white-space:nowrap}
.sr-roleId{font-family:var(--ds-font-family-code);font-size:11.5px;line-height:18px;color:var(--dsw-alias-label-caption);white-space:nowrap}
.sr-roleDesc{font-size:13px;line-height:1.5;color:var(--dsw-alias-label-tertiary);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sr-roleMeta{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:3px}
.sr-dot{flex:none;width:7px;height:7px;border-radius:50%;margin-top:8px}
.sr-dotOk{background:var(--dsw-alias-state-success-primary)}
.sr-dotWarn{background:var(--dsw-alias-state-warn-primary)}
.sr-dotOff{background:var(--dsw-alias-label-dimmed)}

/* ============================================================
   模型链候选
   ============================================================ */
.sr-chain{display:flex;flex-direction:column;gap:10px}
.sr-cand{padding:11px 13px;display:flex;flex-direction:column;gap:10px}
.sr-candTop{display:flex;align-items:center;gap:9px}
.sr-candIdx{
  flex:none;width:18px;height:18px;border-radius:50%;display:grid;place-items:center;
  background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);
  font-size:10.5px;font-weight:500;
}
.sr-candCtl{display:flex;align-items:center;gap:8px;flex:1;min-width:0}
.sr-candCtl .sr-select{flex:1;min-width:0}
.sr-candActs{flex:none;display:flex;align-items:center;gap:1px}
.sr-candFoot{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sr-candFoot .sr-select{flex:none;width:auto;min-width:104px}
.sr-check{display:inline-flex;align-items:center;gap:4px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.sr-checkOk{color:var(--dsw-alias-state-success-primary)}

/* ---------- 折叠行 ---------- */
.sr-disc{
  display:flex;align-items:center;gap:7px;width:100%;
  height:32px;padding:0 8px;margin:0 -8px;border:0;border-radius:8px;background:0 0;
  cursor:pointer;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary);text-align:left;
}
.sr-disc:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.sr-disc .sr-chev{transition:transform var(--ds-transition-duration-fast) var(--ds-ease-in-out)}
.sr-disc[aria-expanded=true] .sr-chev{transform:rotate(90deg)}
.sr-discMeta{margin-left:auto;font-size:12px;line-height:18px;color:var(--dsw-alias-label-caption)}
.sr-discBody{padding:4px 0 2px}
.sr-discBody[hidden]{display:none}

/* ---------- chip（多选） ---------- */
.sr-chips{display:flex;flex-wrap:wrap;gap:8px}
.sr-chip{
  height:28px;display:inline-flex;align-items:center;gap:5px;padding:0 11px;
  border:.5px solid var(--dsw-alias-border-l4);border-radius:14px;background:0 0;
  font-size:13px;line-height:18px;cursor:pointer;
  transition:background-color var(--ds-transition-duration-fast),border-color var(--ds-transition-duration-fast),color var(--ds-transition-duration-fast);
}
.sr-chip:hover{background:var(--dsw-alias-interactive-bg-hover)}
.sr-chip[aria-pressed=true]{border-color:var(--dsw-alias-button-primary-fill);
  background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
.sr-chip .sr-ico12{opacity:0;transition:opacity var(--ds-transition-duration-fast)}
.sr-chip[aria-pressed=true] .sr-ico12{opacity:1}
.sr-chip.sr-mono{font-family:var(--ds-font-family-code);font-size:12px}

/* ---------- 分段控件 ---------- */
.sr-seg{display:inline-flex;gap:2px;padding:2px;border-radius:16px;background:var(--dsw-alias-bg-module-platform)}
.sr-seg button{
  height:24px;padding:0 12px;border:0;border-radius:14px;background:0 0;cursor:pointer;
  font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);white-space:nowrap;
}
.sr-seg button[aria-pressed=true]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-weight:500;box-shadow:0 1px 2px #0000000f}

/* ---------- 面包屑（「返回上级」） ---------- */
.sr-crumbs{display:flex;align-items:center;gap:2px;margin-bottom:6px}
.sr-crumb{
  max-width:220px;padding:3px 8px;border:0;border-radius:10px;background:0 0;cursor:pointer;
  font-size:14px;line-height:22px;color:var(--dsw-alias-label-tertiary);
  display:inline-flex;align-items:center;gap:4px;white-space:nowrap;overflow:hidden;
}
.sr-crumb:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.sr-crumbSep{color:var(--dsw-alias-label-caption);font-size:13px;line-height:22px}
.sr-crumbCurrent{padding:3px 8px;font-size:14px;line-height:22px;font-weight:500}

/* ---------- 底部操作条（sticky；官方 section 无此模式，是我加的） ---------- */
.sr-footer{
  position:sticky;bottom:-24px;z-index:2;
  display:flex;align-items:center;gap:10px;
  margin:16px -24px -24px;padding:13px 24px 24px;
  background:var(--dsw-alias-bg-layer-2);
  border-top:.5px solid var(--dsw-alias-border-l2);
}
.sr-footerSpacer{flex:1}
.sr-footerHint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-caption)}

/* ---------- 空态（沿用官方 .sr-zGbnIq_modelEmpty 的虚线框模式） ---------- */
.sr-empty{
  border:1px dashed var(--dsw-alias-border-l3);border-radius:8px;
  display:flex;flex-direction:column;align-items:center;gap:10px;
  margin-top:12px;padding:26px 24px;text-align:center;
}
.sr-emptyTitle{font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.sr-emptyDesc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);max-width:340px}`;

		function ensureStyles() {
			if (document.getElementById(STYLE_ID) !== null) return;
			const el = document.createElement("style");
			el.id = STYLE_ID;
			el.setAttribute("data-plugin-css", "dsh-plugin-sage-subagent");
			el.textContent = CSS;
			document.head.appendChild(el);
		}

		const e = react.createElement;
		const msg = (err) => (err instanceof Error ? err.message : String(err));

		async function callRpc(connection, method, payload) {
			const result = await connection.rpc.call("/api", method, payload === undefined ? {} : payload);
			if (result === null || typeof result !== "object") throw new Error("RPC 返回不可用");
			if (result.ok !== true) {
				throw new Error(result.error && result.error.message ? result.error.message : "未知错误");
			}
			return result.value;
		}

		/* ── 分组：**从角色派生**，不是硬编码清单 ──────────────────────
		 * 写一个角色带 group: "我的项目"，就多出一个叫「我的项目」的组；该组最后一个角色
		 * 被删掉或改走，这个组就消失。所以这里没有权威清单，只有「内置建议」——
		 * 给新建角色一个顺手的起点，用户完全可以不用。
		 * 组名就是显示名（中文也行），不需要 id ↔ 显示名的映射。 */
		const SUGGESTED_GROUPS = ["工程实践", "审查把关", "调研与写作", "语言与框架"];

		/** 当前**有角色**的组 —— chip 只显示这些，空组不该占位置。 */
		function groupsInUse(roles) {
			const out = [];
			for (const name of SUGGESTED_GROUPS) {
				if (roles.some((role) => role.group === name)) out.push(name);
			}
			for (const role of roles) {
				if (out.indexOf(role.group) < 0) out.push(role.group);
			}
			return out;
		}

		/** 下拉能选的组：有角色的组 ∪ 建议组 —— 空组也要能选，否则没法把角色放进一个全新的组。 */
		function selectableGroups(roles) {
			const out = groupsInUse(roles);
			for (const name of SUGGESTED_GROUPS) {
				if (out.indexOf(name) < 0) out.push(name);
			}
			return out;
		}

		/* ── 图标：官方是 16 视框、1.4 描边、圆头圆角 ── */
		const PATHS = {
			plus: "M8 3.5v9M3.5 8h9",
			right: "M6 3.5L10.5 8 6 12.5",
			left: "M10 3.5L5.5 8 10 12.5",
			close: "M4 4l8 8M12 4l-8 8",
			up: "M8 12v-8M4.8 7.2L8 4l3.2 3.2",
			down: "M8 4v8M4.8 8.8L8 12l3.2-3.2",
			check: "M3.5 8.5l3 3 6-7",
		};
		function Icon(props) {
			return e(
				"svg",
				{ className: props.cls === undefined ? "sr-ico" : props.cls, viewBox: "0 0 16 16" },
				e("path", { d: PATHS[props.name] }),
			);
		}
		const Icon12 = (name) => e(Icon, { name, cls: "sr-ico sr-ico12" });
		const Icon14 = (name) => e(Icon, { name, cls: "sr-ico sr-ico14" });

		/* ── 小组件 ───────────────────────────────────────────────── */

		function Switch(props) {
			return e("button", {
				type: "button",
				className: "sr-switch",
				role: "switch",
				"aria-checked": props.on ? "true" : "false",
				title: props.title,
				onClick: props.onToggle,
			});
		}

		function Tag(props) {
			return e(
				"span",
				{ className: props.mono ? "sr-tag sr-mono" : "sr-tag", "data-tone": props.tone || "quiet" },
				props.children,
			);
		}

		function Btn(props) {
			return e(
				"button",
				{
					type: "button",
					className: "sr-btn sr-btn" + props.kind + (props.small ? " sr-btnSm" : ""),
					disabled: props.disabled === true,
					title: props.title,
					onClick: props.onClick,
				},
				props.children,
			);
		}

		/* ── 视图①：角色列表 ──────────────────────────────────────── */

		/**
		 * 角色卡。外层是 div 不是 button —— 右侧的启停开关也是 button，
		 * 而 button 不能嵌 button。卡片主体（.sr-roleMain）点进编辑。
		 */
		function RoleCard(props) {
			const role = props.role;
			return e(
				"div",
				{ className: "sr-roleCard sr-card", "data-off": role.enabled === false ? "true" : "false" },
				e(
					"button",
					{ type: "button", className: "sr-roleMain", onClick: props.onOpen },
					e("span", { className: "sr-dot " + (role.enabled === false ? "sr-dotOff" : "sr-dotOk") }),
					e(
						"span",
						{ className: "sr-roleBody" },
						e(
							"span",
							{ className: "sr-roleNameRow" },
							e("span", { className: "sr-roleName" }, role.name),
							e("span", { className: "sr-roleId" }, role.id),
						),
						e("span", { className: "sr-roleDesc" }, role.description),
						e(
							"span",
							{ className: "sr-roleMeta" },
							e(Tag, { tone: "quiet" }, toolScopeLabel(role)),
							e(Tag, { tone: "quiet" }, "深度 " + String(role.maxDepth)),
						),
					),
					Icon14("right"),
				),
				e(Switch, {
					on: role.enabled !== false,
					title: "启用 / 停用此角色",
					onToggle: props.onToggle,
				}),
			);
		}

		/** 工具权限的短标签：白名单 / 黑名单 / 继承全部。 */
		function toolScopeLabel(role) {
			const tools = role.tools || { allow: [], deny: [] };
			if (tools.allow.length > 0) return "白名单 " + String(tools.allow.length);
			if (tools.deny.length > 0) return "黑名单 " + String(tools.deny.length);
			return "继承全部";
		}

		function RoleList(props) {
			const state = props.state;
			const visible = state.roles.filter(
				(role) => props.group === "all" || role.group === props.group,
			);
			const inGroup = props.group === "all"
				? state.roles
				: state.roles.filter((role) => role.group === props.group);
			const groupAllOn = inGroup.length > 0 && inGroup.every((role) => role.enabled !== false);

			return e(
				"div",
				null,
				e(
					"div",
					{ className: "sr-sectionHead" },
					e("h1", { className: "sr-sectionTitle" }, "子代理角色"),
					e(
						"p",
						{ className: "sr-sectionIntro" },
						"把「派什么子代理」变成可复用的具名角色：人设、模型链、技能、工具权限一次定义好，派发时点名即可。",
					),
				),

				// 接管总开关：后端接线还没做（Phase 3 剩余项），所以先禁用并写明，不留死 UI 装样子
				e(
					"div",
					{ className: "sr-row" },
					e(
						"div",
						{ className: "sr-rowText" },
						e("div", { className: "sr-rowTitle" }, "接管子代理派发"),
						e(
							"div",
							{ className: "sr-rowDesc" },
							"后端接线尚未完成，开关暂时禁用 —— 当前固定为共存模式（官方 delegate 照常可用）。",
						),
					),
					e(
						"div",
						{ className: "sr-rowRight" },
						e("button", {
							type: "button",
							className: "sr-switch",
							role: "switch",
							"aria-checked": "false",
							disabled: true,
							title: "接管开关待接线",
						}),
					),
				),

				e(
					"div",
					{ className: "sr-groupTabs" },
					[
						e(
							"button",
							{
								key: "all",
								type: "button",
								className: "sr-gtab",
								"aria-pressed": props.group === "all" ? "true" : "false",
								onClick: () => props.onGroup("all"),
							},
							"全部",
						),
					].concat(
						groupsInUse(state.roles).map((name) => {
							const own = state.roles.filter((role) => role.group === name);
							const on = own.filter((role) => role.enabled !== false).length;
							return e(
								"button",
								{
									key: name,
									type: "button",
									className: "sr-gtab",
									"aria-pressed": props.group === name ? "true" : "false",
									onClick: () => props.onGroup(name),
								},
								name + " ",
								e(
									"span",
									{
										className: "sr-gtabCount",
										"data-full": own.length > 0 && on === own.length ? "true" : "false",
									},
									String(on) + "/" + String(own.length),
								),
							);
						}),
					),
				),

				e(
					"div",
					{ className: "sr-block" },
					e(
						"div",
						{ className: "sr-blockHead" },
						e(
							"h2",
							{ className: "sr-blockTitle" },
							(props.group === "all" ? "角色" : props.group) + " · " + String(visible.length),
						),
						props.group === "all"
							? null
							: e("span", { className: "sr-blockHeadLabel" }, groupAllOn ? "整组已启用" : "整组启用"),
						props.group === "all"
							? null
							: e(Switch, {
								on: groupAllOn,
								title: "一次开 / 关本组全部角色",
								onToggle: () => props.onGroupToggle(!groupAllOn),
							}),
						props.group === "all"
							? null
							: e(
								Btn,
								{
									kind: "Ghost",
									small: true,
									title: "改名会把这一组所有角色的 group 字段一起改写",
									onClick: () => props.onRenameGroup(props.group),
								},
								"重命名",
							),
						e(
							Btn,
							{ kind: "Outline", small: true, onClick: props.onNew },
							Icon12("plus"),
							"新建角色",
						),
					),
					visible.length === 0
						? e(
							"div",
							{ className: "sr-empty" },
							e("div", { className: "sr-emptyTitle" }, "这一组还没有角色"),
							e("div", { className: "sr-emptyDesc" }, "点「新建角色」，或者从「全部」里把别的角色改到这一组。"),
						)
						: e(
							"div",
							{ className: "sr-roleList" },
							visible.map((role) =>
								e(RoleCard, {
									key: role.id,
									role,
									onOpen: () => props.onEdit(role.id),
									onToggle: () => props.onToggle(role, role.enabled === false),
								}),
							),
						),
				),

				state.diagnostics.length > 0
					? e(
						"div",
						{ className: "sr-block" },
						e("h2", { className: "sr-blockTitle" }, "文件提示 · " + String(state.diagnostics.length)),
						state.diagnostics.map((item) =>
							e(
								"div",
								{ key: item.id + item.path, className: "sr-field" },
								e("span", { className: "sr-fieldLabel" }, item.path),
								item.errors.map((text, i) => e("span", { key: "e" + String(i), className: "sr-fieldError" }, text)),
								item.warnings.map((text, i) => e("span", { key: "w" + String(i), className: "sr-fieldHint" }, text)),
							),
						),
					)
					: null,
			);
		}

		/* ── 视图②：角色编辑 ──────────────────────────────────────── */

		/** 单个竖排字段（官方 .field：label 上、控件中、hint 下，gap 6）。 */
		function Field(props) {
			return e(
				"div",
				{ className: "sr-field" },
				e("span", { className: "sr-fieldLabel" }, props.label),
				props.children,
				props.hint === undefined ? null : e("span", { className: "sr-fieldHint" }, props.hint),
				props.error === undefined ? null : e("span", { className: "sr-fieldError" }, props.error),
			);
		}

		function ModelChainEditor(props) {
			const chain = props.chain;
			const models = props.models;
			const set = props.onChange;

			const providerOptions = (selected) =>
				[e("option", { key: "", value: "" }, "（继承父代理）")].concat(
					models.map((p) => e("option", { key: p.id, value: p.id }, p.name)),
				);

			const modelOptions = (provider, selected) => {
				const entry = models.filter((p) => p.id === provider)[0];
				const list = entry === undefined ? [] : entry.models;
				return [e("option", { key: "", value: "" }, "选择模型…")].concat(
					list.map((m) => e("option", { key: m.id, value: m.id }, m.id)),
				);
			};

			// 强度项是 { id, name, description } 这样的**对象**（LlmReasoningEffortInfo），
			// 不是字符串。把对象直接塞进 <option> 的 children 会触发 React error #31
			// （objects are not valid as a React child）→ 整棵子树被卸载 → 设置面板整块空白。
			// 2026-09-15 复现并定位：症状是「点编辑整块空白」，根因就是这里。
			const effortValue = (x) =>
				typeof x === "string" ? x : (x && (x.id || x.name)) || String(x);
			const effortLabel = (x) =>
				typeof x === "string" ? x : (x && (x.name || x.id)) || String(x);
			const effortOptions = (provider, model, selected) => {
				const p = models.filter((x) => x.id === provider)[0];
				const m = p === undefined ? undefined : p.models.filter((x) => x.id === model)[0];
				const list = m === undefined || m.efforts === undefined ? [] : m.efforts;
				return [e("option", { key: "", value: "" }, "默认强度")].concat(
					list.map((x) => {
						const value = effortValue(x);
						return e("option", { key: value, value }, effortLabel(x));
					}),
				);
			};

			const patch = (index, part) =>
				set(chain.map((entry, i) => (i === index ? Object.assign({}, entry, part) : entry)));

			return e(
				"div",
				{ className: "sr-chain" },
				chain.map((entry, index) =>
					e(
						"div",
						{ key: String(index), className: "sr-cand sr-card" },
						e(
							"div",
							{ className: "sr-candTop" },
							e("span", { className: "sr-candIdx" }, String(index + 1)),
							e(
								"div",
								{ className: "sr-candCtl" },
								e(
									"select",
									{
										className: "sr-select",
										value: entry.provider || "",
										onChange: (ev) => patch(index, { provider: ev.target.value, model: "" }),
									},
									providerOptions(entry.provider),
								),
								e(
									"select",
									{
										className: "sr-select",
										value: entry.model || "",
										onChange: (ev) => patch(index, { model: ev.target.value }),
									},
									modelOptions(entry.provider, entry.model),
								),
							),
							e(
								"div",
								{ className: "sr-candActs" },
								e(
									"button",
									{
										type: "button",
										className: "sr-iconBtn",
										disabled: index === 0,
										title: "上移",
										onClick: () => {
											const next = chain.slice();
											const tmp = next[index - 1];
											next[index - 1] = next[index];
											next[index] = tmp;
											set(next);
										},
									},
									Icon14("up"),
								),
								e(
									"button",
									{
										type: "button",
										className: "sr-iconBtn",
										disabled: index === chain.length - 1,
										title: "下移",
										onClick: () => {
											const next = chain.slice();
											const tmp = next[index + 1];
											next[index + 1] = next[index];
											next[index] = tmp;
											set(next);
										},
									},
									Icon14("down"),
								),
								e(
									"button",
									{
										type: "button",
										className: "sr-iconBtn",
										title: "删除候选",
										onClick: () => set(chain.filter((_, i) => i !== index)),
									},
									Icon14("close"),
								),
							),
						),
						e(
							"div",
							{ className: "sr-candFoot" },
							e(
								"select",
								{
									className: "sr-select",
									value: entry.effort || "",
									onChange: (ev) => patch(index, { effort: ev.target.value }),
								},
								effortOptions(entry.provider, entry.model, entry.effort),
							),
							e("span", { className: "sr-fieldLabel" }, "maxTokens"),
							e("input", {
								className: "sr-input sr-inputNum",
								value: entry.maxTokens === undefined ? "" : String(entry.maxTokens),
								placeholder: "留空用默认",
								onChange: (ev) => {
									const raw = ev.target.value.trim();
									const parsed = Number(raw);
									patch(index, {
										maxTokens: raw !== "" && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined,
									});
								},
							}),
							props.checking === index
								? e("span", { className: "sr-check" }, "测试中…")
								: e(
									Btn,
									{
										kind: "Ghost",
										small: true,
										onClick: () => props.onCheck(index),
									},
									props.checkResults[index] === undefined ? "响应测试" : props.checkResults[index],
								),
						),
					),
				),
				e(
					Btn,
					{ kind: "Outline", small: true, onClick: () => set(chain.concat([{ provider: "", model: "" }])) },
					Icon12("plus"),
					"添加候选",
				),
			);
		}

		function RoleEditor(props) {
			const draft = props.draft;
			const patch = (part) => props.onPatch(Object.assign({}, draft, part));
			const isNew = props.isNew;
			const conflict = props.conflict;

			return e(
				"div",
				null,
				e(
					"div",
					{ className: "sr-crumbs" },
					e(
						"button",
						{ type: "button", className: "sr-crumb", onClick: props.onBack },
						Icon12("left"),
						"子代理角色",
					),
					e("span", { className: "sr-crumbSep" }, "/"),
					e("span", { className: "sr-crumbCurrent" }, isNew ? "新建" : draft.name),
				),

				e(
					"div",
					{ className: "sr-sectionHead" },
					e("h1", { className: "sr-sectionTitle" }, isNew ? "新建角色" : "编辑角色"),
					e(
						"p",
						{ className: "sr-sectionIntro" },
						isNew
							? "标识决定文件名与派发时 role 的取值，全库唯一。"
							: "改动写入 .agent-roles/" + draft.id + ".md，frontmatter 以下的正文即人设。",
					),
				),

				e(
					"div",
					{ className: "sr-block" },
					e("h2", { className: "sr-blockTitle" }, "基本信息"),
					e(
						"div",
						{ className: "sr-fields" },
						e(
							Field,
							{ label: "显示名" },
							e("input", {
								className: "sr-input",
								value: draft.name,
								onChange: (ev) => patch({ name: ev.target.value }),
							}),
						),
						e(
							Field,
							{
								label: "标识",
								hint: "文件名与 role 参数取值，小写字母与连字符",
								error:
									conflict === null || conflict === undefined
										? undefined
										: e(
											"span",
											null,
											conflict.message,
											" ",
											e(
												"button",
												{ type: "button", className: "sr-linkAction", onClick: props.onDuplicate },
												"复制它到本组",
											),
										),
							},
							e("input", {
								className: "sr-input sr-mono",
								value: draft.id,
								"aria-invalid": conflict === null || conflict === undefined ? undefined : "true",
								disabled: !isNew,
								onChange: (ev) => patch({ id: ev.target.value }),
							}),
						),
						e(
							Field,
							{ label: "描述", hint: "会写进派发工具的说明，主代理据此挑角色 —— 写「何时用它」，不写「它是谁」" },
							e("input", {
								className: "sr-input",
								value: draft.description,
								onChange: (ev) => patch({ description: ev.target.value }),
							}),
						),
						e(
							Field,
							{ label: "所属分组", hint: "一个角色只属于一个分组。想让同样的角色也出现在另一个组，复制一份并换个标识 —— 这样两者各有独立开关，互不牵连。" },
							e(
								"select",
								{
									className: "sr-select",
									value: draft.group,
									onChange: (ev) => {
										if (ev.target.value === "__new__") {
											const name = window.prompt("新分组的名字（中文也行）");
											if (name !== null && name.trim() !== "") patch({ group: name.trim() });
											return;
										}
										patch({ group: ev.target.value });
									},
								},
								props.allGroups.map((name) => e("option", { key: name, value: name }, name)),
								e("option", { key: "__new__", value: "__new__" }, "＋ 新建分组…"),
							),
						),
					),
				),

				e(
					"div",
					{ className: "sr-block" },
					e(
						"div",
						{ className: "sr-blockHead" },
						e("h2", { className: "sr-blockTitle" }, "模型链"),
					),
					e("p", { className: "sr-blockNote" }, "按顺序尝试，前一个不可用时自动换下一个；留空表示继承父代理。"),
					e(ModelChainEditor, {
						chain: draft.model.chain,
						models: props.models,
						checking: props.checking,
						checkResults: props.checkResults,
						onChange: (chain) => patch({ model: Object.assign({}, draft.model, { chain }) }),
						onCheck: props.onCheckCandidate,
					}),
				),

				e(
					"div",
					{ className: "sr-block" },
					e("h2", { className: "sr-blockTitle" }, "技能"),
					e(
						"p",
						{ className: "sr-blockNote" },
						"来自 .agent-roles/skills/，只做加法：勾选的技能只对派出的子代理可见。",
					),
					props.poolSkills.length === 0
						? e("p", { className: "sr-fieldHint" }, "技能池是空的 —— 把 SKILL.md 放进该目录即可，保存后自动重扫。")
						: e(
							"div",
							{ className: "sr-chips" },
							props.poolSkills.map((skill) => {
								const on = draft.skills.indexOf(skill.name) >= 0;
								return e(
									"button",
									{
										key: skill.name,
										type: "button",
										className: "sr-chip",
										"aria-pressed": on ? "true" : "false",
										title: skill.description,
										onClick: () =>
											patch({
												skills: on
													? draft.skills.filter((x) => x !== skill.name)
													: draft.skills.concat([skill.name]),
											}),
									},
									Icon12("check"),
									skill.name,
								);
							}),
						),
				),

				e(
					"div",
					{ className: "sr-block" },
					e("h2", { className: "sr-blockTitle" }, "工具权限"),
					e(
						"div",
						{ className: "sr-seg" },
						[
							{ id: "all", label: "继承全部" },
							{ id: "allow", label: "白名单" },
							{ id: "deny", label: "黑名单" },
						].map((mode) => {
							const current =
								draft.tools.allow.length > 0 ? "allow" : draft.tools.deny.length > 0 ? "deny" : "all";
							return e(
								"button",
								{
									key: mode.id,
									type: "button",
									"aria-pressed": current === mode.id ? "true" : "false",
									onClick: () =>
										patch({ tools: { allow: mode.id === "allow" ? draft.tools.allow : [], deny: mode.id === "deny" ? draft.tools.deny : [] } }),
								},
								mode.label,
							);
						}),
					),
					e(
						"p",
						{ className: "sr-fieldHint" },
						"只接受精确工具名，不支持通配符 —— 拼错会在保存时报错，而不是默默少给一个工具。共 " +
							String(props.toolNames.length) + " 个可用。",
					),
					props.toolNames.length === 0
						? null
						: e(
							"div",
							{ className: "sr-chips" },
							props.toolNames.map((name) => {
								const on =
									draft.tools.allow.indexOf(name) >= 0 || draft.tools.deny.indexOf(name) >= 0;
								const mode = draft.tools.allow.length > 0 ? "allow" : "deny";
								return e(
									"button",
									{
										key: name,
										type: "button",
										className: "sr-chip sr-mono",
										"aria-pressed": on ? "true" : "false",
										onClick: () => {
											const key = mode === "allow" ? "allow" : "deny";
											const list = draft.tools[key];
											patch({
												tools: Object.assign({}, draft.tools, {
													[key]: on ? list.filter((x) => x !== name) : list.concat([name]),
												}),
											});
										},
									},
									Icon12("check"),
									name,
								);
							}),
						),
				),

				e(
					"div",
					{ className: "sr-block" },
					e("h2", { className: "sr-blockTitle" }, "人设 · 系统提示词"),
					e("p", { className: "sr-blockNote" }, "frontmatter 以下的正文原样作为子代理的系统提示词。"),
					e("textarea", {
						className: "sr-textarea",
						value: draft.persona,
						onChange: (ev) => patch({ persona: ev.target.value }),
					}),
				),

				e(
					"div",
					{ className: "sr-footer" },
					isNew
						? null
						: e(
							Btn,
							{ kind: "Danger", small: true, onClick: props.onRemove },
							"删除角色",
						),
					e("span", { className: "sr-footerSpacer" }),
					e("span", { className: "sr-footerHint" }, props.dirty ? "改动尚未保存" : ""),
					props.busy ? e("span", { className: "sr-check" }, "处理中…") : null,
					e(
						Btn,
						{ kind: "Ghost", small: true, onClick: props.onBack },
						"取消",
					),
					e(
						Btn,
						{ kind: "Primary", small: true, disabled: props.busy, onClick: props.onSave },
						"保存",
					),
				),
			);
		}

		/* ── 主组件 ──────────────────────────────────────────────── */

		const EMPTY_DRAFT = {
			id: "",
			name: "",
			description: "",
			group: "工程实践",
			enabled: true,
			persona: "",
			skills: [],
			tools: { allow: [], deny: [] },
			model: { chain: [], switchOn: [] },
			maxDepth: 1,
			backgroundMode: "one-shot",
		};

		function RoleSection(props) {
			const connection = props.ctx.connection;
			const [state, setState] = react.useState({
				loading: true,
				error: null,
				roles: [],
				diagnostics: [],
				poolSkills: [],
				rolesDir: "",
			});
			const [group, setGroup] = react.useState("all");
			const [draft, setDraft] = react.useState(null);
			const [isNew, setIsNew] = react.useState(false);
			const [conflict, setConflict] = react.useState(null);
			const [busy, setBusy] = react.useState(false);
			const [models, setModels] = react.useState([]);
			const [toolNames, setToolNames] = react.useState([]);
			const [checking, setChecking] = react.useState(-1);
			const [checkResults, setCheckResults] = react.useState({});
			const [dirty, setDirty] = react.useState(false);

			/** 任何编辑都经由它 —— 顺手把「改动尚未保存」点亮。 */
			const patchDraft = (next) => {
				setDraft(next);
				setDirty(true);
			};

			const load = react.useCallback(async () => {
				try {
					const value = await callRpc(connection, "subagent-roles.roles.list");
					setState({
						loading: false,
						error: null,
						roles: value.roles,
						diagnostics: value.diagnostics,
						poolSkills: value.poolSkills,
						rolesDir: value.rolesDir,
					});
				} catch (err) {
					setState((prev) => Object.assign({}, prev, { loading: false, error: msg(err) }));
				}
			}, [connection]);

			react.useEffect(() => {
				ensureStyles();
				void load();
				void (async () => {
					try {
						const value = await callRpc(connection, "subagent-roles.models.list");
						setModels(value.providers);
					} catch {
						setModels([]);
					}
					try {
						const value = await callRpc(connection, "subagent-roles.tools.list");
						setToolNames(value.tools === undefined ? [] : value.tools);
					} catch {
						setToolNames([]);
					}
				})();
			}, [connection, load]);

			/** 切一个角色的启停。
			 *
			 * **走 roles.setEnabled，不走 roles.save**：列表里的 role 是投影，**不含 persona**
			 * （人设正文大，列表页用不到），而 save 要 serializeRole，它会读 role.persona ——
			 * 拿投影去 save 会崩在 undefined.trim()，界面顶上冒一句 invalid server-response。
			 * 宿主侧的 state.roles 才是完整对象，所以这件事交给宿主做。 */
			const toggleRole = async (role, next) => {
				try {
					setBusy(true);
					await callRpc(connection, "subagent-roles.roles.setEnabled", {
						ids: [role.id],
						enabled: next,
					});
					await load();
				} catch (err) {
					setState((prev) => Object.assign({}, prev, { error: msg(err) }));
				} finally {
					setBusy(false);
				}
			};

			/** 整组启停：只是「把这组每个角色的 enabled 改一遍」，组本身不存状态。
			 *  只把**需要变**的那些 id 发过去，已经对了的不动，少写几个文件。 */
			const toggleGroup = async (next) => {
				const ids = state.roles
					.filter((role) => role.group === group && (role.enabled !== false) !== next)
					.map((role) => role.id);
				if (ids.length === 0) return;
				setBusy(true);
				try {
					await callRpc(connection, "subagent-roles.roles.setEnabled", { ids, enabled: next });
					await load();
				} catch (err) {
					setState((prev) => Object.assign({}, prev, { error: msg(err) }));
				} finally {
					setBusy(false);
				}
			};

			/** 给一个分组改名：把该组所有角色的 group 字段一起改写。
			 *  组是派生的，所以「改名」就是这一件事 —— 没有别处需要同步。 */
			const renameGroup = async (from) => {
				const input = window.prompt("把分组「" + from + "」改成：", from);
				if (input === null) return;
				const to = input.trim();
				if (to === "" || to === from) return;
				setBusy(true);
				try {
					const value = await callRpc(connection, "subagent-roles.roles.setGroup", { from, to });
					// 当前正筛着这个组的话，跟着切到新名字，否则界面会突然空掉
					if (group === from) setGroup(to);
					await load();
					if (value !== null && value !== undefined && value.updated !== undefined && value.updated.length === 0) {
						setState((prev) => Object.assign({}, prev, { error: "「" + from + "」下没有角色，没有可改的" }));
					}
				} catch (err) {
					setState((prev) => Object.assign({}, prev, { error: msg(err) }));
				} finally {
					setBusy(false);
				}
			};

			const openEditor = async (id) => {
				try {
					const value = await callRpc(connection, "subagent-roles.roles.get", { id });
					setDraft(value.role);
					setIsNew(false);
					setConflict(null);
					setDirty(false);
					setCheckResults({});
				} catch (err) {
					setState((prev) => Object.assign({}, prev, { error: msg(err) }));
				}
			};

			const openNew = () => {
				setDraft(Object.assign({}, EMPTY_DRAFT, { group: group === "all" ? SUGGESTED_GROUPS[0] : group }));
				setIsNew(true);
				setConflict(null);
				setDirty(false);
				setCheckResults({});
			};

			const save = async () => {
				setBusy(true);
				setConflict(null);
				try {
					const value = await callRpc(connection, "subagent-roles.roles.save", {
						mode: isNew ? "create" : "update",
						role: draft,
					});
					if (value.conflict === true) {
						// 宿主侧挡住了覆盖（roles.save 默认 mode=create，不覆盖已有标识）。
						// 提示里必须带上「它已经在哪个组里」，并且**给出路** ——
						// 用户被拦住后的下一个念头就是「那我还想在这儿用一个怎么办」。
						setConflict({
							message:
								"标识 " + draft.id + " 已被占用 —— 它已经在「" + value.existing.group +
								"」组里。换一个标识，或者",
							existing: value.existing,
						});
						return;
					}
					setDraft(null);
					await load();
				} catch (err) {
					setState((prev) => Object.assign({}, prev, { error: msg(err) }));
				} finally {
					setBusy(false);
				}
			};

			/** 「复制它到本组」：把冲突的那个角色读完整，换个标识，作为**新角色**放进当前组。
			 *  这正好是「一个角色只属于一个组、想要两份就复制」那条设计的落地 ——
			 *  复制出来的是两个独立角色、两个独立开关，永远不会互相牵连。 */
			const duplicateIntoGroup = async () => {
				if (conflict === null || conflict === undefined || conflict.existing === null) return;
				try {
					const value = await callRpc(connection, "subagent-roles.roles.get", { id: conflict.existing.id });
					const base = value.role;
					setDraft(
						Object.assign({}, base, {
							id: base.id + "-copy",
							name: base.name + "（副本）",
							group: draft.group,
							enabled: true,
						}),
					);
					setIsNew(true);
					setConflict(null);
				} catch (err) {
					setState((prev) => Object.assign({}, prev, { error: msg(err) }));
				}
			};

			const remove = async () => {
				if (typeof window !== "undefined" && !window.confirm("删除角色 " + draft.id + "？文件会被移出 .agent-roles/。")) return;
				setBusy(true);
				try {
					await callRpc(connection, "subagent-roles.roles.remove", { id: draft.id });
					setDraft(null);
					await load();
				} catch (err) {
					setState((prev) => Object.assign({}, prev, { error: msg(err) }));
				} finally {
					setBusy(false);
				}
			};

			const checkCandidate = async (index) => {
				const entry = draft.model.chain[index];
				setChecking(index);
				try {
					const value = await callRpc(connection, "subagent-roles.route.check", {
						provider: entry.provider,
						model: entry.model,
						effort: entry.effort,
						probe: true,
					});
					const text =
						value.ok !== true
							? "不可用：" + String(value.detail)
							: (value.stage === "probe" ? "可响应 " + String(value.ms) + "ms" : "可解析");
					setCheckResults(Object.assign({}, checkResults, { [index]: text }));
				} catch (err) {
					setCheckResults(Object.assign({}, checkResults, { [index]: "失败：" + msg(err) }));
				} finally {
					setChecking(-1);
				}
			};

			if (state.loading) {
				return e("div", { className: "sr-root sr-block" }, e("p", { className: "sr-fieldHint" }, "载入中…"));
			}

			return e(
				"div",
				{ className: "sr-root" },
				state.error === null
					? null
					: e("div", { className: "sr-block" }, e("p", { className: "sr-fieldError" }, state.error)),
				draft === null
					? e(RoleList, {
						state,
						group,
						onGroup: setGroup,
						onNew: openNew,
						onEdit: (id) => void openEditor(id),
						onToggle: (role, next) => void toggleRole(role, next),
						onGroupToggle: (next) => void toggleGroup(next),
						onRenameGroup: (from) => void renameGroup(from),
					})
					: e(RoleEditor, {
						draft,
						isNew,
						conflict,
						busy,
						dirty,
						models,
						toolNames,
						allGroups: selectableGroups(state.roles),
						poolSkills: state.poolSkills,
						checking,
						checkResults,
						onPatch: patchDraft,
						onBack: () => setDraft(null),
						onSave: () => void save(),
						onRemove: () => void remove(),
						onCheckCandidate: (index) => void checkCandidate(index),
						onDuplicate: () => void duplicateIntoGroup(),
					}),
			);
		}

		const inject = ["slots", "connection"];

		function apply(ctx) {
			ctx.slots.inject("settings.section", () =>
				ctx.slots.register(
					{
						name: "settings.section",
						id: "subagent-roles",
						order: 26,
						label: "子代理角色",
					},
					(props) => e(RoleSection, Object.assign({}, props, { ctx })),
				),
			);
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
