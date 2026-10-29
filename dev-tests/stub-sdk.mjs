// Minimal stand-in for '@hermes/plugin-sdk' — just enough surface for the
// stub smoke test to import plugin.js, call register() and inspect contributions.
const mkAtom = v => {
  const subs = new Set()
  return { get: () => v, set: x => { v = x; for (const f of subs) f(v) }, subscribe: f => { subs.add(f); return () => subs.delete(f) } }
}
export const atom = mkAtom
export const host = {
  state: { focusedStoredSessionId: mkAtom('sess-A'), activeSessionId: mkAtom('sess-A') },
  request: async (method) => { if (method === 'session.history') return { messages: [] }; if (method === 'session.list') return { sessions: [] }; return {} },
  navigate: () => {},
  notify: () => {}
}
export const haptic = () => {}
export const useValue = a => (a && a.get ? a.get() : a)
export const ROUTES_AREA = 'routes'
export const SIDEBAR_NAV_AREA = 'sidebarNav'
export const PALETTE_AREA = 'palette'
export const KEYBINDS_AREA = 'keybinds'
export const TITLEBAR_AREAS = { center: 'titleBar.center', left: 'titleBar.left', right: 'titleBar.right' }
// UI components as string tags — the plugin only ever passes them to jsx().
export const Button = 'button'
export const Tip = 'span'
export const EmptyState = 'div'
export const GlyphSpinner = 'span'
export const MessageTextContent = 'div'
export const Codicon = 'i'
export const usePluginI18n = () => key => key
// Event tap (mirrors @/contrib/events): plugins subscribe via ctx.onEvent.
const eventListeners = new Map()
export const __emitGatewayEvent = (type, event) => { for (const f of eventListeners.get(type) ?? []) f(event) }
export const __eventListeners = eventListeners
