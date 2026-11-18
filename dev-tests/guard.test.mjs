// Source-level guard for the SHARE PANE (ADR-0001 / spec #13 / ticket #15).
// Scans desktop/plugin.js from `==== CORE END ====` to EOF — the panel region
// this ticket owns. The export core (before the marker) has its own track
// (#16), so its probe fallbacks may legitimately name nonexistent vars.
//
// Rules:
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
// Carve-out: exportMd() lives in the panel region but writes an export
// artifact (Markdown headings) — that is the styling track's (#16) business,
// not a pane icon, so its body is excluded from rule 3 only. Rules 1-2 still
// scan it.
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
const mdStart = panel.indexOf('function exportMd')
const mdEnd = panel.indexOf('function doDownloadHtml')
assert.ok(mdStart > 0 && mdEnd > mdStart, 'exportMd body locatable for the emoji carve-out')
const panelNoMdExport = panel.slice(0, mdStart) + panel.slice(mdEnd)
for (const glyph of ['🔧', '👤', '🤖', '↑', '↓']) {
  assert.ok(!panelNoMdExport.includes(glyph),
    'pane must not render emoji glyph as an icon: ' + glyph + ' (use Codicon)')
}

console.log('GUARD_TEST_OK')
