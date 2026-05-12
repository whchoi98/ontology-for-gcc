#!/usr/bin/env bash
# tests/structure/test-plugin-structure.sh
# 프로젝트 구조 / manifest / CLAUDE.md 필수 섹션 검증.
set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "${REPO_ROOT}"

# 1. 루트 manifest 파일
assert_file "CLAUDE.md"
assert_file "README.md"
assert_file "CHANGELOG.md"
assert_file "SECURITY.md"
assert_file ".env.example"
assert_file ".gitignore"
assert_file ".mcp.json"

# 2. CLAUDE.md 핵심 섹션
assert_grep "## Tech Stack" "CLAUDE.md"
assert_grep "## Project Structure" "CLAUDE.md"
assert_grep "## Auto-Sync Rules" "CLAUDE.md"
assert_grep "## Conventions" "CLAUDE.md"

# 3. 모듈 CLAUDE.md 존재 — 디렉토리가 있으면 CLAUDE.md 도 있어야 함.
for d in api web infra-cdk data ontology tests scripts; do
  if [[ -d "$d" ]]; then
    assert_file "$d/CLAUDE.md"
  fi
done

# 4. docs 핵심 문서
assert_file "docs/architecture.md"
assert_file "docs/api-reference.md"
assert_file "docs/onboarding.md"
assert_file "docs/decisions/.template.md"
assert_file "docs/runbooks/.template.md"

# 5. ADR 명명 규칙 (NNNN-<slug>.md 또는 .template.md)
if [[ -d docs/decisions ]]; then
  while IFS= read -r f; do
    base="$(basename "$f")"
    if [[ "$base" == ".template.md" ]] || [[ "$base" =~ ^[0-9]{4}-.+\.md$ ]]; then
      pass "ADR naming OK: $base"
    else
      fail "ADR naming violation: $base"
    fi
  done < <(find docs/decisions -maxdepth 1 -name "*.md" 2>/dev/null)
fi

# 6. .claude 디렉토리 구조
assert_file ".claude/settings.json"
for sub in agents commands hooks skills; do
  if [[ ! -d ".claude/$sub" ]]; then
    fail ".claude/$sub directory exists"
  else
    pass ".claude/$sub directory exists"
  fi
done

# 7. 에이전트에 model 명시
for f in .claude/agents/*.md; do
  [[ -f "$f" ]] || continue
  assert_grep "^model:" "$f"
done

# 8. scripts 실행권한
for s in scripts/install-hooks.sh scripts/setup.sh; do
  if [[ -f "$s" ]]; then assert_runnable "$s"; fi
done
