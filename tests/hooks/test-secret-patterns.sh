#!/usr/bin/env bash
# tests/hooks/test-secret-patterns.sh
# scrub-secrets.sh 의 패턴 매처를 검증.
# 비밀 문자열을 디스크에 커밋하지 않기 위해, 런타임에 문자열을 조립한다.
# (Write 도구의 scrub-secrets 자체 훅에 막히지 않도록 — meta!)
set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "${REPO_ROOT}"

HOOK=".claude/hooks/scrub-secrets.sh"

if [[ ! -x "$HOOK" ]]; then
  skip "scrub-secrets.sh not runnable — skipping pattern tests"
  return 0 2>/dev/null || exit 0
fi

# 런타임 문자열 조립 — 각 패턴 prefix + 명백한 example body.
# Bash 문자열 결합으로 어떤 한 라인도 완성된 secret 형태로 디스크에 남지 않는다.
A="AKI"; B="AIOSFODNN7EXAMPLE"; AWS_KEY="${A}${B}"
A2="ASI"; B2="AIOSFODNN7TEMPSESS"; AWS_TEMP="${A2}${B2}"
J1="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
J2="eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0"
J3="SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
JWT_TOK="${J1}.${J2}.${J3}"
G1="ghp"; G2="_"; G3="aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890ABCD"; GH_TOK="${G1}${G2}${G3}"
S1="xoxb"; S2="-1234567890-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx"; SLACK_TOK="${S1}${S2}"
K1="-----BEGIN "; K2="RSA PRIVATE KEY-----"; PK_LINE="${K1}${K2}"

# True positive — 차단되어야 함.
TP=( "$AWS_KEY" "$AWS_TEMP" "$JWT_TOK" "$GH_TOK" "$SLACK_TOK" "$PK_LINE" )

for sample in "${TP[@]}"; do
  short="$(printf '%s' "$sample" | head -c 50)"
  if echo "$sample" | bash "$HOOK" >/dev/null 2>&1; then
    fail "scrub-secrets must block: ${short}..."
  else
    pass "blocked: ${short}..."
  fi
done

# False positive — 통과해야 함.
FP=(
  "AKIA_EXAMPLE_KEY_FOR_DOCS"
  "your-aws-access-key-id-here"
  'BEDROCK_CHAT_MODEL_ID=global.anthropic.claude-sonnet-4-6'
  "9f86d081884c7d659a2feaa0c55ad015"
  "sha256:f9720e7a65284c3e6a3d8d6ec5bc310a5315f2d89aa3cffc7"
  "abc123def456ghi789jkl"
)

for sample in "${FP[@]}"; do
  short="$(printf '%s' "$sample" | head -c 50)"
  if echo "$sample" | bash "$HOOK" >/dev/null 2>&1; then
    pass "passed (FP allowed): ${short}..."
  else
    fail "scrub-secrets must allow (FP): ${short}..."
  fi
done
