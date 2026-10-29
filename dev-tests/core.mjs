function esc (s) {
  return String(s == null ? '' : s)
    // XML-invalid control chars (ANSI escapes \x1b, NUL… from captured logs)
    // would kill the SVG XML parse in the PNG pipeline — drop them, keep \n \t.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
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
// Code spans use PUA sentinels (\uE000/\uE001) instead of NUL: esc() strips
// real control chars (ANSI escapes from captured logs), and a NUL sentinel
// was stripped with them — every `code` span degraded to its bare index
// digit (EXIT → 0, URLs → 0). PUA chars survive esc() and are XML-valid.
function inline (s, keepImg) {
  const codes = []
  let t = String(s == null ? '' : s).replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return '\uE000' + (codes.length - 1) + '\uE001' })
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
  t = t.replace(/\uE000(\d+)\uE001/g, (_, n) => '<code>' + esc(codes[+n]) + '</code>')
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
    '.chsh-title{font-size:' + (fs * 1.7) + 'px;font-weight:700;line-height:1.3;margin-bottom:8px;}',
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
    'font-family:ui-monospace,"SF Mono","Cascadia Code","JetBrains Mono",Consolas,"Microsoft YaHei","PingFang SC","Noto Sans CJK SC",monospace;}',
    '.chsh-body pre{background:' + th.codeBg + ';border:1px solid ' + th.border + ';border-radius:10px;padding:12px 14px;margin:0 0 10px;',
    'white-space:pre-wrap;font-size:0.86em;line-height:1.5;',
    'font-family:ui-monospace,"SF Mono","Cascadia Code","JetBrains Mono",Consolas,"Microsoft YaHei","PingFang SC","Noto Sans CJK SC",monospace;}',
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

// Per-part renderers. A turn is exported as up to three visual parts (user
// bubble, assistant replies, tool chips); the PNG pager can place parts on
// different pages and even split one giant reply across pages, while
// turnXhtml (HTML export) keeps composing them exactly as before.
function userXhtml (turn, opt) {
  if (!turn.user || !turn.user.text) return ''
  return '<div class="chsh-user"><div class="chsh-who">👤' +
    (turn.user.ts ? '<span class="chsh-ts">' + fmtTs(turn.user.ts) + '</span>' : '') + '</div>' +
    '<div class="chsh-body">' + mdToXhtml(turn.user.text, { images: opt.images }) + '</div></div>'
}

function asstXhtml (a, opt) {
  return '<div class="chsh-asst"><div class="chsh-who">🤖' +
    (a.ts ? '<span class="chsh-ts">' + fmtTs(a.ts) + '</span>' : '') + '</div>' +
    '<div class="chsh-body">' + mdToXhtml(a.text, { images: opt.images }) + '</div></div>'
}

function toolsXhtml (turn) {
  if (!turn.tools.length) return ''
  return '<div class="chsh-tools">' + turn.tools.map(t =>
    '<span class="chsh-tool">🔧 ' + esc(t.name) + '</span>').join('') + '</div>'
}

// One turn → XHTML fragment (used by HTML export; the PNG pager uses parts).
function turnXhtml (turn, opt, th) {
  let s = '<div class="chsh-turn" data-turn="' + turn.id + '">'
  s += userXhtml(turn, opt)
  // full === false → keep only the final assistant reply, drop tool chips
  const assts = opt.full === false && turn.asst.length ? [turn.asst[turn.asst.length - 1]] : turn.asst
  for (const a of assts) s += asstXhtml(a, opt)
  if (opt.tools && opt.full !== false) s += toolsXhtml(turn)
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

// -- oversize-turn splitting + minimal PDF writer (pure, CORE-tested) ---------
// A single reply taller than one PNG page (huge log dumps are the classic
// case) must be split across pages, or its page exceeds Chromium's 16384
// device-px GPU-texture cap and renders partially/blank — silently.
//
// splitLongText splits markdown into well-formed chunks: fenced code blocks
// are atomic unless themselves oversized (then the INNER lines are sliced and
// each slice re-wrapped in the same fence), plain groups split on lines, and
// even a single monstrous line is char-cut as a last resort. `fits(chunk)`
// is the caller's measured height predicate.
function mdBlocks (text) {
  const lines = String(text == null ? '' : text).replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let i = 0
  while (i < lines.length) {
    const fence = lines[i].match(/^\s*(```|~~~)\s*(\S*)\s*$/)
    if (fence) {
      const closeRe = new RegExp('^\\s*' + fence[1] + '\\s*$')
      const inner = []
      i++
      while (i < lines.length && !closeRe.test(lines[i])) { inner.push(lines[i]); i++ }
      if (i < lines.length) i++ // consume closing fence; unterminated → content only
      blocks.push({ fence: fence[1], lang: fence[2] || '', lines: inner })
    } else {
      const buf = [lines[i]]
      i++
      while (i < lines.length && !/^\s*(```|~~~)\s*\S*\s*$/.test(lines[i])) { buf.push(lines[i]); i++ }
      blocks.push({ fence: null, lang: '', lines: buf })
    }
  }
  return blocks
}

function binaryMax (lo, hi, ok) {
  let best = lo
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (ok(mid)) { best = mid; lo = mid + 1 } else hi = mid - 1
  }
  return best
}

function splitLongText (text, fits) {
  const t = String(text == null ? '' : text)
  if (!t) return [t]
  if (fits(t)) return [t]
  const chunks = []
  let cur = []
  const flush = () => { if (cur.length) { chunks.push(cur.join('\n')); cur = [] } }
  const wrapFence = inner => (inner.length ? '```' + '\n' : '') + inner.join('\n') + (inner.length ? '\n```' : '')
  for (const b of mdBlocks(t)) {
    const lines = b.fence ? [b.fence + (b.lang ? ' ' + b.lang : ''), ...b.lines, b.fence] : b.lines
    const cand = (cur.length ? cur.join('\n') + '\n' : '') + lines.join('\n')
    if (fits(cand)) { for (const ln of lines) cur.push(ln); continue }
    flush()
    if (fits(lines.join('\n'))) { for (const ln of lines) cur.push(ln); continue }
    // the block alone exceeds a page — split inside it
    if (b.fence) {
      const full = inner => '```\n' + inner.join('\n') + '\n```'
      let i = 0
      while (i < b.lines.length) {
        const take = binaryMax(1, b.lines.length - i, n => fits(full(b.lines.slice(i, i + n))))
        if (take === 1 && !fits(full([b.lines[i]]))) {
          // giant single line inside a fence — char-cut, re-wrapped per slice
          let s = b.lines[i]
          while (s.length) {
            const cut = binaryMax(1, s.length, n => fits(full([s.slice(0, n)])))
            chunks.push(full([s.slice(0, cut)]))
            s = s.slice(cut)
          }
          i++
        } else { chunks.push(full(b.lines.slice(i, i + take))); i += take }
      }
    } else {
      let i = 0
      while (i < b.lines.length) {
        const take = binaryMax(1, b.lines.length - i, n => fits(b.lines.slice(i, i + n).join('\n')))
        if (take === 1 && !fits(b.lines[i])) {
          // single line still too tall — char-cut (one wrapped giant line)
          let s = b.lines[i]
          while (s.length) {
            const cut = binaryMax(1, s.length, n => fits(s.slice(0, n)))
            chunks.push(s.slice(0, cut))
            s = s.slice(cut)
          }
          i++
        } else { chunks.push(b.lines.slice(i, i + take).join('\n')); i += take }
      }
    }
  }
  flush()
  return chunks.length ? chunks : [t]
}

// Minimal dependency-free PDF writer: every page embeds one JPEG (DCTDecode)
// full-bleed, so "PDF" is a direct download instead of routing the user
// through the print dialog. Structure-only, ASCII objects + raw JPEG bytes.
function buildPdfFromJpegs (pages) {
  const latin1 = s => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0xff; return u }
  const parts = []
  let off = 0
  const offs = {}
  const push = p => { const u = typeof p === 'string' ? latin1(p) : p; parts.push(u); off += u.length }
  push('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n')
  const n = pages.length
  const obj = i => 3 + 3 * i // page / +1 image / +2 content stream
  offs[1] = off
  push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
  offs[2] = off
  push('2 0 obj\n<< /Type /Pages /Kids [' + pages.map((_, i) => obj(i) + ' 0 R').join(' ') + '] /Count ' + n + ' >>\nendobj\n')
  pages.forEach((p, i) => {
    const wPt = Math.round(p.wPx * 0.75 * 100) / 100 // 96dpi px → pt, 1:1 crispness
    const hPt = Math.round(p.hPx * 0.75 * 100) / 100
    const pn = obj(i); const imn = pn + 1; const cn = pn + 2
    offs[pn] = off
    push(pn + ' 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + wPt + ' ' + hPt + ']' +
      ' /Resources << /XObject << /Im' + i + ' ' + imn + ' 0 R >> >> /Contents ' + cn + ' 0 R >>\nendobj\n')
    offs[imn] = off
    push(imn + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + p.wPx + ' /Height ' + p.hPx +
      ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + p.bytes.length + ' >>\nstream\n')
    push(p.bytes)
    push('\nendstream\nendobj\n')
    const content = 'q ' + wPt + ' 0 0 ' + hPt + ' 0 0 cm /Im' + i + ' Do Q'
    offs[cn] = off
    push(cn + ' 0 obj\n<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream\nendobj\n')
  })
  const xrefAt = off
  let x = 'xref\n0 ' + (3 + 3 * n) + '\n0000000000 65535 f \n'
  for (let i = 1; i < 3 + 3 * n; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n'
  x += 'trailer\n<< /Size ' + (3 + 3 * n) + ' /Root 1 0 R >>\nstartxref\n' + xrefAt + '\n%%EOF'
  push(x)
  const out = new Uint8Array(off)
  let at = 0
  for (const u of parts) { out.set(u, at); at += u.length }
  return out
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

const PAGE_MAX = 7900 // CSS px per PNG page (x2 DPR = 15800, under the 16384 GPU-texture cap)
const PAGE_HEAD = 160 // first-page headroom for the title + meta header
const RASTER_SLACK = 240 // headroom over the measured height; cropped back after raster

// App-stylesheet-proof measurement. A plain offscreen div inherits Hermes'
// global stylesheets (resets, line-height overrides), but the SVG raster
// sees ONLY exportCss — the drift compounds over long pages and used to
// clip the tail of the export. A closed shadow root with `all:initial` on
// the host gives the measurement exactly the style environment the SVG
// rasterizer has. (SLACK + bottom-crop in pageToPng absorbs any residue.)
function makeIsoHolder (width) {
  const host = document.createElement('div')
  host.style.cssText = 'all:initial;display:block;position:fixed;left:-20000px;top:0;visibility:hidden;z-index:-1;width:' + width + 'px;'
  const root = host.attachShadow({ mode: 'closed' })
  const style = document.createElement('style')
  const holder = document.createElement('div')
  holder.className = 'chsh-wrap'
  holder.style.cssText = 'width:' + width + 'px;'
  root.appendChild(style)
  root.appendChild(holder)
  document.body.appendChild(host)
  return { host, style, holder }
}

function fragWithCss (turn, th, opt) {
  return turnXhtml(turn, { images: false, tools: opt.tools, full: opt.full }, th)
}

// Fragment-based pager. Turns are decomposed into parts (user bubble / each
// assistant reply / tool chips); parts are measured offscreen, oversized
// single replies are split into well-formed markdown chunks (splitLongText),
// and everything is packed greedily under PAGE_MAX. A page is an array of
// pre-rendered XHTML fragments. Without the splitting, one reply taller than
// a page used to overflow the 16384 device-px canvas cap and render truncated.
function buildPages (turns, th, opt) {
  const optI = { images: false, tools: opt.tools, full: opt.full }
  const iso = makeIsoHolder(opt.width)
  const { holder } = iso
  iso.style.textContent = exportCss(th, opt)
  try {
    const measure = inner => {
      holder.innerHTML = '<div class="chsh-pad"><div class="chsh-turn">' + inner + '</div></div>'
      return Math.ceil(holder.firstChild.firstChild.getBoundingClientRect().height) + 22
    }
    // 1) atomic fragments
    const raw = []
    for (const turn of turns) {
      if (turn.user && turn.user.text) raw.push({ kind: 'user', turn })
      const assts = opt.full === false && turn.asst.length ? [turn.asst[turn.asst.length - 1]] : turn.asst
      for (const a of assts) raw.push({ kind: 'asst', turn, a })
      if (opt.tools && opt.full !== false && turn.tools.length) raw.push({ kind: 'tools', turn })
    }
    const partXhtml = f => f.kind === 'user' ? userXhtml(f.turn, optI)
      : f.kind === 'asst' ? asstXhtml(f.a, optI) : toolsXhtml(f.turn)
    // 2) split any fragment taller than a page (tool-chip rows are never split)
    const frags = []
    for (const f of raw) {
      const h = measure(partXhtml(f))
      if (h <= PAGE_MAX - 80 || f.kind === 'tools') { frags.push({ html: partXhtml(f), h }); continue }
      const text = f.kind === 'user' ? f.turn.user.text : f.a.text
      const ts = f.kind === 'user' ? f.turn.user.ts : f.a.ts
      const wrap = (s, first) => {
        const who = f.kind === 'user'
          ? '<div class="chsh-user"><div class="chsh-who">👤' + (first && ts ? '<span class="chsh-ts">' + fmtTs(ts) + '</span>' : '') + '</div><div class="chsh-body">'
          : '<div class="chsh-asst"><div class="chsh-who">🤖' + (first && ts ? '<span class="chsh-ts">' + fmtTs(ts) + '</span>' : '') + '</div><div class="chsh-body">'
        return who + mdToXhtml(s, { images: false }) + '</div></div>'
      }
      const slices = splitLongText(text, s => measure(wrap(s, true)) <= PAGE_MAX - 120)
      slices.forEach((s, i) => frags.push({ html: wrap(s, i === 0), h: measure(wrap(s, i === 0)) }))
    }
    // 3) greedy pack (first page reserves header headroom)
    const pages = []
    let cur = [], acc = 0
    for (const fr of frags) {
      const budget = (pages.length === 0 ? PAGE_MAX - PAGE_HEAD : PAGE_MAX) - 22
      if (cur.length && acc + fr.h > budget) { pages.push(cur); cur = []; acc = 0 }
      cur.push(fr.html); acc += fr.h
    }
    if (cur.length) pages.push(cur)
    return pages
  } finally {
    iso.host.remove()
  }
}

function loadSvgImage (svg, width) {
  // MUST be a data: URL, not blob:. Chromium taints the canvas when the drawn
  // image is an SVG (with foreignObject) loaded from a blob: URL — toBlob then
  // throws "Tainted canvases may not be exported". Data URLs keep the image
  // origin-clean. Pages are capped at PAGE_MAX CSS px, so the percent-encoded
  // URL stays far below any practical data-URL limit.
  return new Promise((resolve, reject) => {
    const img = new Image()
    const to = setTimeout(() => reject(new Error('svg-render-timeout')), 15000)
    img.onload = () => { clearTimeout(to); resolve(img) }
    img.onerror = () => { clearTimeout(to); reject(new Error('svg-render-failed')) }
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  })
}

async function pageToPng (parts, th, opt) {
  const headHtml = (opt.title ? '<div class="chsh-title">' + esc(opt.title) + '</div>' : '') +
    (opt.metaLine ? '<div class="chsh-meta">' + esc(opt.metaLine) + '</div>' : '')
  const body = '<div class="chsh-pad">' + headHtml + parts.join('') +
    '<div class="chsh-foot">Hermes · ' + esc(fmtTs(Date.now() / 1000)) + '</div></div>'
  // one measurement pass in the isolated (app-CSS-proof) holder
  const iso = makeIsoHolder(opt.width)
  iso.style.textContent = exportCss(th, opt)
  let height
  try { iso.holder.innerHTML = body; height = Math.ceil(iso.holder.getBoundingClientRect().height) } finally { iso.host.remove() }
  // Rasterize with SLACK headroom, then crop to the true painted bottom.
  // Residual measure-vs-raster drift (rounding, font fallback differences)
  // used to clip the tail inside the foreignObject on long pages.
  const dpr = 2
  const rasterH = Math.min(height + RASTER_SLACK, 8100) // ×2 DPR stays under the 16384 GPU cap
  const svg = svgWrap(body, opt.width, rasterH, exportCss(th, opt), th)
  const img = await loadSvgImage(svg, opt.width)
  const canvas = document.createElement('canvas')
  canvas.width = opt.width * dpr
  canvas.height = rasterH * dpr
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = th.bg
  ctx.fillRect(0, 0, opt.width, rasterH)
  ctx.drawImage(img, 0, 0, opt.width, rasterH)
  // Taint probe: toBlob on a tainted canvas throws a bare SecurityError;
  // name the actual cause (a non-origin-clean SVG source) instead.
  try { ctx.getImageData(0, 0, 1, 1) } catch (e) { throw new Error('canvas-tainted-svg-source') }
  // bottom-up band scan for the last painted row (bg = solid th.bg)
  const bgc = parseCssRgba(th.bg) || { r: 255, g: 255, b: 255 }
  const isBgRow = (data, w, y) => {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4
      if (data[i + 3] !== 0 && (Math.abs(data[i] - bgc.r) > 8 || Math.abs(data[i + 1] - bgc.g) > 8 || Math.abs(data[i + 2] - bgc.b) > 8)) return false
    }
    return true
  }
  let contentBottom = height // assume measured height when everything is bg
  const BAND = 256 // device px per scan band
  scan: for (let y1 = canvas.height; y1 > 0; y1 -= BAND) {
    const y0 = Math.max(0, y1 - BAND)
    const data = ctx.getImageData(0, y0, canvas.width, y1 - y0).data
    for (let y = y1 - y0 - 1; y >= 0; y--) {
      if (!isBgRow(data, canvas.width, y)) { contentBottom = Math.ceil((y0 + y + 1) / dpr); break scan }
    }
  }
  const finalH = Math.max(1, Math.min(rasterH, contentBottom + 8))
  let out = canvas
  if (finalH < rasterH) {
    out = document.createElement('canvas')
    out.width = canvas.width; out.height = finalH * dpr
    out.getContext('2d').drawImage(canvas, 0, 0)
  }
  const blob = await new Promise(res => out.toBlob(res, 'image/png'))
  if (!blob) throw new Error('png-encode-failed')
  const jpeg = await new Promise(res => out.toBlob(res, 'image/jpeg', 0.92))
  if (!jpeg) throw new Error('jpeg-encode-failed')
  return { blob, jpeg, height: finalH, wDev: opt.width * dpr, hDev: finalH * dpr }
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

export { esc,baseName,mdToXhtml,inline,fmtTs,snapshotTheme,exportCss,userXhtml,asstXhtml,toolsXhtml,turnXhtml,turnJson,exportJson,hlEscape,hlSegment,hlRest,highlightCode,applyRangeSelection,mdBlocks,binaryMax,splitLongText,buildPdfFromJpegs,svgWrap,slugTitle,makeIsoHolder,fragWithCss,buildPages,loadSvgImage,pageToPng,normalizeSessionInfo,buildMetaLine,parseCssRgba,solidColor,fixedThemePalette,resolveTheme,isDarkColor,stitchPngs }
