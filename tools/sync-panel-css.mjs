/**
 * 把 docs/panel.css 处理后注入 lib/client.js 的 CSS 常量。
 *
 * 为什么是「注入」而不是「import」：浏览器半边的模块加载器
 * （dsh-client-modules）只解析**模块图里已注册的 specifier**（包名，以及去掉尾部
 * `/client` 的规范化形式）。相对路径不在图里，`require('./x.js')` 会直接抛错 ——
 * 官方和所有第三方插件的 client.js 都是单文件，原因就在这里。
 * 所以没有构建步骤可用，只能让 CSS 以字符串常量住在 client.js 里，由本脚本维护。
 *
 * 处理三件事：
 *   1. 剥掉布局稿专用的两段（#draftbar 工具条、[data-only]/body[data-view] 视图互斥）
 *   2. 剥掉官方外壳段（.overlay/.mask/.panel/.nav/.header/.options）——那些由 DSH 提供
 *   3. 类选择器统一加 `sr-` 前缀（避免与其它插件撞车），全局元素选择器收进 `.sr-root`
 *
 * ⚠️ 顺序不能换：**先前缀化，再收作用域**。反过来的话 `.sr-root` 会被前缀化二次改名
 * 成 `.sr-sr-root`（2026-09-15 踩过）。
 *
 * 用法：node tools/sync-panel-css.mjs
 */
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const SRC = join(ROOT, 'docs', 'panel.css')
const CLIENT = join(ROOT, 'lib', 'client.js')

const fail = (message) => {
  console.error('FAIL: ' + message)
  process.exit(1)
}

let css = fs.readFileSync(SRC, 'utf8')

// ── 0. 去掉抽取时写给「落码的人」的头部提示（它的使命已经结束）────────
css = css.replace(/^[\s\S]*?(?=\*\{box-sizing)/, '')
if (!css.startsWith('*{box-sizing')) fail('没能剥掉 panel.css 的头部提示注释')

// ── 1. 剥掉审阅工具条 + 视图互斥 ────────────────────────────────
const len1 = css.length
css = css.replace(/\/\* -+ 审阅工具条[\s\S]*?display:revert!important\}\n/, '')
if (css.length === len1) fail('没能定位「审阅工具条」段')

// ── 2. 剥掉官方外壳段 ──────────────────────────────────────────
const len2 = css.length
css = css.replace(/\/\* =+\n   外壳[\s\S]*?\.options::-webkit-scrollbar-thumb\{[^}]*\}\n/, '')
if (css.length === len2) fail('没能定位「外壳」段')

// ── 3. 类选择器加 sr- 前缀 ─────────────────────────────────────
// 只匹配「点 + 字母」开头的类名，所以 .5px / .4 这类小数不会被误伤。
css = css.replace(/\.([a-zA-Z][\w-]*)/g, '.sr-$1')

// ── 4. 全局元素选择器收进 .sr-root 作用域（必须在上一步之后）──────
const scope = (from, to, label) => {
  if (!css.includes(from)) fail(`作用域化失败，找不到：${label}`)
  css = css.replace(from, () => to)
}
scope(
  '*{box-sizing:border-box}',
  '.sr-root,.sr-root *,.sr-root *::before,.sr-root *::after{box-sizing:border-box}',
  'box-sizing',
)
scope('html,body{margin:0;height:100%}\n', '', 'html/body 边距')
scope(
  'button,input,select,textarea{font-family:inherit}',
  '.sr-root button,.sr-root input,.sr-root select,.sr-root textarea{font-family:inherit}',
  '表单控件字体',
)
scope('svg{display:block;flex:none}', '.sr-root svg{display:block;flex:none}', 'svg')
scope('code{', '.sr-root code{', 'code')
scope('input[aria-invalid=true]', '.sr-root input[aria-invalid=true]', 'aria-invalid')
const lenBody = css.length
css = css.replace(/^body\{[\s\S]*?\}\n/m, '')
if (css.length === lenBody) fail('作用域化失败，找不到 body 规则块')

// ── 5. 自检 ───────────────────────────────────────────────────
for (const [label, re] of [
  ['#draftbar 规则', /#draftbar\s*\{/],
  ['[data-only]', /\[data-only/],
  ['外壳 .sr-overlay', /\.sr-overlay\b/],
  ['外壳 .sr-panel', /\.sr-panel\b/],
  ['外壳 .sr-options', /\.sr-options\b/],
  ['外壳 .sr-navCell', /\.sr-navCell\b/],
  ['未加前缀的 .row', /\n\.row[{,: ]/],
  ['未收口的 body', /^body\s*\{/m],
  ['未收口的 svg', /^svg\s*\{/m],
  ['未收口的 code', /^code\s*\{/m],
  ['二次前缀的 .sr-sr-', /\.sr-sr-/],
]) {
  if (re.test(css)) fail(`剥不干净：仍然存在 ${label}`)
}
for (const token of ['.sr-iconBtn', '.sr-roleCard', '.sr-field', '.sr-gtab', '.sr-switch', '.sr-root svg', '.sr-root code']) {
  if (!css.includes(token)) fail(`处理后找不到 ${token}`)
}

// ── 6. 注入 client.js ─────────────────────────────────────────
const client = fs.readFileSync(CLIENT, 'utf8')
const re = /const CSS = `[\s\S]*?`;\n/
if (!re.test(client)) {
  fail('lib/client.js 里找不到 `const CSS = \\`…\\`;` 常量（第 5 步要注入的目标）')
}
fs.writeFileSync(CLIENT, client.replace(re, () => `const CSS = \`\n${css}\`;\n`), 'utf8')

console.log(`注入完成：docs/panel.css -> lib/client.js`)
console.log(`  CSS ${css.length} 字符 / ${css.split('\n').length} 行`)
console.log(`  sr- 前缀已应用；已剥离 draftbar、视图互斥、官方外壳三段；全局元素选择器收进 .sr-root`)
