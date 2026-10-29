#!/usr/bin/env bash
# Stub smoke test: swap the SDK import for the stub, register(), assert contributions.
set -euo pipefail
cd "$(dirname "$0")/.."
sed -e "s|'@hermes/plugin-sdk'|'./stub-sdk.mjs'|" \
    -e "s|'react/jsx-runtime'|'./stub-react.mjs'|" \
    -e "s|from 'react'$|from './stub-react.mjs'|" \
    desktop/plugin.js > dev-tests/.plugin-copy.mjs
node --input-type=module -e "
Promise.all([import('./dev-tests/.plugin-copy.mjs'), import('./dev-tests/stub-sdk.mjs')]).then(async ([m, sdk]) => {
  const contribs = []
  const listeners = sdk.__eventListeners
  const ctx = {
    i18n: { register () {}, t: k => k, onLocaleChange () { return () => {} } },
    registerMany: arr => { contribs.push(...arr); return () => {} },
    onEvent: (type, fn) => { const s = listeners.get(type) ?? new Set(); s.add(fn); listeners.set(type, s); return () => s.delete(fn) }
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
  // The plugin must have subscribed to the session.info gateway event.
  if (!listeners.has('session.info') || !listeners.get('session.info').size) {
    console.error('session.info event not subscribed'); process.exit(1)
  }
  // Emitting one must not throw into the host dispatch.
  sdk.__emitGatewayEvent('session.info', { payload: { stored_session_id: 'sess-A', model: 'm1', provider: 'p1', reasoning_effort: 'high', version: 'v9', usage: { cache_hit_pct: 50, avg_tps: 10, total: 100 } } })
  console.log('STUB_OK', contribs.length, areas.join(','))
}).catch(e => { console.error('IMPORT/REGISTER FAILED:', e && e.stack || e); process.exit(1) })
"
rm -f dev-tests/.plugin-copy.mjs
