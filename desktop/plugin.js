// hermes-chat-share — share Hermes conversations as long PNG images / HTML / Markdown
// (a Hermes Desktop counterpart to dsh-share). Single-file disk plugin.
import {
  host, haptic, useValue, atom,
  ROUTES_AREA, SIDEBAR_NAV_AREA, PALETTE_AREA, KEYBINDS_AREA, TITLEBAR_AREAS,
  Button, EmptyState, GlyphSpinner, MessageTextContent, Codicon,
  usePluginI18n
} from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { useEffect, useState } from 'react'

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
      const lang = fence[2] || ''
      out.push('<pre><code' + (lang ? ' class="lang-' + esc(lang) + '"' : '') + '>' +
        highlightCode(buf.join('\n'), lang) + '</code></pre>')
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
function snapshotTheme () {
  // CSS custom props on :root are declared as unresolved chains
  // (`--background: var(--dt-background)`), so getPropertyValue returns the
  // token, not a color. Probe REAL elements with inline var() styles and let
  // the browser resolve the chain to a computed rgba().
  const probe = css => {
    const d = document.createElement('div')
    d.style.cssText = 'position:fixed;left:-9999px;top:0;width:8px;height:8px;border-style:solid;border-width:1px;' + css
    document.body.appendChild(d)
    const cs = getComputedStyle(d)
    const r = { bg: cs.backgroundColor, fg: cs.color, bd: cs.borderTopColor }
    d.remove()
    return r
  }
  const page = probe('background:var(--background);color:var(--foreground);border-color:var(--border)')
  const cardP = probe('background:var(--card);border-color:var(--border)')
  const accentP = probe('background:var(--accent)')
  const mutedP = probe('color:var(--muted-foreground)')
  const codeP = probe('background:var(--muted)')
  const resolve = (c, fb, base) => {
    const p = parseCssRgba(c)
    if (!p || p.a === 0) return fb
    return solidColor(c, base)
  }
  const bg = resolve(page.bg, '#ffffff', '#ffffff')
  const card = resolve(cardP.bg, bg, bg)
  return {
    bg,
    fg: resolve(page.fg, '#111111', bg),
    card,
    border: resolve(page.bd, 'rgba(128,128,128,0.35)', bg),
    accent: resolve(accentP.bg, bg, bg),
    muted: resolve(mutedP.fg, '#888888', bg),
    codeBg: resolve(codeP.bg, card, card)
  }
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
  ]
  // Syntax-highlight token colors (only present on fixed palettes; auto theme
  // exports keep plain code, matching the pre-highlight look).
  if (th.tok) {
    css.push(
      '.chsh-body .tok-kw{color:' + th.tok.kw + ';}',
      '.chsh-body .tok-str{color:' + th.tok.str + ';}',
      '.chsh-body .tok-com{color:' + th.tok.com + ';font-style:italic;}',
      '.chsh-body .tok-num{color:' + th.tok.num + ';}',
      '.chsh-body .tok-fn{color:' + th.tok.fn + ';}'
    )
  }
  css.push('') // trailing newline-free join, keeps existing .join('') shape
  return css.join('')
}

// One turn → XHTML fragment (used by measurement, PNG and HTML export).
function turnXhtml (turn, opt, th) {
  let s = '<div class="chsh-turn" data-turn="' + turn.id + '">'
  if (turn.user && turn.user.text) {
    s += '<div class="chsh-user"><div class="chsh-who">👤' +
      (turn.user.ts ? '<span class="chsh-ts">' + fmtTs(turn.user.ts) + '</span>' : '') + '</div>' +
      '<div class="chsh-body">' + mdToXhtml(turn.user.text, { images: opt.images }) + '</div></div>'
  }
  // full === false → keep only the final assistant reply, drop tool chips
  const assts = opt.full === false && turn.asst.length ? [turn.asst[turn.asst.length - 1]] : turn.asst
  for (const a of assts) {
    s += '<div class="chsh-asst"><div class="chsh-who">🤖' +
      (a.ts ? '<span class="chsh-ts">' + fmtTs(a.ts) + '</span>' : '') + '</div>' +
      '<div class="chsh-body">' + mdToXhtml(a.text, { images: opt.images }) + '</div></div>'
  }
  if (opt.tools && opt.full !== false && turn.tools.length) {
    s += '<div class="chsh-tools">' + turn.tools.map(t =>
      '<span class="chsh-tool">🔧 ' + esc(t.name) + '</span>').join('') + '</div>'
  }
  return s + '</div>'
}

// One turn → JSON-safe object. Honors the same share-scope rules as the other
// exports: full === false keeps only the final assistant reply, tools=false
// drops tool calls. Pure so it can be unit-tested from the extracted CORE.
function turnJson (turn, opt) {
  const assts = opt.full === false ? turn.asst.slice(-1) : turn.asst
  return {
    id: turn.id,
    user: turn.user ? { text: turn.user.text, ts: turn.user.ts || null } : null,
    assistant: assts.map(a => ({ text: a.text, ts: a.ts || null })),
    tools: (opt.tools && opt.full !== false)
      ? turn.tools.map(x => ({ name: x.name, context: x.ctx || '' }))
      : []
  }
}

function exportJson (turns, meta, title, opt) {
  const payload = {
    title: title || '',
    exportedAt: new Date().toISOString(),
    meta: opt.meta === false ? null : (buildMetaLine(meta) || null),
    shareFull: opt.full !== false,
    includeTools: !!(opt.tools && opt.full !== false),
    turns: turns.map(x => turnJson(x, opt))
  }
  return JSON.stringify(payload, null, 2)
}

// -- syntax highlighting (dependency-free, conservative) ----------------------
// Tokenizes a small set of common languages into four token classes. Emits
// XHTML spans (.tok-kw/.tok-str/.tok-com/.tok-num) with all content escaped.
// Unknown / missing languages fall back to plain esc() — never worse than the
// pre-highlight behavior. Oversized blocks skip highlighting so the SVG
// foreignObject rasterizer (15s timeout) can't be pushed over the edge.
const HL_MAX_LEN = 10240

const HL_LANGS = {
  js: {
    lineComment: ['//'], blockComment: [['/*', '*/']],
    kw: /\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|super|this|typeof|instanceof|in|of|try|catch|finally|throw|async|await|yield|import|from|export|default|delete|void|null|undefined|true|false|static|get|set|interface|type|enum|implements|readonly|public|private|protected|namespace|declare|as|satisfies|keyof)\b/g,
    num: /\b(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g
  },
  py: {
    lineComment: ['#'],
    kw: /\b(?:def|return|if|elif|else|for|while|break|continue|class|import|from|as|with|try|except|finally|raise|lambda|pass|global|nonlocal|assert|yield|del|in|is|not|and|or|None|True|False|async|await|self|match|case)\b/g,
    num: /\b(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g
  },
  sh: {
    lineComment: ['#'],
    kw: /\b(?:if|then|else|elif|fi|for|while|do|done|case|esac|function|return|local|export|source|set|unset|shift|exit|echo|cd|read)\b/g,
    num: /\b\d+\b/g
  },
  css: {
    lineComment: [], blockComment: [['/*', '*/']],
    kw: /(?:^|[\s{;])(@[\w-]+)(?=\s|{|:)/g,
    num: /-?\b\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms|deg|fr)?\b/g
  }
}
// alias map → canonical language key
const HL_ALIAS = {
  javascript: 'js', jsx: 'js', mjs: 'js', cjs: 'js', node: 'js',
  ts: 'js', typescript: 'js', tsx: 'js',
  python: 'py', py3: 'py', python3: 'py',
  bash: 'sh', shell: 'sh', zsh: 'sh', console: 'sh',
  json: null, // JSON handled separately
  html: null, xml: null, // markup handled separately
  stylesheet: 'css'
}

function hlEscape (s) { return esc(s) }

// Split source into [comment, string, rest] segments preserving order; the
// caller highlights keywords/numbers only inside `rest`.
function hlSegment (code, langKey) {
  const spec = HL_LANGS[langKey]
  const segs = []
  let i = 0
  const n = code.length
  let buf = ''
  const flush = () => { if (buf) { segs.push({ kind: 'rest', text: buf }); buf = '' } }
  while (i < n) {
    let matched = false
    // block comments
    for (const [open, close] of (spec.blockComment || [])) {
      if (code.startsWith(open, i)) {
        flush()
        const end = code.indexOf(close, i + open.length)
        const stop = end === -1 ? n : end + close.length
        segs.push({ kind: 'com', text: code.slice(i, stop) })
        i = stop; matched = true; break
      }
    }
    if (matched) continue
    // line comments
    let lc = null
    for (const tok of (spec.lineComment || [])) if (code.startsWith(tok, i)) { lc = tok; break }
    if (lc) {
      flush()
      let end = code.indexOf('\n', i)
      if (end === -1) end = n
      segs.push({ kind: 'com', text: code.slice(i, end) })
      i = end; continue
    }
    // strings: '…"…"…' with backslash escapes
    const ch = code[i]
    if (ch === '"' || ch === "'" || (ch === '`' && langKey === 'js')) {
      flush()
      let j = i + 1
      while (j < n) {
        if (code[j] === '\\') { j += 2; continue }
        if (code[j] === ch) { j++; break }
        if (ch !== '`' && code[j] === '\n') break // unterminated single-line string
        j++
      }
      segs.push({ kind: 'str', text: code.slice(i, j) })
      i = j; continue
    }
    buf += ch; i++
  }
  flush()
  return segs
}

// Highlight one `rest` segment: keywords first, then numbers — numbers must
// not re-match inside already-emitted spans, so each pass splices the text.
function hlRest (text, spec) {
  let out = [{ hl: null, text }]
  const apply = (re, cls) => {
    const next = []
    for (const part of out) {
      if (part.hl) { next.push(part); continue }
      let last = 0
      const s = part.text
      re.lastIndex = 0
      let m
      while ((m = re.exec(s))) {
        if (m.index > last) next.push({ hl: null, text: s.slice(last, m.index) })
        next.push({ hl: cls, text: m[0] })
        last = m.index + m[0].length
        if (m[0].length === 0) re.lastIndex++
      }
      if (last < s.length) next.push({ hl: null, text: s.slice(last) })
    }
    out = next
  }
  apply(spec.kw, 'tok-kw')
  apply(spec.num, 'tok-num')
  return out
}

function highlightCode (code, lang) {
  const raw = String(code == null ? '' : code)
  const key = String(lang || '').trim().toLowerCase()
  const canonical = Object.prototype.hasOwnProperty.call(HL_ALIAS, key) ? HL_ALIAS[key] : (HL_LANGS[key] ? key : undefined)
  if (raw.length > HL_MAX_LEN) return esc(raw)
  if (key === 'json') {
    // JSON: strings/numbers via a strict pass over the whole text.
    const out = []
    const re = /"(?:[^"\\]|\\.)*"\s*:|"(?:[^"\\]|\\.)*"|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b|\b(?:true|false|null)\b/g
    let last = 0, m
    while ((m = re.exec(raw))) {
      if (m.index > last) out.push(esc(raw.slice(last, m.index)))
      const t = m[0]
      const cls = t.startsWith('"') ? (t.trimEnd().endsWith(':') ? 'tok-fn' : 'tok-str') : (m[0] === 'true' || m[0] === 'false' || m[0] === 'null' ? 'tok-kw' : 'tok-num')
      out.push('<span class="' + cls + '">' + esc(t) + '</span>')
      last = m.index + t.length
    }
    out.push(esc(raw.slice(last)))
    return out.join('')
  }
  if (key === 'html' || key === 'xml') {
    // Tags and comments only — attributes left plain (no HTML parser here).
    const out = []
    const re = /<!--[\s\S]*?-->|<\/?[\w:-]+(?:\s+[^<>]*?)?\/?>/g
    let last = 0, m
    while ((m = re.exec(raw))) {
      if (m.index > last) out.push(esc(raw.slice(last, m.index)))
      const t = m[0]
      const cls = t.startsWith('<!--') ? 'tok-com' : 'tok-kw'
      out.push('<span class="' + cls + '">' + esc(t) + '</span>')
      last = m.index + t.length
    }
    out.push(esc(raw.slice(last)))
    return out.join('')
  }
  if (!canonical) return esc(raw)
  const spec = HL_LANGS[canonical]
  const segs = hlSegment(raw, canonical)
  const out = []
  for (const seg of segs) {
    if (seg.kind === 'com') out.push('<span class="tok-com">' + esc(seg.text) + '</span>')
    else if (seg.kind === 'str') out.push('<span class="tok-str">' + esc(seg.text) + '</span>')
    else for (const part of hlRest(seg.text, spec)) {
      out.push(part.hl ? '<span class="' + part.hl + '">' + esc(part.text) + '</span>' : esc(part.text))
    }
  }
  return out.join('')
}

// Range selection for the gutter drag. Pure so it can be unit-tested.
// currentSel: null (= all selected) or a Set of turn ids. Returns a new Set
// covering turns[fromId..toId] inclusive; fromId > toId is normalized.
function applyRangeSelection (currentSel, allIds, fromId, toId) {
  const lo = Math.min(fromId, toId)
  const hi = Math.max(fromId, toId)
  return new Set(allIds.filter(id => id >= lo && id <= hi))
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
  return turnXhtml(turn, { images: false, tools: opt.tools, full: opt.full }, th)
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
  const headHtml = (opt.title ? '<div class="chsh-title">' + esc(opt.title) + '</div>' : '') +
    (opt.metaLine ? '<div class="chsh-meta">' + esc(opt.metaLine) + '</div>' : '')
  const body = '<div class="chsh-pad">' + headHtml + turns.map(x => fragWithCss(x, th, opt)).join('') +
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
// -- session meta (model / thinking level / cache / speed / Hermes version) ---
// Pure helpers: normalizeSessionInfo maps the `session.info` RPC payload,
// buildMetaLine renders one English line for page + exports. Fields the gateway
// omits (archived session, no latency data) are omitted here too — never faked.
function normalizeSessionInfo (info) {
  if (!info || typeof info !== 'object') return null
  const u = info.usage || {}
  return {
    model: String(info.model || u.model || ''), provider: String(info.provider || ''),
    effort: String(info.reasoning_effort_wire || info.reasoning_effort || ''),
    cacheHitPct: Number.isFinite(u.cache_hit_pct) ? u.cache_hit_pct : null,
    avgTps: Number.isFinite(u.avg_tps) ? u.avg_tps : null,
    totalTokens: Number.isFinite(u.total) ? u.total : null,
    version: String(info.version || ''), releaseDate: String(info.release_date || '')
  }
}

function buildMetaLine (m) {
  if (!m) return ''
  const b = []
  if (m.model) b.push(m.provider ? m.model + ' @ ' + m.provider : m.model)
  if (m.effort && m.effort !== 'none') b.push('thinking: ' + m.effort)
  if (m.cacheHitPct != null) b.push('cache hit: ' + m.cacheHitPct + '%')
  if (m.avgTps != null) b.push(m.avgTps + ' tok/s')
  if (m.totalTokens) b.push(m.totalTokens.toLocaleString('en-US') + ' tokens')
  if (m.version) b.push('Hermes ' + m.version)
  return b.join('  ·  ')
}

// Flatten a possibly-translucent CSS color over an opaque base. The macOS app
// theme tokens (--card, --background) can carry alpha for window vibrancy;
// a dialog over page text needs solid paint, so composite first.
function parseCssRgba (s) {
  const str = String(s == null ? '' : s).trim()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(str)
  if (hex) {
    let h = hex[1]
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 }
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(str)
  if (rgb) {
    const a = rgb[4] == null ? 1 : (String(rgb[4]).endsWith('%') ? parseFloat(rgb[4]) / 100 : parseFloat(rgb[4]))
    return { r: +rgb[1], g: +rgb[2], b: +rgb[3], a: Number.isFinite(a) ? Math.min(1, Math.max(0, a)) : 1 }
  }
  return null
}

function solidColor (color, over) {
  const c = parseCssRgba(color)
  const o = parseCssRgba(over)
  if (!c) return o ? color : '#ffffff'
  if (c.a >= 1 || !o) return 'rgb(' + Math.round(c.r) + ',' + Math.round(c.g) + ',' + Math.round(c.b) + ')'
  const m = (x, y) => Math.round(x * c.a + y * (1 - c.a))
  return 'rgb(' + m(c.r, o.r) + ',' + m(c.g, o.g) + ',' + m(c.b, o.b) + ')'
}

// Fixed export palettes for theme override. Structure mirrors snapshotTheme();
// hand-calibrated for readability when the app theme itself is unusable (e.g.
// dark app + light share for group chats). Exported code-token colors are
// carried here too so PNG, HTML and PDF stay consistent in both modes.
function fixedThemePalette (mode) {
  const light = {
    bg: '#ffffff', fg: '#1a1a1a', card: '#f6f6f6', border: 'rgba(0,0,0,0.14)',
    accent: '#2563eb', muted: '#6b7280', codeBg: '#f3f4f6',
    tok: { kw: '#7c3aed', str: '#16a34a', com: '#9ca3af', num: '#ea580c', fn: '#2563eb' }
  }
  const dark = {
    bg: '#1e1f22', fg: '#e6e6e6', card: '#2a2b2f', border: 'rgba(255,255,255,0.16)',
    accent: '#60a5fa', muted: '#9ca3af', codeBg: '#26272b',
    tok: { kw: '#c4b5fd', str: '#86efac', com: '#6b7280', num: '#fdba74', fn: '#93c5fd' }
  }
  return mode === 'dark' ? dark : light
}

// Theme resolution for exports: 'auto' snapshots the live app theme (no tok —
// token colors are only provided by fixed palettes), fixed modes return the
// hand-calibrated palette. All export paths must go through this.
function resolveTheme (mode, liveTheme) {
  if (mode === 'light' || mode === 'dark') return fixedThemePalette(mode)
  return liveTheme || fixedThemePalette('light')
}

function isDarkColor (color) {
  const c = parseCssRgba(color)
  if (!c) return false
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b < 140
}

// Merge PNG pages into one tall image. Chromium canvas caps: side <= 65535,
// area <= 268,435,456 px2. Returns null when over cap (caller falls back to
// page-by-page downloads) — one download always beats three blocked ones,
// because Electron silently drops every auto-download after the first.
async function stitchPngs (blobs) {
  const urls = []
  try {
    const imgs = []
    for (const b of blobs) {
      const u = URL.createObjectURL(b); urls.push(u)
      const im = await new Promise((res, rej) => {
        const i = new Image()
        i.onload = () => res(i)
        i.onerror = () => rej(new Error('page-decode-failed'))
        i.src = u
      })
      imgs.push(im)
    }
    const W = imgs[0].width
    const H = imgs.reduce((s, i) => s + i.height, 0)
    if (H > 65500 || W * H > 268000000) return null
    const c = document.createElement('canvas')
    c.width = W; c.height = H
    const g = c.getContext('2d')
    let y = 0
    for (const i of imgs) { g.drawImage(i, 0, y); y += i.height }
    return await new Promise(res => c.toBlob(res, 'image/png'))
  } finally { urls.forEach(u => URL.revokeObjectURL(u)) }
}
// ==== CORE END ====

// -- stores ------------------------------------------------------------------
const turnsAtom = atom([])
const stateAtom = atom({ loading: false, error: '', title: '', sid: '', total: 0 })
const metaAtom = atom(null)
const selAtom = atom(null) // null = all selected; Set-arrays of turn ids otherwise
const expAtom = atom(new Set()) // turn ids expanded (showing middle replies + tools) in the picker UI
const qAtom = atom('') // search query
const navAtom = atom({ ids: [], at: -1 }) // search hits (turn ids) + current position
const activeAtom = atom(null) // turn id highlighted by search/gutter jump
const askAtom = atom(null) // { blobs: Blob[], reason: string } — copy failed/impossible, ask the user
const optAtom = atom({ width: 880, scale: 1, tools: true, ts: true, full: true, theme: 'auto', meta: true })
const PrefsKey = 'hermes-chat-share:prefs'

// Preference persistence. Silent no-op when localStorage is unavailable
// (policy-cleared storage must never break the export features).
function loadPrefs () {
  try {
    const raw = localStorage.getItem(PrefsKey)
    if (!raw) return
    const p = JSON.parse(raw)
    const cur = optAtom.get()
    const next = { ...cur }
    for (const k of ['width', 'scale', 'tools', 'full', 'theme', 'meta']) {
      if (p[k] !== undefined) next[k] = p[k]
    }
    // Guard against a stale/poisoned store: only accept known enum values.
    if (!['auto', 'light', 'dark'].includes(next.theme)) next.theme = 'auto'
    if (![680, 880, 1080].includes(next.width)) next.width = 880
    if (![0.85, 1, 1.2].includes(next.scale)) next.scale = 1
    optAtom.set(next)
  } catch (e) { /* corrupt or blocked storage — keep defaults */ }
}

function savePrefs () {
  try {
    const { width, scale, tools, full, theme, meta } = optAtom.get()
    localStorage.setItem(PrefsKey, JSON.stringify({ width, scale, tools, full, theme, meta }))
  } catch (e) { /* storage unavailable — settings just don't persist */ }
}

// Resolved theme for the current export, honoring the override. All export
// paths call this instead of snapshotTheme directly.
function exportTheme () {
  const mode = optAtom.get().theme || 'auto'
  return mode === 'auto' ? snapshotTheme(document.documentElement) : fixedThemePalette(mode)
}

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

async function fetchTurnsFor (sid) {
  if (!sid) return
  const st = stateAtom.get()
  if (st.loading && st.sid === sid) return
  stateAtom.set({ ...st, loading: true, error: '' })
  try {
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
    let meta = null
    try {
      meta = normalizeSessionInfo(await host.request('session.info', { session_id: tried[tried.length - 1] }, 30000))
    } catch (e) { /* archived / compute-host sessions may have no live info — meta line just shrinks */ }
    metaAtom.set(meta)
    let title = ''
    try {
      const list = await host.request('session.list', { limit: 200 })
      const rows = (list && (list.sessions || list.rows || list.list)) || []
      const hit = rows.find(r => r.session_id === sid || r.id === sid)
      if (hit) title = hit.title || hit.name || ''
    } catch (e) { /* title is cosmetic */ }
    selAtom.set(null)
    expAtom.set(new Set()); qAtom.set(''); navAtom.set({ ids: [], at: -1 }); activeAtom.set(null); rowEls.clear()
    stateAtom.set({ loading: false, error: '', sid, title, total: messages.length })
  } catch (err) {
    stateAtom.set({ ...stateAtom.get(), loading: false, error: String((err && err.message) || err) })
    turnsAtom.set([])
  }
}

function fetchTurns () {
  const sid = host.state.focusedStoredSessionId.get() || host.state.activeSessionId.get()
  if (!sid) { stateAtom.set({ loading: false, error: 'no-focused-session', title: '', sid: '', total: 0 }); return }
  return fetchTurnsFor(sid)
}

// -- export pipeline -----------------------------------------------------------
async function renderImages () {
  const ids = new Set(selectedIds())
  const turns = turnsAtom.get().filter(x => ids.has(x.id))
  if (!turns.length) throw new Error('nothing-selected')
  const th = exportTheme()
  const opt = optAtom.get()
  // The first PNG page carries the title + session meta header (~50px). The
  // chunking pass does not know about it; PAGE_MAX leaves >3500px of headroom
  // under Chrome's 16384 device-px cap, so the extra line cannot overflow it.
  const ml = opt.meta === false ? '' : buildMetaLine(metaAtom.get())
  const pages = buildPages(turns, th, opt)
  const out = []
  for (let k = 0; k < pages.length; k++) {
    out.push(await pageToPng(pages[k], th, k === 0 ? { ...opt, title: stateAtom.get().title, metaLine: ml } : opt))
  }
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

// Fallback paths for copy-image. Hermes Electron denies the async clipboard
// write (clipboard-sanitized-write is granted only to Skills Hub origins,
// electron/main.ts installMediaPermissions), so navigator.clipboard.write
// always throws NotAllowedError here. The selection-copy path below is a
// best-effort: the pasteboard gets text/html carrying the image as base64
// (renders in rich targets) but no native bitmap flavor — right-click
// "Copy image" on the preview is the guaranteed bitmap route.
function blobToDataURL (blob) {
  return new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(f.result); f.onerror = () => rej(new Error('blob-read-failed')); f.readAsDataURL(blob) })
}

async function copyBlobToClipboard (blob) {
  const stages = []
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    return { via: 'api', stages }
  } catch { stages.push('api:denied-by-policy') }
  // Selection copy. Chromium's selection archiver does NOT embed blob:/file:
  // image bytes into the pasteboard (targets get a broken-image placeholder);
  // a data: URL makes the HTML payload itself carry the base64 image so rich
  // paste targets (WPS, Word, WeChat) can render it.
  let src
  try { src = await blobToDataURL(blob) } catch { src = URL.createObjectURL(blob) }
  const box = document.createElement('div')
  box.contentEditable = 'true'
  box.style.cssText = 'position:fixed;left:-99999px;top:0;user-select:text;-webkit-user-select:text'
  const img = document.createElement('img')
  img.src = src
  await new Promise(r => { img.onload = r; img.onerror = r })
  box.appendChild(img)
  document.body.appendChild(box)
  const sel = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(box)
  sel.removeAllRanges(); sel.addRange(range)
  let ok = false
  try { ok = document.execCommand('copy') } catch (e) { stages.push('exec:throw(' + e.message + ')') }
  sel.removeAllRanges(); box.remove()
  if (src.startsWith('blob:') || src.startsWith('http')) URL.revokeObjectURL(src)
  if (ok) stages.push('exec:true')
  else stages.push('exec:false')
  return { via: ok ? 'selection' : null, stages }
}

// One download path for every PNG save. Multi-page exports are merged into a
// single tall PNG when the canvas caps allow; Electron silently drops every
// auto-download after the first, so page-by-page is only the last resort.
async function saveImages (blobs) {
  const base = fileBase()
  if (blobs.length === 1) { download(blobs[0], base + '.png'); return 1 }
  let stitched = null
  try { stitched = await stitchPngs(blobs) } catch (e) { /* decode failed — fall through */ }
  if (stitched) { download(stitched, base + '.png'); return 1 }
  for (let k = 0; k < blobs.length; k++) {
    download(blobs[k], base + '-' + String(k + 1).padStart(2, '0') + '.png')
    await new Promise(r => setTimeout(r, 600))
  }
  return blobs.length
}

async function doCopyPng () {
  try {
    const imgs = await renderImages()
    if (imgs.length > 1) {
      // Clipboard holds one image; a multi-page export cannot be copied whole.
      // Don't decide for the user — explain and offer download vs cancel.
      askAtom.set({ blobs: imgs.map(i => i.blob), reason: t('reasonMulti', imgs.length) })
      return
    }
    const r = await copyBlobToClipboard(imgs[0].blob)
    if (!r.via) {
      askAtom.set({ blobs: [imgs[0].blob], reason: t('reasonBlocked') + ' [' + r.stages.join(' → ') + ']' })
      return
    }
    haptic('success')
    host.notify({ kind: 'success', message: t('copied') })
  } catch (err) { fail(err) }
}

function AskModal () {
  const t = usePluginI18n(PLUGIN_ID)
  const ask = useValue(askAtom)
  if (!ask) return null
  const close = () => askAtom.set(null)
  const grab = async () => {
    try {
      const n = await saveImages(ask.blobs)
      host.notify({ kind: 'success', message: n > 1 ? t('savedN', n) : t('saved') })
    } catch (err) { fail(err) }
    close()
  }
  // Theme tokens can carry alpha (macOS window vibrancy) — flatten every
  // paint to a solid color so the dialog never blends into page text.
  const th = snapshotTheme(document.documentElement)
  const pageBg = solidColor(th.bg, isDarkColor(th.bg) ? '#000000' : '#ffffff')
  const dark = isDarkColor(pageBg)
  const cardBg = solidColor(solidColor(th.card, pageBg), dark ? '#000000' : '#ffffff')
  return jsx('div', {
    className: 'fixed inset-0 flex items-center justify-center',
    style: { background: 'rgba(0,0,0,0.5)', zIndex: 2147483000 },
    onClick: close,
    children: jsxs('div', {
      className: 'p-5 mx-4 w-full max-w-[420px] flex flex-col gap-3',
      style: {
        background: cardBg, color: solidColor(th.fg, cardBg),
        border: '1px solid ' + solidColor(th.border, cardBg), borderRadius: 12,
        boxShadow: '0 12px 40px rgba(0,0,0,0.45)'
      },
      onClick: e => e.stopPropagation(),
      children: [
        jsx('div', { className: 'font-medium text-sm', children: t('askTitle') }),
        jsx('div', { className: 'text-xs leading-relaxed', style: { color: solidColor(th.muted, cardBg) }, children: ask.reason }),
        jsxs('div', { className: 'flex justify-end gap-2 mt-1', children: [
          jsx(Button, { size: 'sm', variant: 'text', onClick: close, children: t('btnCancel') }),
          jsx(Button, { size: 'sm', onClick: () => void grab(), children: t('btnDownload') })
        ] })
      ]
    })
  })
}

async function doDownloadPng () {
  try {
    const imgs = await renderImages()
    const n = await saveImages(imgs.map(i => i.blob))
    haptic('success')
    host.notify({ kind: 'success', message: n > 1 ? t('savedN', n) : t('saved') })
  } catch (err) { fail(err) }
}

function exportHtml (opts) {
  const ids = new Set(selectedIds())
  const turns = turnsAtom.get().filter(x => ids.has(x.id))
  const th = exportTheme()
  const opt = { ...optAtom.get(), images: true }
  const ml = opt.meta === false ? '' : buildMetaLine(metaAtom.get())
  const body = '<div class="chsh-wrap"><div class="chsh-pad">' +
    '<div class="chsh-title">' + esc(stateAtom.get().title || t('shareTitle')) + '</div>' +
    '<div class="chsh-meta">' + esc(fmtTs(Date.now() / 1000)) + ' · ' + turns.length + ' ' + t('turnsN') + (ml ? ' · ' + esc(ml) : '') + '</div>' +
    turns.map(x => turnXhtml(x, { images: true, tools: opt.tools, full: opt.full }, th)).join('') +
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
  const ml = opt.meta === false ? '' : buildMetaLine(metaAtom.get())
  if (ml) s += '> ' + ml + '\n\n'
  for (const turn of turns) {
    if (turn.user && turn.user.text) s += '## 👤 ' + (turn.user.ts ? fmtTs(turn.user.ts) + ' · ' : '') + 'User\n\n' + turn.user.text + '\n\n'
    const assts = opt.full === false ? turn.asst.slice(-1) : turn.asst
    for (const a of assts) s += '### 🤖 ' + (a.ts ? fmtTs(a.ts) + ' · ' : '') + 'Assistant\n\n' + a.text + '\n\n'
    if (opt.tools && opt.full !== false && turn.tools.length) s += turn.tools.map(x => '- 🔧 `' + x.name + '`' + (x.ctx ? ' — ' + x.ctx : '')).join('\n') + '\n\n'
    s += '---\n\n'
  }
  return new Blob([s], { type: 'text/markdown;charset=utf-8' })
}

function doDownloadHtml () { try { download(exportHtml(), fileBase() + '.html'); host.notify({ kind: 'success', message: t('saved') }) } catch (err) { fail(err) } }

// PDF export — zero-dependency print route. Builds a print-tuned HTML doc
// (light palette, @page margins, per-turn page-break protection), opens it in
// a blank window and hands the job to the system print dialog ("Save as PDF").
// window.open can be blocked by Electron policy → fall back to a hidden
// iframe; if that fails too, tell the user to print the exported HTML file.
function exportPrintableHtml () {
  const th = fixedThemePalette('light')
  const opt = { ...optAtom.get(), images: true }
  const ids = new Set(selectedIds())
  const turns = turnsAtom.get().filter(x => ids.has(x.id))
  const ml = opt.meta === false ? '' : buildMetaLine(metaAtom.get())
  const body = '<div class="chsh-wrap"><div class="chsh-pad">' +
    '<div class="chsh-title">' + esc(stateAtom.get().title || t('shareTitle')) + '</div>' +
    '<div class="chsh-meta">' + esc(fmtTs(Date.now() / 1000)) + ' · ' + turns.length + ' ' + t('turnsN') + (ml ? ' · ' + esc(ml) : '') + '</div>' +
    turns.map(x => turnXhtml(x, { images: true, tools: opt.tools, full: opt.full }, th)).join('') +
    '<div class="chsh-foot">Hermes</div></div></div>'
  return '<!DOCTYPE html><html><head><meta charset="utf-8"/><title>' + esc(stateAtom.get().title || 'Hermes') +
    '</title><style>@page{margin:18mm;}body{margin:0;background:' + th.bg + ';}' +
    exportCss(th, opt) +
    '.chsh-wrap img{max-width:100%;}.chsh-wrap .chsh-body{min-width:0;}' +
    '.chsh-body pre{white-space:pre-wrap;}</style></head><body>' + body + '</body></html>'
}

function printHtmlDocument (html) {
  // Returns true when the print dialog was triggered.
  let win = null
  try { win = window.open('', '_blank') } catch (e) { /* popup blocked */ }
  if (win && win.document) {
    win.document.open(); win.document.write(html); win.document.close()
    const w = win
    setTimeout(() => { try { w.focus(); w.print() } catch (e) { /* user prints manually */ } }, 250)
    return true
  }
  try {
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;left:-99999px;top:0;width:0;height:0;border:0;'
    document.body.appendChild(iframe)
    const doc = iframe.contentDocument
    doc.open(); doc.write(html); doc.close()
    const done = () => setTimeout(() => iframe.remove(), 4000)
    iframe.onload = done
    setTimeout(() => { try { iframe.contentWindow.focus(); iframe.contentWindow.print() } catch (e) { /* last resort below */ } done() }, 250)
    return true
  } catch (e) { return false }
}

function doDownloadPdf () {
  try {
    const html = exportPrintableHtml()
    if (!printHtmlDocument(html)) {
      // Both routes blocked — save the print-ready file and tell the user.
      download(new Blob([html], { type: 'text/html;charset=utf-8' }), fileBase() + '-print.html')
      host.notify({ kind: 'info', message: t('pdfFallback') })
      return
    }
    host.notify({ kind: 'info', message: t('pdfHint') })
  } catch (err) { fail(err) }
}
function doDownloadMd () { try { download(exportMd(), fileBase() + '.md'); host.notify({ kind: 'success', message: t('saved') }) } catch (err) { fail(err) } }
function doDownloadJson () {
  try {
    const ids = new Set(selectedIds())
    const turns = turnsAtom.get().filter(x => ids.has(x.id))
    const opt = optAtom.get()
    const s = exportJson(turns, metaAtom.get(), stateAtom.get().title, opt)
    download(new Blob([s], { type: 'application/json;charset=utf-8' }), fileBase() + '.json')
    host.notify({ kind: 'success', message: t('saved') })
  } catch (err) { fail(err) }
}

function fail (err) {
  const msg = String((err && err.message) || err)
  host.notify({ kind: 'error', message: t('exportFailed') + ': ' + msg })
}

// -- UI ------------------------------------------------------------------------
// -- turn navigation -----------------------------------------------------------
const rowEls = new Map() // turn id -> row DOM element

function jumpToTurn (id, expand) {
  if (expand) { const s = new Set(expAtom.get()); s.add(id); expAtom.set(s) }
  activeAtom.set(id)
  const el = rowEls.get(id)
  if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

// Hermes-chat-style segmented gutter: one tick per turn, click to jump.
// Drag across ticks to select a contiguous range (pointer capture keeps the
// gesture alive outside the 10px rail; touch-action:none stops scroll steal).
const dragAtom = atom(null) // { fromId, toId } while a gutter drag is active

function Gutter ({ turns }) {
  const activeId = useValue(activeAtom)
  const drag = useValue(dragAtom)
  const sel = useValue(selAtom)
  if (turns.length < 2) return null
  const gap = turns.length > 40 ? 1 : 2
  const dragStart = (id, e) => {
    e.preventDefault()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch (err) { /* capture is best-effort */ }
    dragAtom.set({ fromId: id, toId: id, moved: false })
  }
  const dragMove = (id) => {
    const d = dragAtom.get()
    if (!d) return
    if (id !== d.toId) dragAtom.set({ ...d, toId: id, moved: true })
    else if (!d.moved) dragAtom.set({ ...d, toId: id })
  }
  const dragEnd = (id) => {
    const d = dragAtom.get()
    dragAtom.set(null)
    if (!d) return
    if (!d.moved || d.fromId === d.toId) { jumpToTurn(id); return } // click, not drag
    const allIds = turns.map(x => x.id)
    selAtom.set(applyRangeSelection(sel, allIds, d.fromId, d.toId))
  }
  const inDrag = id => drag && id >= Math.min(drag.fromId, drag.toId) && id <= Math.max(drag.fromId, drag.toId)
  return jsx('div', {
    className: 'absolute top-3 bottom-3 right-0 w-[10px] flex flex-col z-30',
    style: { gap: gap + 'px' },
    children: turns.map(x => {
      const snippet = (((x.user && x.user.text) || (x.asst[0] && x.asst[0].text) || '') + '').replace(/\s+/g, ' ').slice(0, 48)
      const highlighted = inDrag(x.id)
      return jsx('div', {
        role: 'button',
        title: (x.id + 1) + '. ' + snippet,
        onPointerDown: e => dragStart(x.id, e),
        onPointerMove: () => dragMove(x.id),
        onPointerUp: () => dragEnd(x.id),
        className: 'flex-1 min-h-[2px] rounded-full',
        style: {
          background: highlighted ? 'var(--accent)' : (x.id === activeId ? 'var(--accent)' : 'var(--border)'),
          opacity: highlighted ? 0.55 : 1,
          cursor: 'pointer',
          touchAction: 'none'
        }
      }, 'g' + x.id)
    })
  })
}

function TurnRow ({ turn, checked, onToggle, expanded, onExpand, active }) {
  const t = usePluginI18n(PLUGIN_ID)
  const opt = useValue(optAtom)
  const mid = Math.max(0, turn.asst.length - 1)
  const showAsst = expanded ? turn.asst : (turn.asst.length ? [turn.asst[turn.asst.length - 1]] : [])
  const showTools = expanded && opt.tools && turn.tools.length
  const collapsible = mid > 0 || turn.tools.length > 0
  return jsxs('div', {
    ref: el => { if (el) rowEls.set(turn.id, el); else rowEls.delete(turn.id) },
    className: 'flex gap-3 py-3 border-b border-(--border)',
    style: active ? { boxShadow: 'inset 0 0 0 2px var(--accent)', borderRadius: 10 } : undefined,
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
        showAsst.map((a, k) => jsxs('div', { className: 'min-w-0', children: [
          jsxs('div', { className: 'text-xs text-(--muted-foreground) mb-1 mt-2 flex gap-2', children: [
            jsx('span', { className: 'font-medium', children: t('labelAssistant') }),
            a.ts ? jsx('span', { children: fmtTs(a.ts) }) : null
          ] }),
          jsx('div', { className: 'min-w-0 overflow-hidden', children: jsx(MessageTextContent, { text: a.text }) })
        ] }, k)),
        showTools ? jsx('div', { className: 'flex flex-wrap gap-1 pt-1', children: turn.tools.map((x, k) =>
          jsx('span', { className: 'text-[11px] px-2 py-0.5 rounded-full border border-(--border) text-(--muted-foreground)', children: '🔧 ' + x.name }, k)) }) : null,
        collapsible ? jsx(Button, { size: 'xs', variant: 'text', onClick: () => onExpand(turn.id), children: expanded ? t('collapse') : t('expand', mid, turn.tools.length) }) : null
      ] })
    ]
  })
}

function Toolbar () {
  const t = usePluginI18n(PLUGIN_ID)
  const opt = useValue(optAtom)
  const st = useValue(stateAtom)
  const ml = buildMetaLine(useValue(metaAtom))
  const turns = useValue(turnsAtom)
  const sel = useValue(selAtom)
  const selected = sel ? turns.filter(x => sel.has(x.id)) : turns
  const setOpt = patch => optAtom.set({ ...optAtom.get(), ...patch })
  const setSel = ids => selAtom.set(ids == null ? null : new Set(ids))
  const q = useValue(qAtom)
  const nav = useValue(navAtom)
  const setQ = v => {
    qAtom.set(v)
    const s = String(v).trim().toLowerCase()
    const ids = !s ? [] : turns.filter(x => (((x.user && x.user.text) || '') + '\n' + x.asst.map(a => a.text).join('\n')).toLowerCase().includes(s)).map(x => x.id)
    navAtom.set({ ids, at: -1 })
    if (!ids.length) activeAtom.set(null)
  }
  const step = d => {
    const cur = navAtom.get()
    if (!cur.ids.length) return
    const at = (cur.at + d + cur.ids.length) % cur.ids.length
    navAtom.set({ ...cur, at })
    jumpToTurn(cur.ids[at], true)
  }
  return jsxs('div', {
    className: 'border-b border-(--border) sticky top-0 bg-(--background) z-10 flex flex-col gap-1.5 px-4 py-2',
    children: [
      jsxs('div', { className: 'flex items-center gap-2 flex-nowrap', children: [
        jsx('span', { className: 'text-sm text-(--muted-foreground) shrink-0', style: { width: 130 }, children: t('selCount', selected.length, turns.length) }),
    jsx(Button, { size: 'xs', variant: 'text', onClick: () => setSel(null), children: t('selectAll') }),
    jsx(Button, { size: 'xs', variant: 'text', onClick: () => setSel([]), children: t('clearSel') }),
    jsx(Button, { size: 'xs', variant: 'text', onClick: () => setSel(turns.filter(x => !sel || !sel.has(x.id)).map(x => x.id)), children: t('invertSel') }),
      jsx('input', {
        className: 'text-xs rounded-md border border-(--border) bg-transparent px-2 py-1 text-(--foreground) shrink-0',
        style: { width: 220 }, placeholder: t('searchPh'), value: q,
        onChange: e => setQ(e.target.value),
        onKeyDown: e => { if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1) } }
      }),
      jsx('span', { className: 'text-xs text-(--muted-foreground) shrink-0 text-center', style: { width: 46 }, children: q.trim() ? (nav.at + 1) + '/' + nav.ids.length : '' }),
      jsx(Button, { size: 'xs', variant: 'text', onClick: () => step(-1), children: '↑' }),
      jsx(Button, { size: 'xs', variant: 'text', onClick: () => step(1), children: '↓' }),
      ] }),
      jsxs('div', { className: 'flex items-center gap-2 flex-nowrap', children: [
        jsx('span', { className: 'text-xs text-(--muted-foreground) shrink-0', children: t('widthL') }),
    jsx('select', {
      className: 'text-xs rounded-md border border-(--border) bg-transparent px-1.5 py-1 text-(--foreground) shrink-0',
      style: { width: 100 },
      value: String(opt.width), onChange: e => setOpt({ width: Number(e.target.value) }),
      children: [680, 880, 1080].map(w => jsx('option', { value: String(w), children: t('widthN', w) }, w))
    }),
    jsx('span', { className: 'text-xs text-(--muted-foreground) shrink-0 ml-1', children: t('fontL') }),
    jsx('select', {
      className: 'text-xs rounded-md border border-(--border) bg-transparent px-1.5 py-1 text-(--foreground) shrink-0',
      style: { width: 96 },
      value: String(opt.scale), onChange: e => setOpt({ scale: Number(e.target.value) }),
      children: [0.85, 1, 1.2].map(s => jsx('option', { value: String(s), children: t('fontN', Math.round(15 * s)) }, s))
    }),
    jsx('span', { className: 'text-xs text-(--muted-foreground) shrink-0 ml-1', children: t('themeL') }),
    jsx('select', {
      className: 'text-xs rounded-md border border-(--border) bg-transparent px-1.5 py-1 text-(--foreground) shrink-0',
      style: { width: 92 },
      value: opt.theme || 'auto', onChange: e => setOpt({ theme: e.target.value }),
      children: ['auto', 'light', 'dark'].map(m => jsx('option', { value: m, children: t('themeM', m) }, m))
    }),
    jsx('label', {
      className: 'flex items-center gap-1.5 text-xs text-(--foreground) cursor-pointer select-none',
      children: [
        jsx('input', {
          type: 'checkbox', checked: opt.meta !== false,
          onChange: () => setOpt({ meta: opt.meta === false }),
          className: 'size-3.5 accent-(--accent)'
        }),
        t('toggleMeta')
      ]
    }, 'meta'),
    jsx('label', {
      className: 'flex items-center gap-1.5 text-xs text-(--foreground) cursor-pointer select-none',
      children: [
        jsx('input', {
          type: 'checkbox', checked: !!opt.tools,
          onChange: () => setOpt({ tools: !opt.tools }),
          className: 'size-3.5 accent-(--accent)'
        }),
        t('toggleTools')
      ]
    }, 'tools'),
    jsx('label', {
      className: 'flex items-center gap-1.5 text-xs text-(--foreground) cursor-pointer select-none',
      children: [
        jsx('input', {
          type: 'checkbox', checked: opt.full !== false,
          onChange: () => setOpt({ full: !opt.full }),
          className: 'size-3.5 accent-(--accent)'
        }),
        t('fullLabel')
      ]
    }, 'full'),
    jsx('span', { className: 'flex-1' }),
    jsx(Button, { size: 'sm', onClick: () => void doDownloadMd(), children: 'Markdown' }),
    jsx(Button, { size: 'sm', onClick: () => void doDownloadJson(), children: 'JSON' }),
    jsx(Button, { size: 'sm', onClick: () => void doDownloadHtml(), children: 'HTML' }),
    jsx(Button, { size: 'sm', onClick: () => void doDownloadPdf(), children: t('btnPdf') }),
    jsx(Button, { size: 'sm', onClick: () => void doDownloadPng(), children: t('btnPng') }),
    jsx(Button, { size: 'sm', onClick: () => void doCopyPng(), children: t('btnCopyPng') })
      ] }),
      (opt.meta !== false && ml) ? jsx('div', { className: 'text-xs text-(--muted-foreground)', children: ml }, 'meta') : null
    ]
  })
}

// Editable conversation title for exports. Editing only affects the current
// export's title text — it never writes back to the session itself.
function TitleHeader ({ t, st }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const commit = () => {
    const v = draft.trim()
    if (v) stateAtom.set({ ...stateAtom.get(), title: v })
    setEditing(false)
  }
  return jsxs('div', { className: 'flex items-center gap-2 px-4 pt-3 pb-1', children: [
    editing
      ? jsx('input', {
          autoFocus: true,
          className: 'font-medium text-sm min-w-0 flex-1 rounded-md border border-(--accent) bg-transparent px-2 py-1 text-(--foreground)',
          value: draft,
          onChange: e => setDraft(e.target.value),
          onBlur: commit,
          onKeyDown: e => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            if (e.key === 'Escape') setEditing(false)
          }
        })
      : jsx('div', {
          className: 'font-medium text-sm min-w-0 truncate whitespace-nowrap cursor-text',
          title: t('editTitleTip'),
          onClick: () => { setDraft(st.title || ''); setEditing(true) },
          children: st.title || t('shareTitle')
        }),
    st.sid ? jsx('span', { className: 'text-xs text-(--muted-foreground)', children: st.sid.slice(0, 8) + '…' }) : null,
    jsx('span', { className: 'flex-1' }),
    st.loading ? jsx(GlyphSpinner, { className: 'text-(--muted-foreground)' }) : null
  ] })
}

function SharePage () {
  const t = usePluginI18n(PLUGIN_ID)
  const st = useValue(stateAtom)
  const turns = useValue(turnsAtom)
  const sel = useValue(selAtom)
  const exp = useValue(expAtom)
  const activeId = useValue(activeAtom)
  const drag = useValue(dragAtom)
  const opt = useValue(optAtom)
  // Follow whatever conversation the user is looking at: switching sessions in
  // the sidebar re-fetches automatically — no manual Refresh round-trip.
  const focus = useValue(host.state.focusedStoredSessionId)
  const active = useValue(host.state.activeSessionId)
  const sid = focus || active || ''

  // Restore remembered export prefs once, then persist every change (debounced
  // write; storage failures are silently ignored by design).
  useEffect(() => { loadPrefs() }, [])
  useEffect(() => {
    const iv = setTimeout(savePrefs, 400)
    return () => clearTimeout(iv)
  }, [opt])

  useEffect(() => {
    if (sid) void fetchTurnsFor(sid)
  }, [sid])

  const toggle = id => {
    const cur = selAtom.get()
    const all = turnsAtom.get().map(x => x.id)
    const set = new Set(cur == null ? all : Array.from(cur))
    if (set.has(id)) set.delete(id); else set.add(id)
    selAtom.set(set)
  }
  const toggleExpand = id => {
    const set = new Set(expAtom.get())
    if (set.has(id)) set.delete(id); else set.add(id)
    expAtom.set(set)
  }

  // Range-selection feedback strip (shown while dragging or after a drag).
  const range = drag && drag.moved && drag.fromId !== drag.toId
    ? { lo: Math.min(drag.fromId, drag.toId), hi: Math.max(drag.fromId, drag.toId) }
    : null

  return jsxs('div', { className: 'flex flex-col h-full min-h-0', children: [
    jsx(TitleHeader, { t, st }),
    jsx(Toolbar, {}),
    jsx(AskModal, {}),
    range ? jsxs('div', {
      className: 'flex items-center gap-2 px-4 py-1 text-xs bg-(--accent)/10 text-(--foreground) border-b border-(--border)',
      children: [
        jsx('span', { children: t('rangeTip', (range.lo + 1) + '~' + (range.hi + 1)) }),
        jsx(Button, { size: 'xs', variant: 'text', onClick: () => selAtom.set(new Set(turns.map(x => x.id))), children: t('selectAll') }),
        jsx(Button, { size: 'xs', variant: 'text', onClick: () => selAtom.set(null), children: t('rangeClear') })
      ]
    }, 'rangeclear') : null,
    st.error ? jsxs('div', { className: 'p-6 flex flex-col items-start gap-3', children: [
      jsx(EmptyState, { title: t('loadFail'), description: st.error === 'no-focused-session' ? t('needSession') : st.error }),
      jsx(Button, { size: 'sm', onClick: () => void fetchTurns(), children: t('retry') })
    ] }) : !turns.length && !st.loading ? jsxs('div', { className: 'p-6 flex flex-col items-start gap-3', children: [
      jsx(EmptyState, { title: t('empty') }),
      jsx(Button, { size: 'sm', onClick: () => void fetchTurns(), children: t('retry') })
    ] }) : jsx('div', { className: 'flex-1 min-h-0 relative', children: [
      jsx('div', { className: 'h-full overflow-y-auto px-4 pr-5', children: jsx('div', { className: 'mx-auto w-full max-w-[880px]', children:
        turns.map(turn => jsx(TurnRow, {
          turn, checked: sel == null ? true : sel.has(turn.id), onToggle: toggle,
          expanded: exp.has(turn.id), onExpand: toggleExpand, active: turn.id === activeId
        }, turn.id)) }) }),
      jsx(Gutter, { turns })
    ] })
  ] })
}

// -- registration ---------------------------------------------------------------
const STRINGS = {
  en: {
    navLabel: 'Share chat',
    shareTitle: 'Share conversation',
    retry: 'Retry',
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
    copied: 'Long image copied to clipboard',
    askTitle: 'Cannot copy to clipboard',
    reasonMulti: n => 'This conversation exports as ' + n + ' tall pages, and the clipboard can only hold one image. Downloading gives you one merged long PNG.',
    reasonBlocked: 'The desktop app blocks plugin clipboard writes (security policy).',
    btnCancel: 'Cancel', btnDownload: 'Download image',
    saved: 'Saved', savedN: n => n + ' files downloaded (too tall to merge into one PNG)', exportFailed: 'Export failed',
    turnsN: 'turns',
    searchPh: 'search turns…',
    widthL: 'Width', fontL: 'Font',
    expand: (a, b) => 'expand (' + a + ' more repl' + (a === 1 ? 'y' : 'ies') + (b ? ' · ' + b + ' tool calls' : '') + ')',
    collapse: 'collapse',
    fullLabel: 'share full conversation',
    themeL: 'Theme', themeM: m => m === 'auto' ? 'follow app' : (m === 'light' ? 'light' : 'dark'),
    toggleMeta: 'session info',
    btnPdf: 'PDF / Print',
    pdfHint: 'Print dialog opened — choose "Save as PDF".',
    pdfFallback: 'Print was blocked; a print-ready HTML file was downloaded instead — open it and print to PDF.',
    rangeTip: n => 'selected turns ' + n,
    rangeClear: 'clear',
    editTitleTip: 'Click to edit the export title'
  },
  'zh': {
    navLabel: '分享对话',
    shareTitle: '分享对话',
    retry: '重试',
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
    copied: '长截图已复制到剪贴板',
    askTitle: '无法复制到粘贴板',
    reasonMulti: n => '本次内容会导出为 ' + n + ' 页长图，粘贴板一次只能放一张图片；下载则会合并为一张长 PNG。',
    reasonBlocked: '桌面端权限策略阻止了插件写入剪贴板。',
    btnCancel: '取消', btnDownload: '下载图片',
    saved: '已保存', savedN: n => '已下载 ' + n + ' 个文件（长图过高，无法合并为一张）', exportFailed: '导出失败',
    turnsN: '轮',
    searchPh: '搜索对话内容…',
    widthL: '宽度', fontL: '字号',
    expand: (a, b) => '展开（' + a + ' 条中间回复' + (b ? ' · ' + b + ' 个工具调用' : '') + '）',
    collapse: '收起',
    fullLabel: '分享完整对话',
    themeL: '主题', themeM: m => m === 'auto' ? '跟随应用' : (m === 'light' ? '浅色' : '深色'),
    toggleMeta: '会话信息',
    btnPdf: 'PDF / 打印',
    pdfHint: '已打开打印对话框 — 选择「另存为 PDF」。',
    pdfFallback: '打印被阻止；已改为下载打印友好 HTML 文件，打开后打印为 PDF 即可。',
    rangeTip: n => '已选第 ' + n + ' 轮',
    rangeClear: '清除',
    editTitleTip: '点击编辑导出标题'
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
        id: 'titlebar', area: TITLEBAR_AREAS.right,
        data: {
          id: 'chat-share.open', label: ctx.i18n.t('navLabel'),
          icon: jsx(Codicon, { name: 'share' }),
          // Titlebar mounts stay alive across routes — read the focused
          // conversation at click time, so whatever chat you're on is what
          // gets shared. SharePage then follows that session on its own.
          onSelect: () => { host.navigate(ROUTE); void fetchTurns() }
        }
      },
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
