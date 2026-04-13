#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# OrbitCraft – full pre-release build pipeline
#
# Usage:
#   ./scripts/build.sh [--no-tests] [--no-typecheck]
#
# Steps:
#   1. TypeScript type check   (tsc --noEmit)
#   2. Unit tests              (vitest run)
#   3. Production build        (vite build)
#
# Exit code: 0 on success, non-zero on first failure.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Colours ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

ok()   { echo -e "${GREEN}✔${RESET}  $*"; }
fail() { echo -e "${RED}✘${RESET}  $*" >&2; }
step() { echo -e "\n${CYAN}${BOLD}▶  $*${RESET}"; }
warn() { echo -e "${YELLOW}⚠${RESET}  $*"; }

# ── Flags ────────────────────────────────────────────────────────────────────
RUN_TESTS=true
RUN_TYPECHECK=true

for arg in "$@"; do
  case $arg in
    --no-tests)     RUN_TESTS=false ;;
    --no-typecheck) RUN_TYPECHECK=false ;;
    *) echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

# ── Repo root ─────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

START_TIME=$(date +%s)

echo -e "\n${BOLD}OrbitCraft — build pipeline${RESET}"
echo    "  Root:   $ROOT"
echo    "  Time:   $(date '+%Y-%m-%d %H:%M:%S')"

# ── 0. Check dependencies ────────────────────────────────────────────────────
step "Checking node_modules"
if [[ ! -d node_modules ]]; then
  warn "node_modules not found — running npm install"
  npm install
fi
ok "Dependencies present"

# ── 1. Type check ─────────────────────────────────────────────────────────────
if $RUN_TYPECHECK; then
  step "TypeScript type check"
  if npx tsc --noEmit; then
    ok "Type check passed"
  else
    fail "Type check FAILED"
    exit 1
  fi
else
  warn "Skipping type check (--no-typecheck)"
fi

# ── 2. Tests ──────────────────────────────────────────────────────────────────
if $RUN_TESTS; then
  step "Unit tests"
  if npx vitest run --reporter=verbose; then
    ok "All tests passed"
  else
    fail "Tests FAILED"
    exit 1
  fi
else
  warn "Skipping tests (--no-tests)"
fi

# ── 3. Production build ───────────────────────────────────────────────────────
step "Vite production build"
if npx vite build; then
  ok "Production build succeeded"
else
  fail "Build FAILED"
  exit 1
fi

# ── Summary ───────────────────────────────────────────────────────────────────
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo -e "\n${GREEN}${BOLD}✔  Pipeline complete in ${ELAPSED}s${RESET}"
echo    "   Output: ${ROOT}/dist/"
