#!/usr/bin/env bash
# Develop with live updates: serves the interface (with the Flask service) on http://localhost:PORT and
# keeps this checkout in step with GitHub. Every few seconds it fetches the branch you are on; when
# new commits arrive it fast-forwards to them, so the page reloads by itself (Vite hot reload).
# When the update touches dependencies or the Python service, it installs and restarts what needs it.
#
#   ./dev.sh            port 5190
#   ./dev.sh 5090       another port
#   QS_EVERY=10 ./dev.sh   check every 10 s (default 20)
#
# It never overwrites your work: if you have uncommitted changes or commits of your own on the branch,
# it says so and waits instead of pulling. Ctrl+C stops everything.
set -u
cd "$(dirname "$0")"
ROOT=$(pwd)
PORT=${1:-${QS_PORT:-5190}}
EVERY=${QS_EVERY:-20}
BRANCH=$(git rev-parse --abbrev-ref HEAD)
LAST=""
# say a waiting reason once, not at every check
once() { [ "$LAST" = "$1" ] || say "$1"; LAST="$1"; }
say() { printf '\033[2m[dev %s]\033[0m %s\n' "$(date +%H:%M:%S)" "$*"; }

# first run: Python environment and front-end dependencies
if [ ! -x .venv/bin/python ]; then
  say "creating .venv and installing requirements.txt (first run, a few minutes)"
  python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt || { say "python setup failed"; exit 1; }
fi
command -v pnpm >/dev/null || { say "pnpm is missing: npm i -g pnpm"; exit 1; }
[ -d web/node_modules ] || (cd web && pnpm install)

VITE=""
start() {
  (cd web && exec ./node_modules/.bin/vite --port "$PORT" --strictPort) &
  VITE=$!
  say "serving http://localhost:$PORT · following origin/$BRANCH every ${EVERY}s"
}
stop() { [ -n "$VITE" ] && kill "$VITE" 2>/dev/null && wait "$VITE" 2>/dev/null; VITE=""; }
trap 'stop; exit 0' INT TERM
start

while sleep "$EVERY"; do
  # the dev server died (e.g. a port clash or a crash): bring it back
  kill -0 "$VITE" 2>/dev/null || { say "dev server stopped; restarting"; start; continue; }
  git fetch -q origin "$BRANCH" 2>/dev/null || continue
  [ "$(git rev-parse HEAD)" = "$(git rev-parse "origin/$BRANCH")" ] && continue
  if ! git merge-base --is-ancestor HEAD "origin/$BRANCH"; then
    once "your branch has commits that are not on GitHub; not pulling (push or rebase them)"; continue
  fi
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    once "you have uncommitted changes; not pulling until they are committed or stashed"; continue
  fi
  LAST=""
  CHANGED=$(git diff --name-only HEAD "origin/$BRANCH")
  git merge -q --ff-only "origin/$BRANCH" || continue
  say "updated: $(git log -1 --format='%h %s')"
  RESTART=""
  if grep -qE '^web/(package\.json|pnpm-lock\.yaml)$' <<<"$CHANGED"; then
    say "dependencies changed: pnpm install"; (cd web && pnpm install --silent); RESTART=1
  fi
  if grep -q '^requirements\.txt$' <<<"$CHANGED"; then
    say "requirements changed: pip install"; .venv/bin/pip install -q -r requirements.txt; RESTART=1
  fi
  grep -qE '^(app/.*\.py|web/vite\.config\.ts)$' <<<"$CHANGED" && RESTART=1
  if [ -n "$RESTART" ]; then say "restarting the dev server and the service"; stop; start; fi
done
