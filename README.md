# Hermes Chat Share

**English** · [简体中文](README.zh-CN.md)

![banner](docs/banner.png)

Share Hermes Desktop conversations as **long PNG screenshots, self-contained HTML, or Markdown** — pick exactly the turns you want, like [dsh-share](https://github.com/hellodigua/dsh-share) does for chat web, but built into Hermes Desktop. Single-file desktop plugin: zero dependencies, zero network, no build step.

![Export sample](sample.png)

## Install

> ✅ Officially listed in the **Hermes Agent plugin catalog** (community tier) — merged via [NousResearch/hermes-agent#144552](https://github.com/NousResearch/hermes-agent/pull/144552). Available in the docs at [hermes-agent.nousresearch.com/docs/plugins/hermes-chat-share](https://hermes-agent.nousresearch.com/docs/plugins/hermes-chat-share).

**Option A — Desktop plugin market (recommended)**

Hermes Desktop → **Capabilities → Plugins** → search **“Chat Share”** → **Install**. Version-pinned and integrity-checked by the official catalog.

**Option B — Install from Git**

Hermes Desktop → **Capabilities → Plugins → Install from Git** → paste:

```
smallmj/hermes-chat-share
```

tick the **Desktop UI** component, done — a share icon now sits on every conversation's title bar. Or open the [install deep link](hermes://plugin/install?repo=smallmj/hermes-chat-share).

<details>
<summary>Manual install</summary>

Drop `desktop/plugin.js` from this repo into the plugins folder **on the machine running the Desktop app** (folder name must be `hermes-chat-share`):

- macOS / Linux: `~/.hermes/desktop-plugins/hermes-chat-share/plugin.js`
- Windows: `%LOCALAPPDATA%\hermes\desktop-plugins\hermes-chat-share\plugin.js`

If the page doesn't show up: `⌘K / Ctrl+K` → `Reload desktop plugins`. On/off toggle under Capabilities → Plugins.
</details>

## Features

**Four entry points** — the share icon on each conversation's title bar (opens that conversation directly), the sidebar page, the command palette (`Share conversation`), and `Ctrl/Cmd+Shift+H`. The page follows the conversation you switch to; no refresh button, no stale state.

**Built for long conversations**
- **Turn gutter**: segmented rail on the right — one tick per turn, hover to preview the question, click to jump straight there. **Drag across ticks to select a contiguous range** of turns in one gesture.
- **Search**: matches questions and answers; `Enter` / `Shift+Enter` / ↑ ↓ cycle through hits with a `3/17` counter; each hit auto-expands and gets an accent outline.
- **Per-turn collapsing**: every turn shows just your question and the final answer; *expand (N more replies · M tool calls)* reveals the rest, per turn.
- **Share-scope checkbox**: uncheck “share full conversation” and **all three exports** contain only question + final answer — exactly what the collapsed view shows.

**Honest session metadata** — model & provider, thinking effort, cache hit rate, output speed (tok/s), token totals and Hermes version appear in the page header and in every export, read from the gateway's canonical `session.info`. Fields that aren't available are omitted, never invented.

**Exports**
- **PNG long image** at 680/880/1080 px wide, three font scales, 2× DPR, colors snapshotted from your live app theme (light *and* dark). Huge single replies are **split across pages automatically**, so a 10,000-line log dump can't silently truncate the image. Tall exports auto-paginate; multi-page downloads are **stitched back into one long PNG**, so the browser's one-download-per-page limit never eats pages.
- **Theme override** — force **light or dark** for the export regardless of your app theme (dark-app users sharing readable light images into group chats), with hand-calibrated fixed palettes. Code blocks are **syntax highlighted** (JS/TS, Python, JSON, Shell, HTML/XML, CSS) in both palettes.
- **Copy image** stays honest: multi-page exports are merged first, so the copied image holds as much as the browser canvas physically allows — rich-text base64 that pastes straight into WPS / Word / Google Docs. When a copy genuinely cannot happen — the merged image exceeds canvas limits, or desktop security policy blocks plugin clipboard writes — a dialog explains the exact reason and lets **you** choose *Download paginated PNGs* or *Cancel*. It never downloads behind your back.
- **Self-contained HTML**, **Markdown**, and **JSON** (machine-readable turns with the same share-scope rules as the visual exports), each a single file.
- **PDF as a direct download** — one click produces a real `.pdf` file (each page an embedded full-bleed image, zero dependencies, no print dialog).
- Keeps real rendering: code blocks, tables, quotes, inline code, tool-call chips (checkbox-controlled), timestamps. External images, `MEDIA:` attachments and `::preview` widgets become labeled placeholders in PNGs (canvas-taint rules) and keep their links in HTML/Markdown.
- **Your export prefs are remembered** (width, font, theme, toggles) and the export **title is editable** inline before you share.

**The UI follows the app language** (English / 简体中文 automatically), and dialogs are opaque and theme-correct in both modes.

## How it works

One `plugin.js` on top of the public [Desktop Plugin SDK](https://hermes-agent.nousresearch.com/docs/developer-guide/desktop-plugin-sdk) surfaces only: route, sidebar nav, titlebar action, palette commands, keybinds, i18n. No monkey-patching, no `eval`, no network, no third-party hosts. On-page rendering reuses the app's own markdown components; PNG export runs a self-contained XHTML pipeline (SVG `foreignObject` → canvas).

## Privacy

Everything runs locally inside your Desktop app. Conversation content never leaves your machine — clipboard and downloads are the only exits, and both need an explicit click. No telemetry, ever.

## Development

```bash
node --check desktop/plugin.js   # syntax
./dev-tests/stub-runner.sh       # SDK registration smoke test → STUB_OK
node dev-tests/meta.test.mjs     # metadata / color-scoping / export-scope unit tests
```

Git installs require the `desktop/plugin.js` layout at repo root — see the [plugin SDK docs](https://hermes-agent.nousresearch.com/docs/developer-guide/desktop-plugin-sdk).

## Known edges

- Very old archived sessions may lack live metadata — the meta line silently omits unavailable fields.
- PNGs cannot embed cross-origin raster images (browser canvas rules); HTML/Markdown keep them as links.
- One merged PNG is capped by browser canvas limits (≈65,535 px side / 268 M px total); beyond that, a dialog offers **paginated PNG download** or switching to HTML / Markdown / PDF for the whole content in one file.
- Garbled `�` diamonds in an export usually come from the **conversation data itself** (e.g. logs captured on Windows via `powershell Get-Content` decoding UTF-8 as GBK). The plugin renders the session byte-for-byte; fix the capture encoding at the source.

## License

[MIT](LICENSE) — use it, fork it, ship it. Not affiliated with Nous Research.
