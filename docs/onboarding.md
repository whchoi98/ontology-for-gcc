# Onboarding — Ontology GCC

> GS Caltex M&M본부 고객 온톨로지 PoC. 30-60분 데모를 위한 AWS Bedrock + AgentCore + Neptune 데모 시스템에 합류한 개발자용 가이드.

## 1. Prerequisites

| Tool | Version | Why |
|------|---------|-----|
| Python | 3.12+ | API 백엔드 (FastAPI) |
| Node.js | 20+ | 프론트 (Next.js 14) + CDK |
| Docker | 20+ | ARM64 멀티스테이지 빌드 |
| AWS CLI v2 | 최신 | 배포 + ECS 운영 |
| `cdk` | v2 | `npm install -g aws-cdk` 또는 `npx cdk` |
| `gh` (optional) | 최신 | PR 생성 / 이슈 관리 |

추가로 필요한 AWS 권한:
- **개발 / 빌드** : ECR push, ECS UpdateService, Logs read, Secrets read.
- **인프라 배포** : CloudFormation full, IAM PassRole, Lambda CreateFunction (Lambda@Edge).
- **데이터 로드** : Neptune `connect` (private subnet) → 반드시 one-shot ECS 태스크 경유.

## 2. First-time setup (자동)

```bash
bash scripts/setup.sh
```

위 스크립트가 처리하는 것:
1. Python deps (`api/requirements.txt` + `requirements-dev.txt`)
2. Web deps (`web/npm install`)
3. CDK deps (`infra-cdk/npm install`)
4. Git commit-msg 훅 설치 (Co-Authored-By Claude 자동 strip)
5. `.env.example` → `.env` 복사
6. AST 컴파일·TypeScript 타입 체크 smoke

## 3. .env 채우기

`.env`에서 다음 값을 환경에 맞게 갱신:

```bash
# Foundation models
BEDROCK_CHAT_MODEL_ID=global.anthropic.claude-sonnet-4-6
BEDROCK_EMBED_MODEL_ID=cohere.embed-v4
BEDROCK_RERANK_MODEL_ID=cohere.rerank-v3-5:0

# Graph DB
NEPTUNE_ENDPOINT=<cluster>.cluster-<id>.ap-northeast-2.neptune.amazonaws.com
NEPTUNE_PORT=8182

# Search
OPENSEARCH_HOST=<collection>.aoss.amazonaws.com
OPENSEARCH_INDEX=gcc-ontology

# Auth / 도메인
COGNITO_USER_POOL_ID=...
PUBLIC_DOMAIN=gcc-ontology.whchoi.net
REQUIRE_ORIGIN_AUTH=true   # 로컬 개발은 false 권장
DEMO_PUBLIC_MODE=false      # 로컬은 true 가능, 운영은 false
```

> 운영 기본값은 fail-closed (`REQUIRE_ORIGIN_AUTH=true`, `DEMO_PUBLIC_MODE=false`). 테스트 환경에서만 풉니다.

## 4. 로컬 실행

```bash
# API (FastAPI / SSE)
uvicorn api.main:app --reload --port 8000

# Web (Next.js dev server, http://localhost:3000)
cd web && npm run dev

# 통합 smoke test
pytest tests -q

# CDK 합성 (배포 X, 템플릿만)
cd infra-cdk && npx cdk synth
```

## 5. 디렉토리 지도

```
api/         FastAPI 서비스 (라우터 25개 + services 모듈)
web/         Next.js 14 App Router (라우트 14 시나리오 + objects + meta + cally popup)
infra-cdk/   AWS CDK 6 스택 (network, data, compute, ai, edge, observability)
data/        Synthetic generator + Neptune/OpenSearch 로더
ontology/    표준 매핑 (opinet, KFDA terms, GSC internal)
tests/       pytest smoke + integration + Jest CDK snapshot
scripts/     평가 / 시드 / 운영 헬퍼
docs/        ADR + runbook + architecture
.claude/     프로젝트 harness (settings, agents, skills, hooks, commands)
```

각 디렉토리에 `CLAUDE.md`가 있어 모듈별 컨벤션을 설명합니다.

## 6. 첫 PR 체크리스트

- [ ] `pytest tests -q` 그린.
- [ ] `cd web && npx tsc --noEmit` 그린.
- [ ] `python -m compileall -q api data scripts` 그린.
- [ ] CDK 변경이 있으면 `cd infra-cdk && npx jest` 그린 (snapshot 의도된 변경이면 `npx jest -u`).
- [ ] CLAUDE.md Auto-Sync Rules에 해당하면 관련 문서·라우터·시나리오 매핑 동기화.
- [ ] CHANGELOG.md에 한 줄 (EN + KR).
- [ ] commit-msg 훅 활성 — Co-Authored-By Claude 자동 제거 (자동).

## 7. 배포 (요약)

상세는 `docs/runbooks/`. 핵심 흐름:

```bash
# 이미지 빌드 + 푸시 (ARM64 필수)
ECR=061525506239.dkr.ecr.ap-northeast-2.amazonaws.com
TAG=v1.0.<patch>
docker build --platform linux/arm64 -f web/Dockerfile \
  --build-arg NEXT_PUBLIC_APP_VERSION=$TAG \
  -t $ECR/ontology-gcc-dev-web:$TAG -t $ECR/ontology-gcc-dev-web:latest .
docker push $ECR/ontology-gcc-dev-web:$TAG
docker push $ECR/ontology-gcc-dev-web:latest

# ECS 강제 롤아웃
aws ecs update-service \
  --cluster ontology-gcc-dev-cluster \
  --service ontology-gcc-dev-web \
  --force-new-deployment \
  --region ap-northeast-2
```

## 8. 디버깅 팁

- **Bedrock throttling** → `BEDROCK_CHAT_MODEL_ID=global.anthropic.claude-sonnet-4-6` cross-region inference profile 확인.
- **Neptune 연결 실패** → private subnet. 로컬에서 직접 못 닿음 → one-shot ECS 태스크.
- **OpenSearch 401** → Serverless data access policy + IAM role chain 확인.
- **CloudFront 403 / cookie invalid** → Lambda@Edge가 origin token 일치하는지 (Secrets Manager 키 회전 여부).
- **Pretendard 폰트 깨짐** → Noto Sans KR로 fallback (CLAUDE.md > Tech Stack 참고).

## 9. 다음 읽을 거리

- `CLAUDE.md` — 프로젝트 메모리, 5 부서 페르소나, 시나리오 A-N 매핑.
- `docs/architecture.md` — 풀 아키텍처 다이어그램.
- `docs/api-reference.md` — REST/SSE 엔드포인트.
- `docs/decisions/` — 8개 ADR.
- `SECURITY.md` — 데모 보안 트레이드오프 + 프로덕션 마이그레이션.
