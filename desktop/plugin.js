// hermes-chat-share — share Hermes conversations as long PNG images / HTML / Markdown
// (a Hermes Desktop counterpart to dsh-share). Single-file disk plugin.
import {
  host, haptic, useValue, atom,
  ROUTES_AREA, SIDEBAR_NAV_AREA, PALETTE_AREA, KEYBINDS_AREA,
  Button, Tip, EmptyState, GlyphSpinner, MessageTextContent,
  usePluginI18n
} from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { useEffect } from 'react'

const PLUGIN_ID = 'hermes-chat-share'
const ROUTE = '/chat-share'

// ==== CORE START ==== (dependency-free export core; mirrored by the test harness)
function esc (s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function baseName (p) {
  const t = String(p).trim().replace(/[?#].*$/, '')
  const i = Math.max(t.lastIndexOf('/'), t.lastIndexOf('\\'))
  return i >= 0 ? t.slice(i + 1) : t
}

// Minimal, XHTML-valid Markdown renderer for exports. `images:true` keeps
// <img> tags (HTML export); otherwise images become placeholders (PNG export
// must not taint the canvas).
function mdToXhtml (src, opts) {
  opts = opts || {}
  const keepImg = opts.images === true
  const L = String(src == null ? '' : src).replace(/\r\n/g, '\n').split('\n')
  const out = []
  let i = 0
  const ph = (txt, cls) => '<span class="chsh-ph ' + (cls || '') + '">' + esc(txt) + '</span>'

  while (i < L.length) {
    const line = L[i]

    // fenced code
    const fence = line.match(/^\s*(```|~~~)\s*(\S*)\s*$/)
    if (fence) {
      const closeRe = new RegExp('^\\s*' + fence[1] + '\\s*$')
      const buf = []
      i++
      while (i < L.length && !closeRe.test(L[i])) { buf.push(L[i]); i++ }
      i++
      out.push('<pre><code' + (fence[2] ? ' class="lang-' + esc(fence[2]) + '"' : '') + '>' + esc(buf.join('\n')) + '</code></pre>')
      continue
    }

    // MEDIA:/directive lines → placeholders
    if (/^\s*MEDIA:\s*\S+/.test(line)) { out.push(ph('📎 ' + baseName(line.replace(/^\s*MEDIA:\s*/, '')), 'chsh-file')); i++; continue }
    if (/^\s*::[\w-]+\{.*\}\s*$/.test(line)) { out.push(ph('⬜ embedded widget omitted')); i++; continue }

    // heading
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      const lvl = Math.min(4, h[1].length)
      out.push('<h' + lvl + '>' + inline(h[2], keepImg) + '</h' + lvl + '>')
      i++
      continue
    }

    // hr
    if (/^\s*(?:[-*_]\s*){3,}$/.test(line)) { out.push('<hr/>'); i++; continue }

    // table: header row followed by |---|---|
    if (line.includes('|') && i + 1 < L.length && /^\s*\|?[\s:|-]*-[\s:|-]*$/.test(L[i + 1]) && L[i + 1].includes('-')) {
      const rows = []
      while (i < L.length && L[i].includes('|')) { rows.push(L[i]); i++ }
      if (rows.length >= 2) {
        const cells = r => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
        let t = '<table><thead><tr>'
        for (const c of cells(rows[0])) t += '<th>' + inline(c, keepImg) + '</th>'
        t += '</tr></thead><tbody>'
        for (let r = 2; r < rows.length; r++) {
          t += '<tr>'
          for (const c of cells(rows[r])) t += '<td>' + inline(c, keepImg) + '</td>'
          t += '</tr>'
        }
        t += '</tbody></table>'
        out.push(t)
        continue
      }
    }

    // blockquote
    if (/^\s*>/.test(line)) {
      const buf = []
      while (i < L.length && /^\s*>/.test(L[i])) { buf.push(L[i].replace(/^\s*>\s?/, '')); i++ }
      out.push('<blockquote>' + buf.map(b => '<p>' + inline(b, keepImg) + '</p>').join('') + '</blockquote>')
      continue
    }

    // unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items = []
      while (i < L.length && /^\s*[-*+]\s+/.test(L[i])) { items.push(L[i].replace(/^\s*[-*+]\s+/, '')); i++ }
      out.push('<ul>' + items.map(it => '<li>' + inline(it, keepImg) + '</li>').join('') + '</ul>')
      continue
    }

    // ordered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = []
      while (i < L.length && /^\s*\d+[.)]\s+/.test(L[i])) { items.push(L[i].replace(/^\s*\d+[.)]\s+/, '')); i++ }
      out.push('<ol>' + items.map(it => '<li>' + inline(it, keepImg) + '</li>').join('') + '</ol>')
      continue
    }

    // blank
    if (!line.trim()) { i++; continue }

    // paragraph: until blank / structural line
    const buf = [line]
    i++
    while (i < L.length && L[i].trim() &&
      !/^\s*(```|~~~)/.test(L[i]) && !/^(#{1,6})\s/.test(L[i]) &&
      !/^\s*[-*+]\s/.test(L[i]) && !/^\s*\d+[.)]\s/.test(L[i]) &&
      !/^\s*>/.test(L[i]) && !/^\s*MEDIA:/.test(L[i]) &&
      !/^\s*::[\w-]+\{/.test(L[i]) && !/^\s*(?:[-*_]\s*){3,}$/.test(L[i])) { buf.push(L[i]); i++ }
    out.push('<p>' + buf.map(b => inline(b, keepImg)).join('<br/>') + '</p>')
  }
  return out.join('')
}

// inline markdown → XHTML. Escapes everything, then applies inline rules.
function inline (s, keepImg) {
  const codes = []
  let t = String(s == null ? '' : s).replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000' })
  t = esc(t)
  if (keepImg) {
    t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (_, alt, src) => '<img src="' + src + '" alt="' + alt + '"/>')
  } else {
    t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (_, alt) => '<span class="chsh-ph">🖼 ' + (alt || 'image') + '</span>')
  }
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (_, txt, href) => '<a href="' + href + '">' + txt + '</a>')
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  t = t.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
  t = t.replace(/~~([^~]+)~~/g, '<del>$1</del>')
  t = t.replace(/\u0000(\d+)\u0000/g, (_, n) => '<code>' + esc(codes[+n]) + '</code>')
  return t
}

function fmtTs (ts) {
  if (typeof ts !== 'number' || !(ts > 0)) return ''
  const d = new Date(ts * 1000)
  const p = n => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
}

// Read the app theme once, as concrete values passed into the export CSS.
function snapshotTheme (docEl) {
  const cs = getComputedStyle(docEl)
  const v = n => (cs.getPropertyValue(n) || '').trim()
  const bg = v('--background') || v('--ui-background') || '#ffffff'
  const fg = v('--foreground') || v('--ui-text-primary') || '#111111'
  const card = v('--card') || v('--ui-background-elevated') || bg
  const border = v('--border') || v('--ui-stroke-secondary') || 'rgba(128,128,128,0.35)'
  const accent = v('--accent') || v('--ui-accent') || fg
  const muted = v('--muted-foreground') || v('--ui-text-secondary') || fg
  const codeBg = v('--muted') || card
  return { bg, fg, card, border, accent, muted, codeBg }
}

function exportCss (th, opt) {
  const fs = (opt.scale || 1) * 15
  return [
    '.chsh-wrap{box-sizing:border-box;font-family:-apple-system,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC",sans-serif;',
    'font-size:' + fs + 'px;line-height:1.6;color:' + th.fg + ';background:' + th.bg + ';word-break:break-word;}',
    '.chsh-wrap *{box-sizing:border-box;margin:0;padding:0;}',
    '.chsh-pad{padding:28px 26px;}',
    '.chsh-title{font-size:' + (fs * 1.25) + 'px;font-weight:600;margin-bottom:4px;}',
    '.chsh-meta{font-size:' + (fs * 0.75) + 'px;color:' + th.muted + ';margin-bottom:22px;}',
    '.chsh-turn{margin:0 0 22px;page-break-inside:avoid;}',
    '.chsh-who{font-size:' + (fs * 0.8) + 'px;font-weight:600;color:' + th.muted + ';margin:0 0 6px;display:flex;}',
    '.chsh-ts{font-weight:400;margin-left:8px;}',
    '.chsh-user .chsh-body{background:' + th.card + ';border:1px solid ' + th.border + ';border-radius:12px;padding:12px 14px;}',
    '.chsh-asst{margin-top:10px;}',
    '.chsh-asst .chsh-body>p:first-child{margin-top:0;}',
    '.chsh-body p{margin:0 0 10px;}',
    '.chsh-body h1,.chsh-body h2,.chsh-body h3,.chsh-body h4{margin:14px 0 8px;line-height:1.35;}',
    '.chsh-body h1{font-size:1.3em;}.chsh-body h2{font-size:1.18em;}.chsh-body h3{font-size:1.06em;}.chsh-body h4{font-size:1em;}',
    '.chsh-body ul,.chsh-body ol{margin:0 0 10px;padding-left:1.4em;}',
    '.chsh-body li{margin:2px 0;}',
    '.chsh-body blockquote{border-left:3px solid ' + th.border + ';padding:2px 12px;margin:0 0 10px;color:' + th.muted + ';}',
    '.chsh-body hr{border:none;border-top:1px solid ' + th.border + ';margin:12px 0;}',
    '.chsh-body a{color:' + th.accent + ';text-decoration:none;}',
    '.chsh-body code{background:' + th.codeBg + ';border:1px solid ' + th.border + ';border-radius:4px;padding:1px 5px;font-size:0.9em;',
    'font-family:ui-monospace,"SF Mono","Cascadia Code","JetBrains Mono",Consolas,"Noto Sans Mono CJK SC",monospace;}',
    '.chsh-body pre{background:' + th.codeBg + ';border:1px solid ' + th.border + ';border-radius:10px;padding:12px 14px;margin:0 0 10px;',
    'white-space:pre-wrap;font-size:0.86em;line-height:1.5;}',
    '.chsh-body pre code{background:none;border:none;padding:0;font-size:inherit;}',
    '.chsh-body table{border-collapse:collapse;width:100%;margin:0 0 10px;font-size:0.92em;}',
    '.chsh-body th,.chsh-body td{border:1px solid ' + th.border + ';padding:6px 9px;text-align:left;}',
    '.chsh-body th{background:' + th.card + ';}',
    '.chsh-tools{margin:8px 0 0;}',
    '.chsh-tool{display:inline-block;background:' + th.card + ';border:1px solid ' + th.border + ';border-radius:999px;',
    'padding:2px 9px;margin:2px 6px 2px 0;font-size:' + (fs * 0.74) + 'px;color:' + th.muted + ';}',
    '.chsh-ph{color:' + th.muted + ';border:1px dashed ' + th.border + ';border-radius:6px;padding:0 6px;font-size:0.85em;}',
    '.chsh-img{max-width:100%;height:auto;border-radius:8px;margin:6px 0;display:block;}',
    '.chsh-foot{margin-top:26px;padding-top:12px;border-top:1px solid ' + th.border + ';font-size:' + (fs * 0.72) + 'px;color:' + th.muted + ';}'
  ].join('')
}

// One turn → XHTML fragment (used by measurement, PNG and HTML export).
function turnXhtml (turn, opt, th) {
  let s = '<div class="chsh-turn" data-turn="' + turn.id + '">'
  if (turn.user && turn.user.text) {
    s += '<div class="chsh-user"><div class="chsh-who">👤' +
      (turn.user.ts ? '<span class="chsh-ts">' + fmtTs(turn.user.ts) + '</span>' : '') + '</div>' +
      '<div class="chsh-body">' + mdToXhtml(turn.user.text, { images: opt.images }) + '</div></div>'
  }
  for (const a of turn.asst) {
    s += '<div class="chsh-asst"><div class="chsh-who">🤖' +
      (a.ts ? '<span class="chsh-ts">' + fmtTs(a.ts) + '</span>' : '') + '</div>' +
      '<div class="chsh-body">' + mdToXhtml(a.text, { images: opt.images }) + '</div></div>'
  }
  if (opt.tools && turn.tools.length) {
    s += '<div class="chsh-tools">' + turn.tools.map(t =>
      '<span class="chsh-tool">🔧 ' + esc(t.name) + '</span>').join('') + '</div>'
  }
  return s + '</div>'
}

function svgWrap (bodyHtml, width, height, css, th) {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '">' +
    '<foreignObject width="100%" height="100%">' +
    '<div xmlns="http://www.w3.org/1999/xhtml"><style>' + css + '</style>' +
    '<div class="chsh-wrap" style="width:' + width + 'px;background:' + th.bg + ';">' + bodyHtml + '</div>' +
    '</div></foreignObject></svg>'
}

function slugTitle (s) {
  const t = String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim()
  return (t || 'conversation').slice(0, 48)
}

const PAGE_MAX = 7600 // CSS px per PNG page (x2 DPR stays under Chrome's 16384 cap)

function fragWithCss (turn, th, opt) {
  return turnXhtml(turn, { images: false, tools: opt.tools }, th)
}

function buildPages (turns, th, opt) {
  // Measure each turn's height offscreen, then chunk to <= PAGE_MAX.
  const holder = document.createElement('div')
  holder.className = 'chsh-wrap'
  holder.style.cssText = 'position:fixed;left:-20000px;top:0;width:' + opt.width + 'px;visibility:hidden;z-index:-1;'
  const style = document.createElement('style')
  style.textContent = exportCss(th, opt)
  document.documentElement.appendChild(style)
  document.documentElement.appendChild(holder)
  try {
    holder.innerHTML = '<div class="chsh-pad">' + turns.map(x => fragWithCss(x, th, opt)).join('') + '</div>'
    const nodes = Array.from(holder.querySelectorAll('.chsh-turn'))
    const heights = nodes.map(n => Math.ceil(n.getBoundingClientRect().height) + 22)
    const pages = []
    let cur = [], acc = 0
    turns.forEach((turn, k) => {
      const h = heights[k] || 200
      if (cur.length && acc + h > PAGE_MAX) { pages.push(cur); cur = []; acc = 0 }
      cur.push(turn); acc += h
    })
    if (cur.length) pages.push(cur)
    return pages
  } finally {
    holder.remove(); style.remove()
  }
}

function loadSvgImage (svg, width) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const to = setTimeout(() => reject(new Error('svg-render-timeout')), 15000)
    img.onload = () => { clearTimeout(to); resolve(img) }
    img.onerror = e => { clearTimeout(to); reject(new Error('svg-render-failed')) }
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  })
}

async function pageToPng (turns, th, opt) {
  const body = '<div class="chsh-pad">' + turns.map(x => fragWithCss(x, th, opt)).join('') +
    '<div class="chsh-foot">Hermes · ' + esc(fmtTs(Date.now() / 1000)) + '</div></div>'
  // one measurement pass for the exact page height, then rasterize
  const holder = document.createElement('div')
  holder.className = 'chsh-wrap'
  holder.style.cssText = 'position:fixed;left:-20000px;top:0;width:' + opt.width + 'px;visibility:hidden;'
  const style = document.createElement('style')
  style.textContent = exportCss(th, opt)
  document.documentElement.appendChild(style)
  document.documentElement.appendChild(holder)
  let height
  try { holder.innerHTML = body; height = Math.ceil(holder.getBoundingClientRect().height) } finally { holder.remove(); style.remove() }
  const svg = svgWrap(body, opt.width, height, exportCss(th, opt), th)
  const img = await loadSvgImage(svg, opt.width)
  const dpr = 2
  const canvas = document.createElement('canvas')
  canvas.width = opt.width * dpr
  canvas.height = height * dpr
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = th.bg
  ctx.fillRect(0, 0, opt.width, height)
  ctx.drawImage(img, 0, 0, opt.width, height)
  const blob = await new Promise(res => canvas.toBlob(res, 'image/png'))
  if (!blob) throw new Error('png-encode-failed')
  return { blob, height }
}
// ==== CORE END ====

// -- stores ------------------------------------------------------------------
const turnsAtom = atom([])
const stateAtom = atom({ loading: false, error: '', title: '', sid: '', total: 0 })
const selAtom = atom(null) // null = all selected; Set-arrays of turn ids otherwise
const optAtom = atom({ width: 880, scale: 1, tools: true, ts: true })

const t = (key, ...args) => ctxI18nRef && ctxI18nRef.t(key, ...args)
let ctxI18nRef = null

function selectedIds () {
  const sel = selAtom.get()
  if (!sel) return turnsAtom.get().map(x => x.id)
  return turnsAtom.get().filter(x => sel.has(x.id)).map(x => x.id)
}

// -- data ---------------------------------------------------------------------
function groupTurns (messages) {
  const turns = []
  let cur = null
  const open = () => { cur = { id: turns.length, user: null, asst: [], tools: [] }; turns.push(cur) }
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant' && m.role !== 'tool')) continue
    if (m.role === 'user') { open(); cur.user = { text: m.text || '', ts: m.timestamp }; continue }
    if (!cur) open()
    if (m.role === 'assistant') { if ((m.text || '').trim()) cur.asst.push({ text: m.text, ts: m.timestamp }) }
    else cur.tools.push({ name: m.name || 'tool', ctx: m.context || '' })
  }
  return turns.filter(x => x.user || x.asst.length)
}

async function fetchTurns () {
  const st = stateAtom.get()
  if (st.loading) return
  stateAtom.set({ ...st, loading: true, error: '' })
  try {
    const sid = host.state.focusedStoredSessionId.get() || host.state.activeSessionId.get()
    if (!sid) throw new Error('no-focused-session')
    let res = null, lastErr = null
    const tried = []
    for (const cand of [sid, host.state.activeSessionId.get(), host.state.focusedStoredSessionId.get()]) {
      if (!cand || tried.includes(cand)) continue
      tried.push(cand)
      try { res = await host.request('session.history', { session_id: cand }, 60000); break } catch (e) { lastErr = e }
    }
    if (!res) throw lastErr || new Error('session.history unavailable')
    const messages = (res && res.messages) || []
    turnsAtom.set(groupTurns(messages))
    let title = ''
    try {
      const list = await host.request('session.list', { limit: 200 })
      const rows = (list && (list.sessions || list.rows || list.list)) || []
      const hit = rows.find(r => r.session_id === sid || r.id === sid)
      if (hit) title = hit.title || hit.name || ''
    } catch (e) { /* title is cosmetic */ }
    selAtom.set(null)
    stateAtom.set({ loading: false, error: '', sid, title, total: messages.length })
  } catch (err) {
    stateAtom.set({ ...stateAtom.get(), loading: false, error: String((err && err.message) || err) })
    turnsAtom.set([])
  }
}

// -- export pipeline -----------------------------------------------------------
async function renderImages () {
  const ids = new Set(selectedIds())
  const turns = turnsAtom.get().filter(x => ids.has(x.id))
  if (!turns.length) throw new Error('nothing-selected')
  const th = snapshotTheme(document.documentElement)
  const opt = optAtom.get()
  const pages = buildPages(turns, th, opt)
  const out = []
  for (const pg of pages) out.push(await pageToPng(pg, th, opt))
  return out
}

function fileBase () {
  const st = stateAtom.get()
  const turns = turnsAtom.get()
  const firstUser = turns.find(x => x.user && x.user.text)
  return 'hermes-' + slugTitle(st.title || (firstUser && firstUser.text) || fmtTs(Date.now() / 1000)).replace(/\s+/g, '-')
}

function download (blob, name) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 4000)
}

async function doCopyPng () {
  try {
    const imgs = await renderImages()
    if (imgs.length > 1) { for (let k = 0; k < imgs.length; k++) download(imgs[k].blob, fileBase() + '-' + String(k + 1).padStart(2, '0') + '.png') }
    else await navigator.clipboard.write([new ClipboardItem({ 'image/png': imgs[0].blob })])
    haptic('success')
    host.notify({ kind: 'success', message: imgs.length > 1 ? t('multiPage') : t('copied') })
  } catch (err) { fail(err) }
}

async function doDownloadPng () {
  try {
    const imgs = await renderImages()
    for (let k = 0; k < imgs.length; k++) {
      download(imgs[k].blob, fileBase() + (imgs.length > 1 ? '-' + String(k + 1).padStart(2, '0') : '') + '.png')
    }
    haptic('success')
    host.notify({ kind: 'success', message: t('saved') })
  } catch (err) { fail(err) }
}

function exportHtml (opts) {
  const ids = new Set(selectedIds())
  const turns = turnsAtom.get().filter(x => ids.has(x.id))
  const th = snapshotTheme(document.documentElement)
  const opt = { ...optAtom.get(), images: true }
  const body = '<div class="chsh-wrap"><div class="chsh-pad">' +
    '<div class="chsh-title">' + esc(stateAtom.get().title || t('shareTitle')) + '</div>' +
    '<div class="chsh-meta">' + esc(fmtTs(Date.now() / 1000)) + ' · ' + turns.length + ' ' + t('turnsN') + '</div>' +
    turns.map(x => turnXhtml(x, { images: true, tools: opt.tools }, th)).join('') +
    '<div class="chsh-foot">Hermes</div></div></div>'
  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"/><title>' + esc(stateAtom.get().title || 'Hermes') +
    '</title><style>body{margin:0;background:' + th.bg + ';}' + exportCss(th, { ...opt, images: true }) +
    '.chsh-wrap img{max-width:100%;}.chsh-wrap .chsh-body{min-width:0;}</style></head><body>' + body + '</body></html>'
  return new Blob([html], { type: 'text/html;charset=utf-8' })
}

function exportMd () {
  const ids = new Set(selectedIds())
  const turns = turnsAtom.get().filter(x => ids.has(x.id))
  const opt = optAtom.get()
  let s = '# ' + (stateAtom.get().title || t('shareTitle')) + '\n\n_' + fmtTs(Date.now() / 1000) + '_\n\n'
  for (const turn of turns) {
    if (turn.user && turn.user.text) s += '## 👤 ' + (turn.user.ts ? fmtTs(turn.user.ts) + ' · ' : '') + 'User\n\n' + turn.user.text + '\n\n'
    for (const a of turn.asst) s += '### 🤖 ' + (a.ts ? fmtTs(a.ts) + ' · ' : '') + 'Assistant\n\n' + a.text + '\n\n'
    if (opt.tools && turn.tools.length) s += turn.tools.map(x => '- 🔧 `' + x.name + '`' + (x.ctx ? ' — ' + x.ctx : '')).join('\n') + '\n\n'
    s += '---\n\n'
  }
  return new Blob([s], { type: 'text/markdown;charset=utf-8' })
}

function doDownloadHtml () { try { download(exportHtml(), fileBase() + '.html'); host.notify({ kind: 'success', message: t('saved') }) } catch (err) { fail(err) } }
function doDownloadMd () { try { download(exportMd(), fileBase() + '.md'); host.notify({ kind: 'success', message: t('saved') }) } catch (err) { fail(err) } }

function fail (err) {
  const msg = String((err && err.message) || err)
  host.notify({ kind: 'error', message: t('exportFailed') + ': ' + msg })
}

// -- UI ------------------------------------------------------------------------
function TurnRow ({ turn, checked, onToggle }) {
  const t = usePluginI18n(PLUGIN_ID)
  const opt = useValue(optAtom)
  return jsxs('div', {
    className: 'flex gap-3 py-3 border-b border-(--border)',
    children: [
      jsx('input', {
        type: 'checkbox', className: 'mt-2 shrink-0 accent-(--accent)',
        checked, onChange: () => onToggle(turn.id)
      }),
      jsxs('div', { className: 'min-w-0 flex-1 flex flex-col gap-2', children: [
        turn.user && turn.user.text ? jsxs('div', { className: 'rounded-xl border border-(--border) bg-(--card) px-3 py-2', children: [
          jsxs('div', { className: 'text-xs text-(--muted-foreground) mb-1 flex gap-2', children: [
            jsx('span', { className: 'font-medium', children: t('labelUser') }),
            turn.user.ts ? jsx('span', { children: fmtTs(turn.user.ts) }) : null
          ] }),
          jsx(MessageTextContent, { text: turn.user.text })
        ] }) : null,
        turn.asst.map((a, k) => jsxs('div', { className: 'min-w-0', children: [
          jsxs('div', { className: 'text-xs text-(--muted-foreground) mb-1 mt-2 flex gap-2', children: [
            jsx('span', { className: 'font-medium', children: t('labelAssistant') }),
            a.ts ? jsx('span', { children: fmtTs(a.ts) }) : null
          ] }),
          jsx('div', { className: 'min-w-0 overflow-hidden', children: jsx(MessageTextContent, { text: a.text }) })
        ] }, k)),
        opt.tools && turn.tools.length ? jsx('div', { className: 'flex flex-wrap gap-1 pt-1', children: turn.tools.map((x, k) =>
          jsx('span', { className: 'text-[11px] px-2 py-0.5 rounded-full border border-(--border) text-(--muted-foreground)', children: '🔧 ' + x.name }, k)) }) : null
      ] })
    ]
  })
}

function Toolbar () {
  const t = usePluginI18n(PLUGIN_ID)
  const opt = useValue(optAtom)
  const st = useValue(stateAtom)
  const turns = useValue(turnsAtom)
  const sel = useValue(selAtom)
  const selected = sel ? turns.filter(x => sel.has(x.id)) : turns
  const setOpt = patch => optAtom.set({ ...optAtom.get(), ...patch })
  const setSel = ids => selAtom.set(ids == null ? null : new Set(ids))
  return jsxs('div', { className: 'flex flex-wrap items-center gap-2 px-4 py-2 border-b border-(--border) sticky top-0 bg-(--background) z-10', children: [
    jsx('span', { className: 'text-sm text-(--muted-foreground)', children: t('selCount', selected.length, turns.length) }),
    jsx(Button, { size: 'xs', variant: 'text', onClick: () => setSel(null), children: t('selectAll') }),
    jsx(Button, { size: 'xs', variant: 'text', onClick: () => setSel([]), children: t('clearSel') }),
    jsx(Button, { size: 'xs', variant: 'text', onClick: () => setSel(turns.filter(x => !sel || !sel.has(x.id)).map(x => x.id)), children: t('invertSel') }),
    jsx('span', { className: 'mx-2 opacity-30', children: '│' }),
    jsx('select', {
      className: 'text-xs rounded-md border border-(--border) bg-transparent px-1.5 py-1 text-(--foreground)',
      value: String(opt.width), onChange: e => setOpt({ width: Number(e.target.value) }),
      children: [680, 880, 1080].map(w => jsx('option', { value: String(w), children: t('widthN', w) }, w))
    }),
    jsx('select', {
      className: 'text-xs rounded-md border border-(--border) bg-transparent px-1.5 py-1 text-(--foreground)',
      value: String(opt.scale), onChange: e => setOpt({ scale: Number(e.target.value) }),
      children: [0.85, 1, 1.2].map(s => jsx('option', { value: String(s), children: t('fontN', Math.round(15 * s)) }, s))
    }),
    jsx(Button, {
      size: 'xs', variant: opt.tools ? 'secondary' : 'text',
      onClick: () => setOpt({ tools: !opt.tools }), children: t('toggleTools')
    }),
    jsx('span', { className: 'flex-1' }),
    jsx(Button, { size: 'sm', onClick: () => void doDownloadMd(), children: 'Markdown' }),
    jsx(Button, { size: 'sm', onClick: () => void doDownloadHtml(), children: 'HTML' }),
    jsx(Button, { size: 'sm', onClick: () => void doDownloadPng(), children: t('btnPng') }),
    jsx(Tip, { label: t('copyHint'), children: jsx(Button, { size: 'sm', variant: 'secondary', onClick: () => void doCopyPng(), children: t('btnCopyPng') }) })
  ] })
}

function SharePage () {
  const t = usePluginI18n(PLUGIN_ID)
  const st = useValue(stateAtom)
  const turns = useValue(turnsAtom)
  const sel = useValue(selAtom)

  useEffect(() => {
    if (!stateAtom.get().sid && !stateAtom.get().loading) void fetchTurns()
  }, [])

  const toggle = id => {
    const cur = selAtom.get()
    const all = turnsAtom.get().map(x => x.id)
    const set = new Set(cur == null ? all : Array.from(cur))
    if (set.has(id)) set.delete(id); else set.add(id)
    selAtom.set(set)
  }

  return jsxs('div', { className: 'flex flex-col h-full min-h-0', children: [
    jsxs('div', { className: 'flex items-center gap-2 px-4 pt-3 pb-1', children: [
      jsx('div', { className: 'font-medium text-sm', children: st.title || t('shareTitle') }),
      st.sid ? jsx('span', { className: 'text-xs text-(--muted-foreground)', children: st.sid.slice(0, 8) + '…' }) : null,
      jsx('span', { className: 'flex-1' }),
      st.loading
        ? jsx(GlyphSpinner, { className: 'text-(--muted-foreground)' })
        : jsx(Button, { size: 'xs', variant: 'text', onClick: () => void fetchTurns(), children: t('refresh') })
    ] }),
    jsx(Toolbar, {}),
    st.error ? jsxs('div', { className: 'p-6 flex flex-col items-start gap-3', children: [
      jsx(EmptyState, { title: t('loadFail'), description: st.error === 'no-focused-session' ? t('needSession') : st.error }),
      jsx(Button, { size: 'sm', onClick: () => void fetchTurns(), children: t('retry') })
    ] }) : !turns.length && !st.loading ? jsxs('div', { className: 'p-6 flex flex-col items-start gap-3', children: [
      jsx(EmptyState, { title: t('empty') }),
      jsx(Button, { size: 'sm', onClick: () => void fetchTurns(), children: t('refresh') })
    ] }) : jsx('div', { className: 'flex-1 min-h-0 overflow-y-auto px-4', children: jsx('div', { className: 'mx-auto w-full max-w-[880px]', children:
      turns.map(turn => jsx(TurnRow, {
        turn, checked: sel == null ? true : sel.has(turn.id), onToggle: toggle
      }, turn.id)) }) })
  ] })
}

// -- registration ---------------------------------------------------------------
const STRINGS = {
  en: {
    navLabel: 'Share chat',
    shareTitle: 'Share conversation',
    refresh: 'Refresh', retry: 'Retry',
    loadFail: 'Could not load this conversation',
    needSession: 'Open a chat conversation first, then come back to share it.',
    empty: 'No turns in this session yet',
    labelUser: 'You', labelAssistant: 'Assistant',
    selectAll: 'All', clearSel: 'None', invertSel: 'Invert',
    selCount: (n, m) => n + ' / ' + m + ' turns',
    widthN: w => 'width ' + w + 'px',
    fontN: px => 'font ' + px + 'px',
    toggleTools: 'tool calls',
    btnPng: 'Download PNG', btnCopyPng: 'Copy image',
    copyHint: 'Copy the long screenshot to the clipboard (multi-page conversations download instead)',
    copied: 'Long image copied to clipboard',
    multiPage: 'Conversation spans several images — saved as files',
    saved: 'Saved', exportFailed: 'Export failed',
    turnsN: 'turns'
  },
  'zh': {
    navLabel: '分享对话',
    shareTitle: '分享对话',
    refresh: '刷新', retry: '重试',
    loadFail: '无法读取这个会话',
    needSession: '先打开一个对话，再来这里分享。',
    empty: '这个会话还没有内容',
    labelUser: '我', labelAssistant: '助手',
    selectAll: '全选', clearSel: '清空', invertSel: '反选',
    selCount: (n, m) => n + ' / ' + m + ' 轮',
    widthN: w => '宽 ' + w + 'px',
    fontN: px => '字号 ' + px + 'px',
    toggleTools: '工具调用',
    btnPng: '下载长图', btnCopyPng: '复制图片',
    copyHint: '把长截图复制到剪贴板（多页时改为下载文件）',
    copied: '长截图已复制到剪贴板',
    multiPage: '内容跨多页，已作为图片文件保存',
    saved: '已保存', exportFailed: '导出失败',
    turnsN: '轮'
  }
}

export default {
  id: PLUGIN_ID,
  name: 'Chat Share',
  description: 'Share conversations as long PNG screenshots, HTML, or Markdown — with per-turn selection.',
  register (ctx) {
    ctxI18nRef = ctx.i18n
    ctx.i18n.register(STRINGS)
    const contribute = () => ctx.registerMany([
      { id: 'page', area: ROUTES_AREA, data: { path: ROUTE }, render: () => jsx(SharePage, {}) },
      { id: 'nav', area: SIDEBAR_NAV_AREA, data: { path: ROUTE, label: ctx.i18n.t('navLabel'), codicon: 'share' } },
      {
        id: 'open', area: PALETTE_AREA,
        data: { id: 'chat-share.open', label: ctx.i18n.t('shareTitle'), keywords: ['share', 'export', 'png', 'screenshot', '分享', '截图', '长图'], run: () => host.navigate(ROUTE) }
      },
      {
        id: 'copy', area: PALETTE_AREA,
        data: { id: 'chat-share.copy', label: ctx.i18n.t('btnCopyPng'), keywords: ['clipboard', 'image', '剪贴板'], run: () => void doCopyPng() }
      },
      {
        id: 'png', area: PALETTE_AREA,
        data: { id: 'chat-share.png', label: ctx.i18n.t('btnPng'), keywords: ['download', 'long image', '长截图'], run: () => void doDownloadPng() }
      },
      {
        id: 'open-kb', area: KEYBINDS_AREA,
        data: { id: 'chat-share.open', label: ctx.i18n.t('shareTitle'), category: 'Chat Share', defaults: ['mod+shift+h'], run: () => host.navigate(ROUTE) }
      }
    ])
    let dispose = contribute()
    ctx.i18n.onLocaleChange(() => { dispose(); dispose = contribute() })
  }
}
