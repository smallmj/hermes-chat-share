import assert from 'node:assert/strict'
import { normalizeSessionInfo, buildMetaLine } from './core.mjs'

const sample = {
  model: 'gpt-5.6-sol', provider: 'openai', reasoning_effort: 'high', reasoning_effort_wire: 'high',
  version: 'v0.22.2', release_date: '2026-10-20',
  usage: { model: 'gpt-5.6-sol', input: 1000, output: 500, total: 128000, cache_hit_pct: 71, avg_tps: 34.2 }
}
assert.equal(
  buildMetaLine(normalizeSessionInfo(sample)),
  'gpt-5.6-sol @ openai  ·  thinking: high  ·  cache hit: 71%  ·  34.2 tok/s  ·  128,000 tokens  ·  Hermes v0.22.2')

// null / partial payloads must degrade, never fabricate
assert.equal(buildMetaLine(normalizeSessionInfo(null)), '')
assert.equal(buildMetaLine(normalizeSessionInfo({ model: 'm' })), 'm')
assert.equal(buildMetaLine(normalizeSessionInfo({ usage: {} })), '')
assert.equal(buildMetaLine(normalizeSessionInfo({ model: 'x', reasoning_effort: 'none' })), 'x')

console.log('META_TEST_OK')

// --- color solidification (dialog readability on vibrancy themes) ---
const { parseCssRgba, solidColor, isDarkColor } = await import('./core.mjs')
assert.deepEqual(parseCssRgba('#abc'), { r: 170, g: 187, b: 204, a: 1 })
assert.deepEqual(parseCssRgba('rgba(30, 30, 34, 0.7)'), { r: 30, g: 30, b: 34, a: 0.7 })
assert.equal(solidColor('rgba(30,30,34,0.7)', '#000000'), 'rgb(21,21,24)')
assert.equal(solidColor('#fafafa', 'rgb(0,0,0)'), 'rgb(250,250,250)')
assert.equal(isDarkColor('rgb(21,21,24)'), true)
assert.equal(isDarkColor('rgb(250,250,250)'), false)
console.log('COLOR_TEST_OK')

// --- full:false export keeps only question + final answer ---
const { turnXhtml } = await import('./core.mjs')
const thx = { bg: '#fff', fg: '#111', card: '#f8f8f8', border: '#ddd', accent: '#55f', muted: '#888', codeBg: '#eee' }
const turn = { id: 0, user: { text: '问题一' }, asst: [{ text: '中间回复甲' }, { text: '最终答复乙' }], tools: [{ name: 'terminal', ctx: 'ls' }] }
const fullX = turnXhtml(turn, { images: false, tools: true, full: true }, thx)
const briefX = turnXhtml(turn, { images: false, tools: true, full: false }, thx)
assert(fullX.includes('中间回复甲') && fullX.includes('🔧') && fullX.includes('最终答复乙'))
assert(!briefX.includes('中间回复甲') && !briefX.includes('🔧') && briefX.includes('问题一') && briefX.includes('最终答复乙'))
console.log('FULLFLAG_TEST_OK')

// --- theme override: fixed palettes + resolution ---
const { fixedThemePalette, resolveTheme } = await import('./core.mjs')
for (const mode of ['light', 'dark']) {
  const p = fixedThemePalette(mode)
  for (const k of ['bg', 'fg', 'card', 'border', 'accent', 'muted', 'codeBg', 'tok']) {
    assert(p[k] != null, mode + ' palette missing ' + k)
  }
  for (const k of ['kw', 'str', 'com', 'num', 'fn']) assert(p.tok[k], mode + ' tok missing ' + k)
}
assert.equal(resolveTheme('light').bg, fixedThemePalette('light').bg)
assert.equal(resolveTheme('dark').bg, fixedThemePalette('dark').bg)
assert.equal(resolveTheme('auto', { bg: '#cafefoo' }).bg, '#cafefoo', 'auto must pass the live theme through')
assert.ok(resolveTheme('auto', null).bg, 'auto with no live theme falls back')
// dark palette is actually dark, light palette actually light
assert.ok(fixedThemePalette('dark').bg.length > 0)
console.log('THEME_TEST_OK')

// --- JSON export shape + share-scope parity with PNG/MD ---
const { exportJson, turnJson } = await import('./core.mjs')
const jTurn = { id: 3, user: { text: 'q', ts: 1700000000 }, asst: [{ text: 'mid' }, { text: 'final' }], tools: [{ name: 'web', ctx: 'q' }] }
const jFull = JSON.parse(exportJson([jTurn], null, '标题', { full: true, tools: true, meta: true }))
assert.equal(jFull.title, '标题')
assert.equal(jFull.shareFull, true)
assert.ok(jFull.exportedAt)
assert.equal(jFull.turns[0].assistant.length, 2)
assert.equal(jFull.turns[0].tools[0].name, 'web')
const jBrief = JSON.parse(exportJson([jTurn], null, '', { full: false, tools: true, meta: false }))
assert.equal(jBrief.shareFull, false)
assert.equal(jBrief.meta, null, 'meta:false drops the meta line from JSON too')
assert.equal(jBrief.turns[0].assistant.length, 1)
assert.equal(jBrief.turns[0].assistant[0].text, 'final')
assert.equal(jBrief.turns[0].tools.length, 0, 'full:false drops tools from JSON too')
const jNoTools = JSON.parse(exportJson([jTurn], null, '', { full: true, tools: false, meta: true }))
assert.equal(jNoTools.turns[0].tools.length, 0)
console.log('JSON_TEST_OK')

// --- range selection for the gutter drag ---
const { applyRangeSelection } = await import('./core.mjs')
const allIds = [0, 1, 2, 3, 4]
// from null (all-selected), a drag replaces with the range
assert.deepEqual([...applyRangeSelection(null, allIds, 1, 3)], [1, 2, 3])
// reversed drag normalizes
assert.deepEqual([...applyRangeSelection(new Set([0, 1]), allIds, 3, 0)], [0, 1, 2, 3])
// single-tick range (click-with-tiny-drag edge)
assert.deepEqual([...applyRangeSelection(new Set([4]), allIds, 2, 2)], [2])
// out-of-range ids are simply not present
assert.deepEqual([...applyRangeSelection(new Set(), allIds, 0, 9)], [0, 1, 2, 3, 4])
console.log('RANGE_TEST_OK')

// --- syntax highlighting ---
const { highlightCode, mdToXhtml } = await import('./core.mjs')
const js = highlightCode('const x = 42; // note\nif (x) { log("hi") }', 'js')
assert(js.includes('<span class="tok-kw">const</span>'), 'js keyword')
assert(js.includes('<span class="tok-num">42</span>'), 'js number')
assert(js.includes('<span class="tok-com">// note</span>'), 'js comment')
assert(js.includes('<span class="tok-str">&quot;hi&quot;</span>'), 'js string, escaped')
// dangerous content must never survive un-escaped inside or outside tokens
assert(highlightCode('<script>alert(1)</script>', 'js').includes('&lt;script&gt;'))
assert(highlightCode('"x", <script>', 'json').includes('&lt;script&gt;'))
// python / shell aliases
assert(highlightCode('def f(): return None', 'python').includes('tok-kw'))
assert(highlightCode('echo "a" # c', 'bash').includes('tok-com'))
assert(highlightCode('{"a": 1, "b": null}', 'json').includes('tok-fn'))
// unknown language and oversized input degrade to plain esc — never worse
assert.equal(highlightCode('<b>&</b>', 'ruby'), '&lt;b&gt;&amp;&lt;/b&gt;')
assert.equal(highlightCode('x'.repeat(20000), 'js'), 'x'.repeat(20000))
// html comment vs tag classification
const html = highlightCode('<!-- c --><div id="a">t</div>', 'html')
assert(html.includes('tok-com') && html.includes('tok-kw'))
// fenced code inside markdown gets highlighted + stays XHTML-safe
const md = mdToXhtml('```js\nconst a = "s";\n```', {})
assert(md.includes('tok-kw') && md.includes('<pre><code class="lang-js">'))
const mdPlain = mdToXhtml('```\nplain <code>\n```', {})
assert(!mdPlain.includes('tok-') && mdPlain.includes('&lt;code&gt;'))
console.log('HL_TEST_OK')
