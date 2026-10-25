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

export { esc,baseName,mdToXhtml,inline,fmtTs,snapshotTheme,exportCss,turnXhtml,svgWrap,slugTitle,fragWithCss,buildPages,loadSvgImage,pageToPng,normalizeSessionInfo,buildMetaLine,parseCssRgba,solidColor,isDarkColor,stitchPngs }
