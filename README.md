# chat-share — Hermes Desktop 对话分享插件 / conversation sharing plugin

[中文](#中文) · [English](#english)

![sample](sample.png)

## 中文

把 Hermes 对话按轮次多选后导出为 **长截图 PNG / 自包含 HTML / Markdown**，功能对标 DeepSeek Harness 的 [dsh-share](https://github.com/hellodigua/dsh-share)。单文件桌面插件，零依赖、零联网、无需构建。

### 功能
- 侧边栏「分享对话」页 / `⌘K` 命令 / 快捷键 `Ctrl+Shift+H`（可自定义）
- 按轮次多选：全选 / 清空 / 反选；保留 Markdown、代码块、表格、引用、工具调用圆片、时间戳
- 图片宽度 680 / 880 / 1080px 三档，字号三档，主题配色自动快照当前 App 主题
- 长图超过 ~7600px 自动分页（文件名 `-01`、`-02`…，2× DPR 高清）
- 「复制图片」直接进剪贴板；「下载长图 / HTML / Markdown」走系统下载
- 长图中外链图片、附件（`MEDIA:`）、内嵌组件（`::preview`）替换为占位标签；HTML 导出保留图片链接
- 界面中英文随 App 语言切换

### 安装（两种方式任选）
**方式一 · Git 一键安装（推荐）**
1. Hermes Desktop → `Capabilities → Plugins → Install from Git`
2. 填 `smallmj/hermes-chat-share`（或完整 URL），组件勾选 **Desktop UI**
   （或直接点 [一键安装链接](hermes://plugin/install?repo=smallmj/hermes-chat-share)）

**方式二 · 手动放置**
把本仓库 `desktop/` 目录里的 `plugin.js` 放进桌面 App **所在机器**的插件目录（App 自动加载、改动热重载），文件夹名需与插件 id 一致（`hermes-chat-share`）：
- macOS / Linux：`~/.hermes/desktop-plugins/hermes-chat-share/plugin.js`
- Windows：`%LOCALAPPDATA%\hermes\desktop-plugins\hermes-chat-share\plugin.js`

没有出现就 `⌘K` → `Reload desktop plugins`；开关在 Capabilities → Plugins。

### 已知边界
- 只分享当前聚焦的会话（切会话后点「刷新」）
- 长图不含外链图片（防画布污染），HTML / Markdown 保留原始链接
- 导出用内置轻量 Markdown 子集（标题/加粗/斜体/删除线/列表/表格/引用/代码围栏/链接/图片），复杂语法按普通文本处理

### 隐私
渲染与导出全部发生在桌面 App 本地（Electron），对话内容不经过任何外部服务。

### License
[MIT](LICENSE) · 开发者工具，与 Nous Research 无隶属关系

---

## English

Select conversation turns and export them as a **long PNG screenshot, self-contained HTML, or Markdown** — the Hermes Desktop counterpart of [dsh-share](https://github.com/hellodigua/dsh-share). Single-file plugin: no dependencies, no build, no network.

### Features
- Sidebar page / command palette (`Share conversation`) / keybind `Ctrl+Shift+H`
- Per-turn selection (all / none / invert); keeps markdown, code blocks, tables, quotes, tool-call chips, timestamps
- Image width 680 / 880 / 1080 px, three font scales, colors snapshot your current app theme
- Auto-paginates tall exports (`-01`, `-02`, …) at 2× DPR
- Copy image to clipboard, or download PNG / HTML / Markdown
- External images, `MEDIA:` attachments and `::preview` widgets become placeholders in PNG (HTML/MD keep them)
- UI follows the app language (en / 简体中文)

### Install
**Git (recommended):** Capabilities → Plugins → Install from Git → `smallmj/hermes-chat-share`, pick the **Desktop UI** component.
**Manual:** copy `desktop/plugin.js` into `~/.hermes/desktop-plugins/hermes-chat-share/` (Windows: `%LOCALAPPDATA%\hermes\desktop-plugins\hermes-chat-share\`) **on the machine running the desktop app**, then ⌘K → *Reload desktop plugins*.

### Notes
- Shares the currently focused session (hit Refresh after switching).
- PNG export excludes external images to keep the canvas untainted; HTML/MD exports keep them.
- MIT licensed; not affiliated with Nous Research.
