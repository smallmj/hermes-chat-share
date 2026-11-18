# 分享面板配色一律绑定宿主 `--ui-*` 语义令牌

状态：已接受（v1.2.0）。决策方：#13 spec。

分享面板（Hermes 应用内的分享页面）在 v1.1.8 及之前把颜色写成裸直觉名（`--border`、`--card`、`--accent`、`--muted-foreground`、`--muted`）和 Tailwind 任意值类（`border-(--border)`、`bg-(--card)`、`text-(--muted-foreground)`、`accent-(--accent)`，源码里 24 处）。宿主的两条事实让这套写法整体失效，所以决定：面板的配色、描边、背景与悬停态一律走宿主 `--ui-*` 语义层（或内联 `var(--ui-*)`），禁止自绘色值，禁止裸直觉名。这不是审美偏好，而是唯一在宿主里能渲染的路径。

## 证据（2026-11-18 对 v1.1.8 与当时 hermes-agent checkout 验证）

- 宿主 `~/.hermes/hermes-agent/apps/desktop/src/styles.css` 的 `:root` 只别名了三个裸名：`--background`、`--foreground`、`--midground`（styles.css:593-594）。`--border` / `--card` / `--accent` / `--muted-foreground` / `--muted` **不存在**——引用它们按 unconfigured 处理：`border-color` 退到 `currentColor`，`background` 退到 `transparent`。
- 宿主对运行时插件不做 Tailwind 编译：插件源码里的任意值类不会生成 CSS。核实方法（对已安装的 dev 构建）：`cd ~/.hermes/hermes-agent/apps/desktop/dist/assets && grep -c 'text-\(--ui-text-tertiary\)' main--ssIraiQ.css` → 8（存在），`border-\(--border\)` → 0（不存在）；类名里的 `(` 在 CSS 选择器中转义为 `\(`。
- 后果是可观测的：卡片无边框与底色、分割线时有时无、导航槽不可见、选中轮次无描边、吸顶工具栏无背景。面板一半的视觉声明处于「类不存在 / 变量不存在」状态。
- SDK 文档口径一致（`desktop-plugin-sdk.md`）：*Style with theme variables, never hardcoded colors*；面板已在宿主 editor 背景上，不应再自设页背景。

## 决策的具体边界

- 可用：文本 `--ui-text-primary|secondary|tertiary|quaternary`；描边 `--ui-stroke-primary|secondary|tertiary|quaternary`；背景 `--ui-bg-*`、`--ui-base`、`--ui-surface-background`；交互态 `--ui-row-hover|active|open-background`、`--ui-control-hover|active-background`、`--ui-selection-background`；强调 `--ui-accent`、`--ui-accent-secondary` 与 `--ui-red|orange|…` 系列；圆角阴影用宿主已定义的 `--radius-*`、`--shadow-*`（styles.css:156-199）。
- 内联 `style` 里的 `var(--ui-*)` 永远有效（内联 var 不依赖预编译类）；Tailwind 类只允许宿主大量自用、必然已编译的标准工具类（flex/gap/px 等），以及经上述 grep 法核实存在的任意值类。拿不准就用内联样式。
- 画布与导出取色仍走宿主元素的计算样式探针（`getComputedStyle` 解析一次），机制不变；产物侧的配色轨道见 ADR-0002。

## 后果

- 换宿主任意主题或深浅模式，面板自动适配；插件不再维护自己的主题表，也不需要预览桩来验色。
- 代价：插件可见的类与变量以宿主已编译的集合为限。新增一条任意值类之前必须先 grep 核实它在宿主 CSS 里存在；这条纪律由源码级守卫（`dev-tests/guard.test.mjs` 扫禁用裸名与未编译任意值类）兜住，避免失效样式回流。
- 「直觉命名」在别的仓库里通常是正确的（shadcn/Radix 那一套 `--border`、`--card`），在这里是错的——未来读者若看到面板里出现硬编码色值或裸名，那即是本次要消灭的失效模式，不是风格分歧。
