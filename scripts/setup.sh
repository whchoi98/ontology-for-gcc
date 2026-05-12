#!/usr/bin/env bash
# scripts/setup.sh — 신규 개발자용 1회 환경 셋업 스크립트.
#
# 가정: Python 3.12 + Node.js 20 + Docker + AWS CLI v2가 PATH에 있다.
# 실행: bash scripts/setup.sh [--skip-docker] [--skip-cdk]
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "${REPO_ROOT}"

SKIP_DOCKER=0
SKIP_CDK=0
for arg in "$@"; do
  case "$arg" in
    --skip-docker) SKIP_DOCKER=1 ;;
    --skip-cdk)    SKIP_CDK=1 ;;
    -h|--help)
      cat <<USAGE
Usage: bash scripts/setup.sh [--skip-docker] [--skip-cdk]

  --skip-docker  Docker daemon 검증 / 이미지 빌드 단계 생략.
  --skip-cdk     infra-cdk npm install 생략 (인프라 작업 안 하는 개발자용).
USAGE
      exit 0 ;;
    *) echo "✗ unknown arg: $arg" >&2; exit 2 ;;
  esac
done

step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }

step "Prerequisites"
for cmd in python3 node npm aws git; do
  if command -v "$cmd" >/dev/null; then ok "$cmd → $(command -v $cmd)"
  else warn "$cmd 없음 (필수)" && MISSING=1; fi
done
[[ ${MISSING:-0} -eq 1 ]] && { echo "✗ 필수 도구 누락. 설치 후 재실행." >&2; exit 1; }

step "Python deps (api + dev)"
python3 -m pip install --quiet --upgrade pip
python3 -m pip install --quiet -r api/requirements.txt
python3 -m pip install --quiet -r requirements-dev.txt
ok "api/requirements.txt + requirements-dev.txt 설치"

step "Web deps"
( cd web && npm install --silent ) && ok "web/node_modules"

if [[ ${SKIP_CDK} -eq 0 ]]; then
  step "CDK deps"
  ( cd infra-cdk && npm install --silent ) && ok "infra-cdk/node_modules"
fi

step "Git hooks"
bash scripts/install-hooks.sh

step ".env"
if [[ ! -f .env ]]; then
  cp .env.example .env
  warn ".env 생성됨 — Bedrock / Neptune / OpenSearch 엔드포인트 채우기 필요"
else
  ok ".env 이미 존재"
fi

step "Smoke tests"
python3 -m compileall -q api data scripts && ok "Python AST OK"
( cd web && npx tsc --noEmit ) && ok "Web TS OK"

if [[ ${SKIP_DOCKER} -eq 0 ]] && command -v docker >/dev/null; then
  step "Docker check"
  docker info >/dev/null 2>&1 && ok "Docker daemon reachable" \
    || warn "Docker daemon 미실행 (배포 시 필요)"
fi

cat <<EOF

\033[1;32m✓ Setup 완료\033[0m

다음 단계:
  1. .env 의 BEDROCK_* / NEPTUNE_* / OPENSEARCH_* 값을 채우세요.
  2. aws sso login --profile <profile> 후 'aws sts get-caller-identity' 검증.
  3. 로컬 API 실행:   uvicorn api.main:app --reload --port 8000
  4. 로컬 Web 실행:   cd web && npm run dev
  5. 풀 테스트 슈트:  bash tests/run-all.sh

문서:
  • CLAUDE.md             — 프로젝트 메모리·컨벤션
  • docs/onboarding.md    — 상세 온보딩 가이드
  • docs/architecture.md  — 아키텍처 (한/영)
  • docs/api-reference.md — REST/SSE 엔드포인트 레퍼런스

EOF
