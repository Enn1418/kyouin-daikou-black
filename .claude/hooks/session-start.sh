#!/bin/bash
# SessionStart hook — makes a fresh (or reset) session resume without manual setup.
#   1. installs npm dependencies so `npm run lint` / `npm run build` work immediately
#   2. prints .claude/RESUME.md so the session knows where the work stopped
set -euo pipefail

# Local machines already have their own setup; only do this in Claude Code on the web.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  echo "[session-start] installing npm dependencies…"
  npm install --no-audit --no-fund --loglevel=error
else
  echo "[session-start] node_modules is up to date; skipping npm install"
fi

echo ""
echo "=== 現在地 (.claude/RESUME.md) ==="
if [ -f .claude/RESUME.md ]; then
  cat .claude/RESUME.md
else
  echo "(RESUME.md がありません)"
fi
echo ""
echo "branch: $(git rev-parse --abbrev-ref HEAD)  head: $(git log --oneline -1)"
