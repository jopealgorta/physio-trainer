#!/usr/bin/env bash
# Prepares Claude Code on the web sessions: installs dependencies so lint, typecheck and
# tests work immediately. Local sessions are left alone.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"
pnpm install --frozen-lockfile

# Use the sandbox's preinstalled Chromium for Playwright if present.
if [ -x /opt/pw-browsers/chromium ] && [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium" >> "$CLAUDE_ENV_FILE"
fi
