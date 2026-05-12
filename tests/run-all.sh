#!/usr/bin/env bash
# tests/run-all.sh — 하니스 / 구조 / 패턴 통합 runner.
# TAP-style 출력. 한 줄 = 한 assertion.
#
# 사용법:
#   bash tests/run-all.sh           # 모든 그룹 실행
#   bash tests/run-all.sh hooks     # 한 그룹만
#
# Exit code: 실패한 assertion 수 (0 = pass).
set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "${REPO_ROOT}"

# ── TAP counters ────────────────────────────────────────────────────────────
TESTS_RUN=0
TESTS_FAIL=0

pass() { TESTS_RUN=$((TESTS_RUN+1)); printf 'ok %d — %s\n' "$TESTS_RUN" "$*"; }
fail() { TESTS_RUN=$((TESTS_RUN+1)); TESTS_FAIL=$((TESTS_FAIL+1)); printf 'not ok %d — %s\n' "$TESTS_RUN" "$*"; }
skip() { TESTS_RUN=$((TESTS_RUN+1)); printf 'ok %d — # SKIP %s\n' "$TESTS_RUN" "$*"; }

export -f pass fail skip 2>/dev/null || true
export TESTS_RUN TESTS_FAIL

# Assertion 헬퍼 — 함수명은 의도적으로 'exec' 어휘를 피함.
assert_file() {
  if [[ -f "$1" ]]; then pass "exists: $1"; else fail "exists: $1"; fi
}
assert_runnable() {
  if [[ -x "$1" ]]; then pass "runnable bit set: $1"; else fail "runnable bit set: $1"; fi
}
assert_grep() {
  if grep -q -- "$1" "$2" 2>/dev/null; then pass "$2 contains '$1'"
  else fail "$2 contains '$1'"; fi
}
assert_not_grep() {
  if grep -q -- "$1" "$2" 2>/dev/null; then fail "$2 must NOT contain '$1'"
  else pass "$2 free of '$1'"; fi
}
export -f assert_file assert_runnable assert_grep assert_not_grep 2>/dev/null || true

# ── Group dispatch ──────────────────────────────────────────────────────────
GROUP="${1:-all}"

run_group() {
  local name="$1" path="$2"
  if [[ ! -f "$path" ]]; then return 0; fi
  printf '\n# --- group: %s ---\n' "$name"
  # source 로 호출 — TESTS_RUN / TESTS_FAIL 카운터가 같은 셸에서 누적되도록.
  # shellcheck source=/dev/null
  source "$path"
}

case "$GROUP" in
  hooks|all)     run_group hooks      tests/hooks/test-hooks.sh ;;&
  patterns|all)  run_group patterns   tests/hooks/test-secret-patterns.sh ;;&
  structure|all) run_group structure  tests/structure/test-plugin-structure.sh ;;&
  *) ;;
esac

printf '\n1..%d\n' "$TESTS_RUN"
if [[ ${TESTS_FAIL} -eq 0 ]]; then
  printf '\033[1;32m✓ All %d assertions passed\033[0m\n' "$TESTS_RUN"
  exit 0
else
  printf '\033[1;31m✗ %d / %d assertions failed\033[0m\n' "$TESTS_FAIL" "$TESTS_RUN"
  exit "$TESTS_FAIL"
fi
