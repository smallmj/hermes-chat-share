// Tiny react stand-in for the stub smoke test (no rendering happens).
export const jsx = (type, props, key) => ({ type, props, key })
export const jsxs = (type, props, key) => ({ type, props, key })
export const useEffect = () => {}
export const useState = v => [v, () => {}]
export default { createElement: (t, p, ...c) => ({ type: t, props: { ...p, children: c } }) }
