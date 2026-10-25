#!/usr/bin/env bash
# Stub smoke test: swap the SDK import for the stub, register(), assert contributions.
set -euo pipefail
cd "$(dirname "$0")/.."
sed -e "s|'@hermes/plugin-sdk'|'./stub-sdk.mjs'|" \
    -e "s|'react/jsx-runtime'|'./stub-react.mjs'|" \
    -e "s|from 'react'$|from './stub-react.mjs'|" \
    desktop/plugin.js > dev-tests/.plugin-copy.mjs
node --input-type=module -e "
import('./dev-tests/.plugin-copy.mjs').then(async m => {
  const contribs = []
  const ctx = {
    i18n: { register () {}, t: k => k, onLocaleChange () { return () => {} } },
    registerMany: arr => { contribs.push(...arr); return () => {} }
  }
  m.default.register(ctx)
  const areas = contribs.map(c => c.area)
  const need = ['routes', 'sidebarNav', 'titleBar.right', 'palette', 'keybinds']
  for (const a of need) {
    if (!areas.includes(a)) { console.error('MISSING AREA: ' + a); process.exit(1) }
  }
  if (contribs.length !== 7) { console.error('expected 7 contributions, got ' + contribs.length); process.exit(1) }
  const tb = contribs.find(c => c.area === 'titleBar.right')
  if (typeof tb.data.onSelect !== 'function' || !tb.data.icon) { console.error('titlebar tool malformed'); process.exit(1) }
  console.log('STUB_OK', contribs.length, areas.join(','))
}).catch(e => { console.error('IMPORT/REGISTER FAILED:', e && e.stack || e); process.exit(1) })
"
rm -f dev-tests/.plugin-copy.mjs
