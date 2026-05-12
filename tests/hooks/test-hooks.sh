#!/usr/bin/env bash
# tests/hooks/test-hooks.sh — .claude/hooks 존재·실행권한·등록·동작 검증.
# tests/run-all.sh 에서 assertion helper 를 import 함.
set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "${REPO_ROOT}"

# 1. 파일 존재
assert_file ".claude/settings.json"
assert_file ".claude/hooks/scrub-secrets.sh"
assert_file ".claude/hooks/changelog-reminder.sh"

# 2. 실행권한
assert_runnable ".claude/hooks/scrub-secrets.sh"
assert_runnable ".claude/hooks/changelog-reminder.sh"

# 3. settings.json 에 훅이 등록되어 있나
assert_grep "scrub-secrets" ".claude/settings.json"
assert_grep "changelog-reminder" ".claude/settings.json"

# 4. settings.json 에 deny list가 있나 (1+ 항목)
if [[ -f .claude/settings.json ]] && grep -q '"deny"' .claude/settings.json; then
  pass "settings.json has deny list"
else
  fail "settings.json has deny list"
fi

# 5. commit-msg 훅 동작 — Co-Authored-By Claude 제거
if [[ -x .git/hooks/commit-msg ]]; then
  TMP="$(mktemp)"
  cat > "$TMP" <<'MSG'
feat: test

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Human <human@example.com>
MSG
  bash .git/hooks/commit-msg "$TMP" >/dev/null 2>&1 || true
  if ! grep -q "Claude" "$TMP" && grep -q "Human" "$TMP"; then
    pass "commit-msg hook strips Claude, keeps Human"
  else
    fail "commit-msg hook strips Claude, keeps Human"
  fi
  rm -f "$TMP"
else
  skip "commit-msg hook not installed (run: bash scripts/install-hooks.sh)"
fi
