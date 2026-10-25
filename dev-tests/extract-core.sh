#!/usr/bin/env bash
# Re-extract the CORE block from plugin.js into a runnable ESM module,
# auto-exporting every top-level function found inside it.
set -euo pipefail
cd "$(dirname "$0")/.."
awk '/==== CORE START/,/==== CORE END/' desktop/plugin.js | sed '1d;$d' > dev-tests/core.mjs
funcs=$(grep -oE '^(async )?function [A-Za-z0-9_]+' dev-tests/core.mjs | awk '{print $NF}' | paste -sd, -)
printf '\nexport { %s }\n' "$funcs" >> dev-tests/core.mjs
echo "CORE_EXTRACTED $(echo "$funcs" | tr ',' ' ')"
