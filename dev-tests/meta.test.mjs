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
