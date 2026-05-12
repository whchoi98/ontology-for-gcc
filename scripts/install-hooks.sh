#!/usr/bin/env bash
# scripts/install-hooks.sh — 프로젝트 git hook 설치 스크립트.
#
# 설치되는 훅:
#   - commit-msg : 커밋 메시지에서 Co-Authored-By Claude / AI co-author 라인 자동 제거.
#                  Claude 같은 AI 어시스턴트가 git contributors 목록에 나타나지 않게 한다.
#
# 사용법:
#   bash scripts/install-hooks.sh          # repo 루트에서 실행
#   bash scripts/install-hooks.sh --force  # 기존 훅 있어도 덮어쓰기
#
# 멱등성: 같은 내용이면 no-op. 다른 훅이 이미 있으면 .bak 으로 백업.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
HOOK_DIR="${REPO_ROOT}/.git/hooks"
FORCE=0
[[ "${1:-}" == "--force" ]] && FORCE=1

if [[ ! -d "${REPO_ROOT}/.git" ]]; then
  echo "✗ .git/ 디렉토리가 없습니다. 'git init' 먼저 실행하세요." >&2
  exit 1
fi

mkdir -p "${HOOK_DIR}"

# commit-msg : Co-Authored-By Claude / AI co-author 라인 strip
HOOK_PATH="${HOOK_DIR}/commit-msg"
HOOK_BODY=$(cat <<'EOF'
#!/usr/bin/env bash
# commit-msg hook (auto-installed by scripts/install-hooks.sh)
# AI 어시스턴트 Co-Authored-By 라인 자동 제거 — git contributors에서 Claude 등 제외.
# 매칭 패턴: Co-Authored-By: ... Claude / Anthropic / Copilot / GPT / Cursor / AI
set -euo pipefail
MSG_FILE="$1"
[[ -f "$MSG_FILE" ]] || exit 0

# AI co-author 라인 제거 (case-insensitive, trailing whitespace 포함)
sed -i -E '/^[[:space:]]*Co-Authored-By:.*([Cc]laude|[Aa]nthropic|[Cc]opilot|[Gg][Pp][Tt]|[Cc]ursor|<noreply@anthropic\.com>|<ai@).*$/d' "$MSG_FILE"

# "🤖 Generated with Claude Code" 류의 푸터도 함께 제거
sed -i -E '/^[[:space:]]*🤖 Generated with .*[Cc]laude.*$/d' "$MSG_FILE"
sed -i -E '/^[[:space:]]*Generated with .*[Cc]laude Code.*$/d' "$MSG_FILE"

# 연속 빈 줄 정리 (제거 후 빈 줄 누적 방지)
awk 'BEGIN{blank=0} /^$/{blank++; if(blank<=1) print; next} {blank=0; print}' "$MSG_FILE" > "$MSG_FILE.tmp" && mv "$MSG_FILE.tmp" "$MSG_FILE"

exit 0
EOF
)

if [[ -f "${HOOK_PATH}" ]] && [[ ${FORCE} -eq 0 ]]; then
  if diff -q <(printf '%s\n' "${HOOK_BODY}") "${HOOK_PATH}" >/dev/null 2>&1; then
    echo "✓ commit-msg hook already installed (idempotent)"
  else
    BACKUP="${HOOK_PATH}.bak.$(date +%Y%m%d%H%M%S)"
    cp "${HOOK_PATH}" "${BACKUP}"
    printf '%s\n' "${HOOK_BODY}" > "${HOOK_PATH}"
    chmod +x "${HOOK_PATH}"
    echo "✓ commit-msg hook updated (existing backed up to ${BACKUP##*/})"
  fi
else
  printf '%s\n' "${HOOK_BODY}" > "${HOOK_PATH}"
  chmod +x "${HOOK_PATH}"
  echo "✓ commit-msg hook installed at ${HOOK_PATH#${REPO_ROOT}/}"
fi

echo ""
echo "다음 패턴이 커밋 메시지에서 자동 제거됩니다:"
echo "  • Co-Authored-By: ... Claude / Anthropic / Copilot / GPT / Cursor"
echo "  • 🤖 Generated with Claude Code"
echo ""
echo "검증: echo 'test\\n\\nCo-Authored-By: Claude <noreply@anthropic.com>' | bash ${HOOK_PATH#${REPO_ROOT}/} /dev/stdin"
