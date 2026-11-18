// Source-level guards over desktop/plugin.js — two regions, two tracks.
//
// SHARE PANE (ADR-0001 / spec #13 / tickets #15 + #19): everything from
// `==== CORE END ====` to EOF.
//  1. No Tailwind arbitrary-value CLASS referencing a CSS variable
//     (`…-(--token)`): the host never compiles runtime-plugin class names,
//     so such a class is dead unless the host's own bundle already compiled
//     that exact class. The only form that can ever qualify is a `--ui-*`
//     one, and every occurrence must be pinned in PANE_ARB_ALLOW with the
//     host-CSS grep that proves it compiled (#19 item 4b).
//  2. No inline var(--token) naming a token the host never defines: the
//     WHOLE file is scanned against the token whitelist (rule 8).
//  3. No emoji rendered as a pane icon (🔧 👤 🤖, ↑/↓ stepper glyphs). Icons
//     go through Codicon/Badge host primitives.
//  9. Pane toggles and fields are host primitives (story 14 focus rings):
//     no native `type: 'checkbox'`, no native `input` element.
//
// EXPORT TRACK (#16, ADR-0002): the block between the CORE markers, asserted
// from rule 4 on. The pane rules stop at the CORE marker because the export
// core has different survival conditions (no host at all when the artifact is
// opened) — but the same failure mode must not survive there either.
//  4. Role/tool icons in the export markup are inline vectors, never emoji.
//  5. The theme probe reads only host tokens that actually exist (`--dt-*`).
//     Its negative half is now rule 8's whole-file whitelist; the positive
//     half (the probe must READ the real --dt-* names) stays here.
//  6. The core is offline-self-contained: no webfont, no fetched resource.
//
// Carve-out: exportMd() lives in the panel region but writes an export
// artifact (Markdown headings) — Markdown is plain text, so emoji there are
// content, not icons; its body is excluded from rule 3 only. The carve-out is
// self-proving: it must start exactly at `function exportMd` and no other
// `function` may ride inside it, so future code inserted after exportMd is
// back under the rule automatically (#19 item 4a).
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

// --- rules 1 & 7: arbitrary-value token classes in the pane ---------------
// `border-(--border)` / `text-(--ui-text-tertiary)` style classes are never
// compiled for a runtime plugin (host-tokens.md); one is only alive if the
// host bundle compiled that EXACT selector. Add an entry here with the grep
// evidence (count ≥ 1 in dist/assets/main--ssIraiQ.css, `(` escaped as `\(`)
// before using one in the pane — inline var(--ui-*) remains the default.
const PANE_ARB_ALLOW = new Map([
  // none in use right now; shape of a sanctioned entry:
  // 'text-(--ui-text-tertiary)': "grep -c 'text-\\(--ui-text-tertiary\\)' main--ssIraiQ.css → 8 (compiled)",
])
// Match the exact Tailwind v4 arbitrary-value shape: name + `-(` + `--token`
// + `)` (the `(` is immediately preceded by a dash and followed by the
// double dash — so inline `var(--x)` in styles must not false-positive).
for (const m of panel.matchAll(/[a-z][a-z0-9-]*-\(--[\w-]+\)/g)) {
  assert(PANE_ARB_ALLOW.has(m[0]),
    'pane uses arbitrary-value class ' + m[0] + ' with no compiled-in-host-CSS annotation (PANE_ARB_ALLOW)')
}

// --- rules 2 & 8: inline var(--token) whitelist, whole file ---------------
// The host defines only: --ui-* semantic layer, --dt-* paint layer,
// --radius-*/--shadow-*, and the three aliased bare names (host-tokens.md;
// styles.css :root aliases). Anything else is unconfigured at computed-value
// time. Scanning the CORE too: snapshotTheme is the sanctioned --dt-* reader,
// and the export stylesheet must keep embedding concrete values (ADR-0002) —
// a bare name anywhere is red, which subsumes the old per-name probe bans.
const TOKEN_OK = /^(?:--ui-[a-z0-9-]*|--dt-[a-z0-9-]*|--radius-[a-z0-9-]*|--shadow-[a-z0-9-]*|--(?:background|foreground|midground))$/
for (const m of src.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
  assert(TOKEN_OK.test(m[1]),
    'var(' + m[1] + ') names a token outside the host whitelist (--ui-*/--dt-*/--radius-*/--shadow-*/--background/--foreground/--midground)')
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
// self-proof of the carve-out (#19 item 4a): the exempted segment starts
// exactly at the function keyword, contains no other `function`, and the very
// next function (doDownloadHtml) is outside it — the exemption cannot widen.
const mdBody = panel.slice(mdStart, mdEnd)
assert(/^function exportMd\b/.test(mdBody), 'carve-out starts exactly at: function exportMd')
assert(!/\bfunction\b/.test(mdBody.slice('function exportMd'.length)),
  'carve-out contains only the exportMd body — another function leaked into the emoji exemption')
const panelNoMdExport = panel.slice(0, mdStart) + panel.slice(mdEnd)
for (const glyph of ['🔧', '👤', '🤖', '↑', '↓']) {
  assert.ok(!panelNoMdExport.includes(glyph),
    'pane must not render emoji glyph as an icon: ' + glyph + ' (use Codicon)')
}

// --- rule 9: pane toggles/fields are host primitives (#19 item 5) ----------
// Native checkboxes/inputs render the UA box: no host-theme tint (accentColor
// is one flat accent, not the --ui-accent token story), and the UA outline is
// the only focus cue — the host Checkbox (Radix) and Input ship compiled
// focus-visible classes in the host CSS, so story 14's visible ring works
// only through them. The pane must not create raw controls.
assert(!/type:\s*'checkbox'/.test(panel),
  "pane must not render a native checkbox (type: 'checkbox') — use the host Checkbox")
assert(!/['"]input['"]/.test(panel),
  "pane must not create a native 'input' element — use the host Input / SearchField")

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
// host never defines, so "follow the app theme" silently fell back to light
// (the bare-name ban now rides rule 8's whole-file whitelist). Only the
// positive assertions live here: the probe must READ the --dt-* family the
// host actually paints, with the frozen mechanism intact.
const probeStart = core.indexOf('function snapshotTheme')
const probeEnd = core.indexOf('function exportCss')
assert.ok(probeStart > 0 && probeEnd > probeStart, 'snapshotTheme located inside CORE')
const probe = core.slice(probeStart, probeEnd)
for (const n of ['--dt-background', '--dt-foreground', '--dt-border', '--dt-card', '--dt-accent', '--dt-muted-foreground', '--dt-muted']) {
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
