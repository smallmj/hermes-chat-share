// Source-level guards over desktop/plugin.js — two regions, two tracks.
//
// SHARE PANE (ADR-0001 / spec #13 / ticket #15): everything from
// `==== CORE END ====` to EOF.
//  1. No bare host token NAMES that the host never defines — `--border`,
//     `--card`, `--accent`, `--muted-foreground`, `--muted` — neither as an
//     inline `var(...)` nor as a Tailwind arbitrary-value class. The host
//     aliases only --background/--foreground/--midground and does not compile
//     runtime-plugin class names (host-tokens.md).
//  2. Arbitrary-value CLASS forms of the three aliased names
//     (`text-(--foreground)`, `bg-(--background)`, ...) are banned too: the
//     variables exist but the classes are never compiled, so they are dead.
//  3. No emoji rendered as a pane icon (🔧 👤 🤖, ↑/↓ stepper glyphs). Icons
//     go through Codicon/Badge host primitives.
//
// EXPORT TRACK (#16, ADR-0002): the block between the CORE markers, asserted
// from rule 4 on. The pane rules stop at the CORE marker because the export
// core has different survival conditions (no host at all when the artifact is
// opened) — but the same failure mode must not survive there either.
//  4. Role/tool icons in the export markup are inline vectors, never emoji.
//  5. The theme probe reads only host tokens that actually exist (`--dt-*`).
//  6. The core is offline-self-contained: no webfont, no fetched resource.
//
// Carve-out: exportMd() lives in the panel region but writes an export
// artifact (Markdown headings) — Markdown is plain text, so emoji there are
// content, not icons; its body is excluded from rule 3 only. Rules 1-2 still
// scan it, and rule 4 forbids the same glyphs throughout the CORE block.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(path.join(root, 'desktop', 'plugin.js'), 'utf8')

const endMarker = '==== CORE END ===='
const end = src.indexOf(endMarker)
assert.ok(end > 0, 'CORE END marker present in plugin.js')
const panel = src.slice(end)

// --- rules 1 & 2: token discipline ------------------------------------------
const bareNames = ['--accent', '--border', '--card', '--muted-foreground', '--muted']
for (const n of bareNames) {
  // inline style usage: var(--name)
  assert.ok(!panel.includes('var(' + n + ')'),
    'pane must not use var(' + n + '): the host never defines ' + n)
  // arbitrary-value class usage: any-thing-(--name) e.g. border-(--border), bg-(--accent)/10
  assert.ok(!panel.includes('-(' + n + ')'),
    'pane must not use arbitrary-value class for ' + n + ' (the host does not compile plugin classes)')
}
for (const n of ['--foreground', '--background', '--midground']) {
  assert.ok(!panel.includes('-(' + n + ')'),
    'pane must not use uncompiled arbitrary-value class for ' + n + ' (inline var(--ui-*) instead)')
}

// --- rule 3: no emoji icons in the pane -------------------------------------
// Carve-out is deliberately narrow: it is exactly the panel's exportMd body
// (a Markdown artifact — plain text, no styling surface, so emoji there are
// content, not icons). Everything else in the file must draw icons as
// vectors: the pane via host primitives (this region), the export markup via
// inline SVG (the CORE region, asserted below).
const mdStart = panel.indexOf('function exportMd')
const mdEnd = panel.indexOf('function doDownloadHtml')
assert.ok(mdStart > 0 && mdEnd > mdStart, 'exportMd body locatable for the emoji carve-out')
assert.ok(mdEnd <= src.length && src.indexOf('function exportMd') > end, 'carve-out lives in the panel region only')
const panelNoMdExport = panel.slice(0, mdStart) + panel.slice(mdEnd)
for (const glyph of ['🔧', '👤', '🤖', '↑', '↓']) {
  assert.ok(!panelNoMdExport.includes(glyph),
    'pane must not render emoji glyph as an icon: ' + glyph + ' (use Codicon)')
}

// --- rule 4: the EXPORT track (#16) inside CORE ----------------------------
// The export markup is embedded in the artifact, which is opened where no host
// exists (ADR-0002), so role icons are inline vectors and the theme probe must
// read tokens that actually exist. Scanned over the whole CORE block on
// purpose: the PNG pager (buildPages) duplicates the turn-header markup, so
// emoji would survive there unnoticed if only the renderer functions were read.
const coreStart = src.indexOf('==== CORE START ====')
assert.ok(coreStart > 0 && coreStart < end, 'CORE START marker present in plugin.js')
const core = src.slice(coreStart, end)
for (const glyph of ['👤', '🤖', '🔧']) {
  assert.ok(!core.includes(glyph),
    'export markup must draw the role/tool icon as inline SVG, not emoji: ' + glyph)
}
// 📎 ⬜ 🖼 stay legal: they are placeholders for omitted media/widgets/images
// (content markers produced by mdToXhtml/inline), not icons.
for (const glyph of ['📎', '⬜', '🖼']) {
  assert.ok(core.includes(glyph), 'mdToXhtml placeholder marker kept: ' + glyph)
}
// --- rule 5: snapshotTheme probes REAL host tokens -------------------------
// v1.1.8 probed --card/--border/--accent/--muted-foreground/--muted, which the
// host never defines, so "follow the app theme" silently fell back to light.
// Mechanism (hidden element + inline var() + computed rgba) is frozen; only the
// probed names move to the --dt-* family the host actually paints (ADR-0002).
const probeStart = core.indexOf('function snapshotTheme')
const probeEnd = core.indexOf('function exportCss')
assert.ok(probeStart > 0 && probeEnd > probeStart, 'snapshotTheme located inside CORE')
const probe = core.slice(probeStart, probeEnd)
for (const n of ['--background', '--foreground', '--border', '--card', '--accent', '--muted-foreground', '--muted']) {
  assert.ok(!probe.includes('var(' + n + ')'),
    'export probe must not name the bare host token ' + n + ' (the host does not define it)')
  assert.ok(!probe.includes('-(' + n + ')'), 'export probe must not use an arbitrary-value class for ' + n)
}
for (const n of ['--dt-background', '--dt-foreground', '--dt-card', '--dt-border', '--dt-accent', '--dt-muted-foreground', '--dt-muted']) {
  assert.ok(probe.includes('var(' + n + ')'), 'export probe must read the real token ' + n)
}
// the probe mechanism itself is frozen: element + inline var() + computed style
assert.ok(probe.includes('cssText') && probe.includes('getComputedStyle'),
  'snapshotTheme keeps the browser-resolved probe mechanism')

// --- rule 6: the artifact is offline-self-contained -----------------------
// Case-sensitive on purpose: URL.createObjectURL (PNG stitching) is not a
// fetched stylesheet. No webfont may be embedded or referenced — the artifact
// has to open on a machine with no network (spec #13 story 25).
assert.ok(!/@font-face|@import|url\(/.test(core),
  'export core must be offline-self-contained: no webfont face, no @import, no url()')

console.log('GUARD_TEST_OK')
