# Plan 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap `ontology-for-gcc` from `ontology-for-mfg` (fork) + `ontology-for-retail` (overlay 성숙 자산), then deploy 6-stack AWS CDK so an empty home page returns 200 OK on `*.cloudfront.net` after Cognito 쿠키 인증.

**Architecture:** mfg 디렉토리 구조 복사 → mfg→gcc identifier 치환 → retail의 CI 4-job/eval 템플릿/.harness-eval/ADR 포맷 오버레이 → CDK 6-stack 수정 (network는 retail VPC import, 나머지는 GCC 전용 자원). 도메인·ACM 없이 첫 배포.

**Tech Stack:** Bash, Python 3.12, Node.js 20, AWS CDK v2 (TypeScript) — Fargate ARM64, Neptune, OpenSearch Serverless, CloudFront, Cognito, Lambda@Edge, Bedrock, AgentCore.

**Spec reference:** `docs/superpowers/specs/2026-05-08-ontology-gcc-design.md` (Phase 0 + Phase 1).

---

## File Structure

이 plan에서 생성·수정되는 파일 (Phase 0·1 한정):

### 루트 메타 (Phase 0 — copy from mfg, then rewrite)
- `CLAUDE.md` — GCC-specific (mfg의 4-line CLAUDE.md를 retail 패턴 수준의 ~280 line으로 확장)
- `README.md` — 한·영 양국어 (retail 구조 차용)
- `SECURITY.md` — retail에서 overlay
- `CHANGELOG.md` — Conventional Commits 헤더 + 첫 entry
- `.env.example` — GCC env vars (mfg에서 복사 후 swap)
- `.gitignore` — `raw_data/`·`.venv/`·`.harness-eval/cache/` 추가
- `.editorconfig`·`.mcp.json` — retail에서 overlay 그대로
- `requirements-dev.txt` — pytest, ruff, mypy

### `.claude/` (Phase 0 — overlay from retail)
- `settings.json` — 60-entry deny list + hooks 등록
- `agents/{code-reviewer,security-auditor}.md`
- `hooks/{scrub-secrets,changelog-reminder}.sh`
- `commands/{deploy,review,test-all}.md`
- `skills/{wow-query-eval,cypher-conventions}.md`

### `.github/workflows/ci.yml` (Phase 0 — overlay from retail) — 4-job

### `.harness-eval/` (Phase 0 — initialized) — `latest.json` baseline

### `infra-cdk/` (Phase 1 — modify mfg-forked)
- `bin/gcc.ts` — 엔트리, 6 스택 인스턴스화
- `lib/network-stack.ts` — `Vpc.fromVpcAttributes`/`fromLookup`로 retail VPC import + GCC 전용 SG
- `lib/data-stack.ts` — Neptune·OpenSearch·S3 (GCC 전용)
- `lib/compute-stack.ts` — ECS·ALB (GCC 전용)
- `lib/ai-stack.ts` — Bedrock KB·Guardrails·AgentCore Memory
- `lib/edge-stack.ts` — CloudFront·L@E·Cognito (도메인 옵셔널)
- `lib/observability-stack.ts` — CloudWatch dashboards·alarms
- `test/stacks.test.ts` — 6 스택 Jest snapshot
- `cdk.json`·`package.json`·`tsconfig.json`·`jest.config.ts`

### `api/` (Phase 1 — minimal stub)
- `main.py` — FastAPI app + `/healthz`
- `config.py` — Pydantic Settings
- `aws_clients.py` — `@lru_cache` boto3 session
- `middleware_auth.py` — Cognito JWT verifier (skeleton)
- `requirements.txt`·`Dockerfile`

### `web/` (Phase 1 — minimal stub)
- `app/layout.tsx`·`app/page.tsx` — 빈 홈 (Sidebar stub)
- `components/Sidebar.tsx` — 12 시나리오 + 22 객체 plain link list
- `lib/api-client.ts` — 타입 안전 SSE+REST skeleton
- `package.json`·`next.config.mjs`·`tsconfig.json`·`tailwind.config.ts`·`Dockerfile`

### `tests/` (Phase 1)
- `conftest.py` — env defaults + DEMO_PUBLIC_MODE
- `test_smoke.py` — 라우터 import smoke (현재는 main만)
- `api/test_healthz.py` — `/healthz` httpx 통합

### `scripts/` (Phase 1)
- `cognito-update-callbacks.sh` — 안전 PUT (전체 config 머지 후 갱신)
- `cognito-provision.sh` — `admin@whchoi.net`·`demo@whchoi.net` 사용자 생성
- `eval_wow_queries.py` — 평가 템플릿 (이번 plan에서는 케이스 없음)

### `docs/` (Phase 1)
- `decisions/.template.md` — ADR 템플릿 (retail에서 overlay)
- `decisions/0001-retail-vpc-import.md` — 신규 ADR
- `decisions/0002-domain-deferred-deployment.md` — 신규 ADR
- `decisions/0003-bulk-loader-iam-prep.md` — 신규 ADR (Phase 2 대비 사전 결정)
- `runbooks/01-first-deployment.md`·`02-add-custom-domain.md`
- `api-reference.md` — Phase 1엔 `/healthz`만 명시

---

## Phase 0: Bootstrap

작업 디렉토리 가정: 모든 명령은 `/home/ec2-user/my-project/ontology-for-gcc/` 기준 (`pwd`로 확인).

### Task 0.1: mfg 디렉토리 구조 복사 + 기존 자산 보존

**Files:**
- Create: copy `../ontology-for-mfg/` 모든 디렉토리·파일을 현 디렉토리로 (이미 있는 `.claude/`·`raw_data/`는 보존)
- Modify: `.gitignore` (덮어쓰지 말고 mfg의 항목 + GCC 추가 항목)

- [ ] **Step 1: 현 디렉토리 상태 확인**

```bash
pwd
ls -la
```
Expected: `/home/ec2-user/my-project/ontology-for-gcc`. `.claude/`·`raw_data/`·`docs/`만 존재.

- [ ] **Step 2: mfg 자산을 임시 staging으로 복사**

```bash
cp -a ../ontology-for-mfg/. /tmp/gcc-stage/
ls /tmp/gcc-stage/ | head -30
```
Expected: `api`·`web`·`infra-cdk`·`data`·`ontology`·`tests`·`scripts`·`docs`·`tools`·`Makefile`·`README.md`·`CLAUDE.md`·`SECURITY.md`·`CHANGELOG.md`·`requirements*.txt`·`.gitignore`·`.git`(있을 수 있음)·`.pytest_cache`(있을 수 있음).

- [ ] **Step 3: staging에서 캐시·git·생성 산출물 제외하고 GCC로 복사**

```bash
cd /tmp/gcc-stage
rm -rf .git .pytest_cache .ruff_cache .venv graphify-out
cd /home/ec2-user/my-project/ontology-for-gcc
cp -an /tmp/gcc-stage/. .   # -n: clobber 금지 — 기존 .claude/·raw_data/·docs/ 보존
ls -la
```
Expected: `api`·`web`·`infra-cdk`·`data`·`ontology`·`tests`·`scripts`·`tools`·`Makefile`·`README.md` 등 mfg 자산 + 기존 `docs/superpowers/specs/`·`raw_data/`·`.claude/`.

- [ ] **Step 4: staging 정리**

```bash
rm -rf /tmp/gcc-stage
```

- [ ] **Step 5: 새 디렉토리 트리 검증**

```bash
find . -maxdepth 2 -type d | sort | head -40
```
Expected: `./.claude` `./api` `./api/services` `./data` `./docs` `./docs/superpowers` `./infra-cdk` `./infra-cdk/lib` `./ontology` `./raw_data` `./scripts` `./tests` `./tools` `./web` `./web/app` 등.

---

### Task 0.2: project identifier 일괄 치환 (`mfg` → `gcc`, `Mfg`/`MFG` → `Gcc`/`GCC`)

**Files:** all source files (api/*.py, web/**/*.tsx, infra-cdk/**/*.ts, package.json, Dockerfile, README.md, CLAUDE.md 등). 단 `raw_data/` 제외.

- [ ] **Step 1: 치환 영향 범위 확인 (dry-run)**

```bash
grep -rln --exclude-dir=raw_data --exclude-dir=node_modules --exclude-dir=.git \
  -E "ontology-mfg|ontology-for-mfg|mfg-ontology|MFG\b|^Mfg|\\bmfg\\b" . | head -50
```
Expected: 50줄 미만의 파일 리스트가 나와야 함 (package.json·CDK·README·CLAUDE·env.example·docker tag 등).

- [ ] **Step 2: 안전 치환 (대소문자 페어 단위)**

```bash
# 1) ontology-for-mfg → ontology-for-gcc
grep -rl --exclude-dir=raw_data --exclude-dir=node_modules --exclude-dir=.git \
  "ontology-for-mfg" . | xargs sed -i 's/ontology-for-mfg/ontology-for-gcc/g'

# 2) ontology-mfg → ontology-gcc
grep -rl --exclude-dir=raw_data --exclude-dir=node_modules --exclude-dir=.git \
  "ontology-mfg" . | xargs sed -i 's/ontology-mfg/ontology-gcc/g'

# 3) mfg-ontology → gcc-ontology
grep -rl --exclude-dir=raw_data --exclude-dir=node_modules --exclude-dir=.git \
  "mfg-ontology" . | xargs sed -i 's/mfg-ontology/gcc-ontology/g'

# 4) MFG (대문자 단어 경계) → GCC
grep -rl --exclude-dir=raw_data --exclude-dir=node_modules --exclude-dir=.git \
  "\bMFG\b" . | xargs sed -i 's/\bMFG\b/GCC/g'
```

- [ ] **Step 3: 치환 누락 확인 — `mfg` 단어 경계로 다시 grep**

```bash
grep -rln --exclude-dir=raw_data --exclude-dir=node_modules --exclude-dir=.git \
  -E "\bmfg\b|\bMfg\b|\bMFG\b|ontology-mfg|mfg-ontology" . || echo "ALL CLEAN"
```
Expected: `ALL CLEAN` 또는 잔여 매칭이 *raw_data/*·*docs/*(제외해도 되는 컨텍스트)뿐.

- [ ] **Step 4: 잔여 수동 정리 (Hi-Tech MFG · 22 클래스 라벨 등)**

mfg-specific 도메인 라벨(`Hi-Tech`·`AMZN Tech`·`Buyer/Engineer/Quality/SCM/Plant`)은 자동 치환에서 빠짐. 다음 grep으로 list업:
```bash
grep -rln --exclude-dir=raw_data --exclude-dir=node_modules --exclude-dir=.git \
  -E "Hi-Tech|AMZN Tech|Buyer/Engineer|/SCM/Plant" . || echo "NONE"
```
이 파일들은 Task 0.5·0.6·0.7에서 새로 작성하므로 지금은 list만 남겨놓고 다음 step으로 진행.

- [ ] **Step 5: 컴파일 가능성 빠른 확인**

```bash
python3 -m compileall -q api data scripts 2>&1 | head -20 || true
```
Expected: 에러 없거나 import 실패만 (라이브러리 미설치는 OK). syntax 에러는 안 됨.

---

### Task 0.3: retail의 CI workflow 오버레이

**Files:**
- Create/Replace: `.github/workflows/ci.yml`

- [ ] **Step 1: retail의 CI workflow 그대로 복사**

```bash
mkdir -p .github/workflows
cp ../ontology-for-retail/.github/workflows/ci.yml .github/workflows/ci.yml
```

- [ ] **Step 2: workflow 내 retail 식별자 → gcc 치환**

```bash
sed -i 's/ontology-retail/ontology-gcc/g' .github/workflows/ci.yml
sed -i 's/ontology-for-retail/ontology-for-gcc/g' .github/workflows/ci.yml
grep -E "name:|jobs:" .github/workflows/ci.yml | head -10
```
Expected: `name:`·`jobs:` 라인이 정상 표시되고 retail 잔여 없음.

- [ ] **Step 3: 4-job 구조 검증**

```bash
yq '.jobs | keys' .github/workflows/ci.yml 2>/dev/null || \
  python3 -c "import yaml; d=yaml.safe_load(open('.github/workflows/ci.yml')); print(list(d['jobs'].keys()))"
```
Expected: `['python-ast', 'tsc-check', 'cdk-synth', 'pytest']` (또는 동등).

- [ ] **Step 4: concurrency 설정 확인**

```bash
grep -A3 "^concurrency:" .github/workflows/ci.yml
```
Expected: `cancel-in-progress: true` 포함.

---

### Task 0.4: retail의 .harness-eval / 평가 스크립트 / ADR 템플릿 오버레이

**Files:**
- Create: `.harness-eval/latest.json`·`.harness-eval/history/` (디렉토리)
- Create: `scripts/eval_wow_queries.py` (템플릿 — 케이스 비어있는 상태)
- Create: `docs/decisions/.template.md`

- [ ] **Step 1: .harness-eval 베이스라인 복사 후 점수 reset**

```bash
mkdir -p .harness-eval/history
cp ../ontology-for-retail/.harness-eval/latest.json .harness-eval/latest.json
```

- [ ] **Step 2: latest.json 점수를 baseline (0/F)로 reset**

`latest.json`을 다음 내용으로 덮어쓰기:

```bash
cat > .harness-eval/latest.json <<'EOF'
{
  "project": "ontology-for-gcc",
  "evaluatedAt": "2026-05-08T00:00:00Z",
  "score": 0.0,
  "grade": "F",
  "dimensions": {},
  "note": "baseline before any harness-eval run"
}
EOF
cat .harness-eval/latest.json
```
Expected: 출력에 `"project": "ontology-for-gcc"`·`"score": 0.0` 표시.

- [ ] **Step 3: README 배지가 자동 생성되도록 마커 토큰 설정** (이번 task에서 README는 Task 0.7에서 작성하므로 마커만 메모)

마커 패턴: `<!-- harness-eval-badge:start -->` ~ `<!-- harness-eval-badge:end -->` (retail 패턴). README 작성 시 해당 위치에 삽입 필요.

- [ ] **Step 4: 평가 스크립트 템플릿 복사 + GCC 식별자 치환**

```bash
mkdir -p scripts
cp ../ontology-for-retail/scripts/eval_wow_queries.py scripts/eval_wow_queries.py
sed -i 's/ontology-retail/ontology-gcc/g' scripts/eval_wow_queries.py
sed -i 's/ontology_retail/ontology_gcc/g' scripts/eval_wow_queries.py
```

- [ ] **Step 5: 케이스 리스트를 빈 배열로 reset (Plan 3~4에서 시나리오 별로 채움)**

`scripts/eval_wow_queries.py` 내 `WOW_QUERIES = [...]`를 찾아 빈 리스트로 교체:
```python
# 기존: WOW_QUERIES = [{...}, {...}, ...]
# 교체: 
WOW_QUERIES: list[dict] = []  # populated by Plan 3 (시나리오 A) and Plan 4 (B-L)
```

- [ ] **Step 6: ADR 템플릿 복사**

```bash
mkdir -p docs/decisions
cp ../ontology-for-retail/docs/decisions/.template.md docs/decisions/.template.md
ls docs/decisions/
```
Expected: `.template.md` 표시.

- [ ] **Step 7: 평가 스크립트 dry-run (케이스 0개 → exit 0)**

```bash
python3 scripts/eval_wow_queries.py --dry-run 2>&1 | tail -5 || true
```
Expected: 0 cases evaluated, no error, exit 0.

---

### Task 0.5: `.claude/` 하니스 (agents·hooks·commands·skills·settings) 오버레이

**Files:**
- Create/Replace: `.claude/settings.json`
- Create: `.claude/agents/code-reviewer.md`·`security-auditor.md`
- Create: `.claude/hooks/scrub-secrets.sh`·`changelog-reminder.sh`
- Create: `.claude/commands/deploy.md`·`review.md`·`test-all.md`
- Create: `.claude/skills/wow-query-eval.md`·`cypher-conventions.md`

- [ ] **Step 1: 기존 `.claude/settings.local.json`이 있으면 보존, retail의 `.claude/` 그대로 복사**

```bash
cp -an ../ontology-for-retail/.claude/. .claude/
ls -la .claude/
```
Expected: `agents/`·`hooks/`·`commands/`·`skills/`·`settings.json`·기존 `settings.local.json` 그대로.

- [ ] **Step 2: settings.json 내 retail 식별자 치환**

```bash
sed -i 's/ontology-retail/ontology-gcc/g' .claude/settings.json
sed -i 's/retail-ontology/gcc-ontology/g' .claude/settings.json
grep -E "ontology|deny|hook" .claude/settings.json | head -10
```
Expected: deny list와 hooks 등록이 보임. ontology-retail 잔여 없음.

- [ ] **Step 3: 모든 .claude 자식 파일에 retail→gcc 치환**

```bash
grep -rl "ontology-retail\|retail-ontology" .claude/ | xargs sed -i \
  -e 's/ontology-retail/ontology-gcc/g' \
  -e 's/retail-ontology/gcc-ontology/g'
grep -rl "ontology-retail\|retail-ontology" .claude/ || echo "ALL CLEAN"
```
Expected: `ALL CLEAN`.

- [ ] **Step 4: 60-entry deny list 카운트 확인**

```bash
python3 -c "import json; d=json.load(open('.claude/settings.json')); print('deny count:', len(d.get('permissions',{}).get('deny',[])))"
```
Expected: deny count >= 60.

- [ ] **Step 5: scrub-secrets.sh 실행 권한**

```bash
chmod +x .claude/hooks/*.sh
ls -l .claude/hooks/
```
Expected: 모든 .sh 파일이 `-rwxr-xr-x`.

- [ ] **Step 6: hooks가 실제로 호출되는지 dry-run (가짜 입력)**

```bash
echo '{"toolName":"Write","input":{"content":"AKIAFAKE12345"}}' | bash .claude/hooks/scrub-secrets.sh 2>&1 | head -5 || true
```
Expected: 차단 메시지 또는 stderr exit non-zero (정확한 메시지는 hook 구현에 따라 다름, 핵심은 실행 자체가 실패하지 않음).

---

### Task 0.6: GCC CLAUDE.md 작성 (retail 패턴 ~280 line 수준)

**Files:**
- Create/Replace: `CLAUDE.md`

- [ ] **Step 1: retail CLAUDE.md를 베이스로 복사 + 식별자 치환**

```bash
cp ../ontology-for-retail/CLAUDE.md CLAUDE.md
sed -i 's/ontology-retail/ontology-gcc/g' CLAUDE.md
sed -i 's/retail-ontology/gcc-ontology/g' CLAUDE.md
sed -i 's|`https://retail-ontology|`https://gcc-ontology|g' CLAUDE.md
```

- [ ] **Step 2: Project 섹션 — GCC 도메인 설명으로 교체**

`CLAUDE.md`의 `## Project` 섹션을 다음으로 교체:

```markdown
## Project

`ontology-gcc` is a 30–60 minute proof-of-concept demo for a GS Caltex (GSC) M&M본부 customer ontology that powers twelve wow scenarios on AWS Bedrock + AgentCore + Neptune. It is a multi-runtime monorepo: Python FastAPI backend, Next.js 14 frontend, AWS CDK infrastructure, and a synthetic-data loader that doubles as a one-shot ECS task.

Custom domain (manual post-deploy): `https://gcc-ontology.whchoi.net` (CloudFront + Lambda@Edge cookie auth → Cognito). Demo users: `admin@whchoi.net` / `demo@whchoi.net` (PW `!234Qwer`).

The five-department spine (마케팅 / 고객전략 / 데이터·AI / CRM·회원사업 / 리테일영업) drives every demo path. Scenarios A–L plus the knowledge-graph object explorer (22 classes) must remain coherent for the same persona context.

Network: VPC is **imported** from the existing `ontology-for-retail` deployment (`Vpc.fromVpcAttributes` 또는 `fromLookup`). All other resources (Neptune, OpenSearch, ECS, ALB, CloudFront, Cognito, S3) are GCC-exclusive.
```

- [ ] **Step 3: Project Structure 트리 — GCC용으로 갱신**

`## Project Structure` 트리를 retail에서 다음 차이만 반영해 교체: 파일 구조 섹션의 `data/public/`을 `opinet.py`·`kfda_term.py`로, 라우터 목록을 12개 GCC 시나리오로 (`search`·`chat`·`insights`·`persona_match`·`cluster`·`lookalike`·`campaign_roi`·`network_map`·`compliance`·`external_signal`·`outlier`·`payment` + `objects`·`ontology`·`ops`).

- [ ] **Step 4: Conventions § Cypher 그대로 + Models § Sonnet 4.6 ID 동일 + Infrastructure § Fargate ARM64 동일 — VPC import 절만 추가**

`### Infrastructure` 섹션 끝에 추가:

```markdown
- VPC is imported from `ontology-for-retail`'s network stack via `Vpc.fromVpcAttributes` (preferred when CFN export exists) or `Vpc.fromLookup` (tag-based fallback). GCC's network stack only creates SGs (gcc-app-sg, gcc-neptune-sg, gcc-os-sg). Retail teardown will break GCC connectivity; coordinate destroys.
- Custom domain `gcc-ontology.whchoi.net` is **not** wired by CDK — first deploy uses CloudFront default URL. Add domain via `cdk deploy gcc-edge -c domain=gcc-ontology.whchoi.net` then run `scripts/cognito-update-callbacks.sh`.
```

- [ ] **Step 5: Auto-Sync Rules § 시나리오 → A-L로 갱신**

retail의 "A-Z badge" 부분을 "A-L (12개)"로, sidebar/router 등록 절차는 그대로 유지.

- [ ] **Step 6: Memory References § 경로 갱신**

`User-specific memory lives at ~/.claude/projects/-home-ec2-user-my-project-ontology-for-gcc/memory/` 로 교체.

- [ ] **Step 7: 라인 수 검증**

```bash
wc -l CLAUDE.md
```
Expected: 200~320 줄 (retail 수준).

---

### Task 0.7: README.md (한·영) 작성

**Files:**
- Create/Replace: `README.md`

- [ ] **Step 1: retail의 README를 베이스로 복사**

```bash
cp ../ontology-for-retail/README.md README.md
```

- [ ] **Step 2: 식별자·도메인 치환**

```bash
sed -i 's/ontology-retail/ontology-gcc/g' README.md
sed -i 's/retail-ontology/gcc-ontology/g' README.md
sed -i 's|whchoi98/ontology-retail|whchoi98/ontology-gcc|g' README.md
```

- [ ] **Step 3: Overview 한·영 — GCC 도메인으로 교체**

영문 `## Overview` 단락을:
```markdown
`ontology-gcc` is a hands-on demonstration of how a domain ontology (customers, fuel transactions, gas stations, fuel products, campaigns, coupons, terms, app behavior, external signals) can power twelve distinct customer-analytics scenarios for GS Caltex on AWS managed AI services. The demo deploys a multi-tier application — FastAPI backend, Next.js 14 frontend, AWS CDK infrastructure — that integrates Bedrock Sonnet 4.6, AgentCore Memory and Code Interpreter, Neptune openCypher, OpenSearch Serverless hybrid search, and CloudFront-fronted ECS Fargate.

The scenarios span semantic search, conversational marketer agent with multi-turn memory, MD-grade insights with streaming token summaries, persona matching, customer clustering, lookalike expansion, campaign ROI simulation, station network map, compliance/term-consent guardrails, external-signal fusion, behavior-change outlier detection, and payment/price/channel analysis.
```

한국어 `## 개요`도 동등 내용으로 교체.

- [ ] **Step 4: Features 12 시나리오로 갱신 (영문·한국어 둘 다)**

retail의 8 Feature를 design spec §3.1의 12개 시나리오 표 내용으로 대체. 각 시나리오 한 줄로:
- Semantic Search (A) — 자연어 → 고객·주유 패턴 1-hop subgraph (BM25 Nori + Cohere KNN, RRF, rerank-v3)
- Conversational Marketer Agent (B) — Bedrock Converse 다회차 + AgentCore Memory + 10 도구
- MD Insights (C) — Sonnet 4.6 streaming + Code Interpreter matplotlib(NanumGothic)
- Persona Match (D) — 5 부서 페르소나 가중치 그래프 워크
- Customer Clustering (E) — sklearn KMeans 6 클러스터 + LLM 라벨링
- Lookalike Expansion (F) — Cohere embed-v4 + OpenSearch KNN
- Campaign ROI Simulator (G) — Bayesian 추정 + Code Interpreter
- Station Network Map (H) — 한국 시도 choropleth + opinet_no 실 주유소 + haversine k-NN
- Compliance Lens (I) — Bedrock Guardrails + Term/TermAgreement 그래프
- External Signal Fusion (J) — 현대카드 소비지수 + 앱 행동 + 설문 융합
- Behavior-Change Outlier (K) — pandas window + LLM 패턴 라벨링 (디젤→고급 전환 등)
- Payment/Price/Channel Analysis (L) — PaymentMethod × FuelPrice × Channel 매트릭스

- [ ] **Step 5: Configuration env 표를 GCC env로 갱신 (.env.example과 일치)**

retail의 env 표를 `BEDROCK_*`·`NEPTUNE_*`·`OPENSEARCH_*`는 그대로, S3 버킷 이름·인덱스 이름 prefix만 `ontology-gcc-dev-*`로 교체.

- [ ] **Step 6: harness-eval 배지 마커 추가**

문서 끝부분에:
```markdown
<!-- harness-eval-badge:start -->
![Harness Score](https://img.shields.io/badge/harness-0%2F10-lightgrey)
![Harness Grade](https://img.shields.io/badge/grade-F-lightgrey)
![Last Eval](https://img.shields.io/badge/eval-baseline-blue)
<!-- harness-eval-badge:end -->
```

- [ ] **Step 7: 라인·언어 검증**

```bash
wc -l README.md
grep -c "^## " README.md
```
Expected: 280+ 라인, 영문·한국어 두 섹션 모두 있음.

---

### Task 0.8: SECURITY.md / CHANGELOG.md / .env.example / .gitignore / .editorconfig / .mcp.json

**Files:**
- Create/Replace: `SECURITY.md`·`CHANGELOG.md`·`.env.example`·`.gitignore`·`.editorconfig`·`.mcp.json`·`requirements-dev.txt`

- [ ] **Step 1: retail에서 일괄 복사 후 식별자 치환**

```bash
for f in SECURITY.md .env.example .editorconfig .mcp.json requirements-dev.txt; do
  cp -n ../ontology-for-retail/$f ./$f 2>/dev/null && \
    sed -i -e 's/ontology-retail/ontology-gcc/g' -e 's/retail-ontology/gcc-ontology/g' ./$f
done
ls -la SECURITY.md .env.example .editorconfig .mcp.json requirements-dev.txt
```
Expected: 모든 파일 존재.

- [ ] **Step 2: CHANGELOG.md 첫 entry 작성**

```bash
cat > CHANGELOG.md <<'EOF'
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial fork from `ontology-for-mfg` with `ontology-for-retail` overlay (CI 4-job, eval template, ADR, harness-eval).
- Design spec: `docs/superpowers/specs/2026-05-08-ontology-gcc-design.md`.
- Plan 1 (Foundation): `docs/superpowers/plans/2026-05-08-plan1-foundation.md`.
EOF
```

- [ ] **Step 3: .gitignore에 GCC-specific 항목 추가**

`.gitignore`에 다음 라인이 모두 포함되도록 추가 (이미 있으면 skip):

```bash
for line in 'raw_data/' '.venv/' '__pycache__/' 'node_modules/' '.next/' 'cdk.out/' '.harness-eval/cache/' '*.log'; do
  grep -qF "$line" .gitignore 2>/dev/null || echo "$line" >> .gitignore
done
sort -u .gitignore -o .gitignore
cat .gitignore
```
Expected: `raw_data/`·`.venv/`·`__pycache__/`·`node_modules/`·`.next/`·`cdk.out/` 등 포함.

- [ ] **Step 4: .env.example의 핵심 env 키 검증**

```bash
grep -E "^(AWS_REGION|NEPTUNE_ENDPOINT|OPENSEARCH_ENDPOINT|BEDROCK_CHAT_MODEL_ID|COGNITO_USER_POOL_ID|PUBLIC_DOMAIN)=" .env.example
```
Expected: 6개 라인 모두 표시.

- [ ] **Step 5: .env.example에 GCC 신규 env 추가**

`.env.example` 끝에 추가:

```bash
cat >> .env.example <<'EOF'

# GCC-specific
RETAIL_VPC_ID=               # retail이 노출한 VPC ID (Vpc.fromVpcAttributes 사용 시)
RETAIL_VPC_AZS=              # comma-separated AZ list (e.g., ap-northeast-2a,ap-northeast-2b,ap-northeast-2c)
RETAIL_PUBLIC_SUBNET_IDS=    # comma-separated public subnet IDs
RETAIL_PRIVATE_SUBNET_IDS=   # comma-separated private subnet IDs
RETAIL_ISOLATED_SUBNET_IDS=  # comma-separated isolated subnet IDs (Neptune)
NEPTUNE_BULK_LOADER_ROLE_ARN= # IAM role ARN for Neptune bulk loader (Phase 2)
EOF
```

- [ ] **Step 6: SECURITY.md GCC 컨텍스트 보강**

`SECURITY.md`의 demo 섹션에 다음 단락 추가:

```markdown
## GCC-specific Caveats

- Imports retail's VPC: GCC has no network isolation from `ontology-for-retail`. Egress and east-west traffic are governed by retail's existing NACLs and route tables.
- raw_data PII: `raw_data/` is gitignored and stored only in a KMS-encrypted S3 bucket. Production migration requires a dedicated anonymization pipeline (out of scope for this PoC).
- Synthetic data only: all customer / transaction / coupon nodes are generated by `data/synthetic/*.py` based on raw_data column schemas — never the actual values.
```

---

### Task 0.9: Git 초기화 + 첫 커밋

**Files:** repository 초기화 (모든 추적 가능 파일 + commit).

- [ ] **Step 1: git 초기화 + main 브랜치**

```bash
git init -b main
git config user.name "GCC Bootstrap"
git config user.email "bootstrap@whchoi.net"
```

- [ ] **Step 2: `git add -A` 영향 범위 미리 확인 (`raw_data/` 제외 검증)**

```bash
git status --short | head -30
git status --short | grep "raw_data" || echo "raw_data NOT staged (correct)"
```
Expected: `raw_data NOT staged (correct)` (raw_data가 .gitignore되어 staging에 안 잡힘).

- [ ] **Step 3: 단계 커밋 — design + plan + bootstrap baseline**

```bash
git add docs/superpowers/specs/ docs/superpowers/plans/
git commit -m "docs: design spec and Plan 1 (Foundation) for ontology-for-gcc"

git add -A
git commit -m "feat: bootstrap from mfg + retail overlay (Plan 1 Phase 0 baseline)"
```

- [ ] **Step 4: 로그·트리 확인**

```bash
git log --oneline
git ls-tree --name-only HEAD | head -20
```
Expected: 2 커밋, 트리에 `api`·`web`·`infra-cdk`·`docs`·`scripts`·`.claude`·`.github` 등 표시. `raw_data` 없음.

- [ ] **Step 5: Phase 0 종료 sanity check**

```bash
# 컴파일 가능 체크
python3 -m compileall -q api data scripts 2>&1 | tail -5
# CI workflow YAML 유효
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "CI YAML OK"
# CLAUDE/README 라인 수
wc -l CLAUDE.md README.md
```
Expected: 컴파일 에러 없음, `CI YAML OK`, CLAUDE.md ≥200 lines, README.md ≥280 lines.

---

## Phase 1: Infrastructure (CDK 6 stacks → CloudFront 200 OK)

작업 디렉토리는 그대로 `/home/ec2-user/my-project/ontology-for-gcc/`. CDK 작업은 `infra-cdk/` 안에서.

전제: AWS CLI 자격 증명 설정 완료, retail이 `ap-northeast-2`에 이미 배포된 상태.

### Task 1.1: retail VPC import 정보 수집 + ADR 0001 작성

**Files:**
- Create: `docs/decisions/0001-retail-vpc-import.md`

- [ ] **Step 1: retail의 CFN export 확인**

```bash
aws cloudformation list-exports --region ap-northeast-2 \
  --query "Exports[?contains(Name, 'retail') || contains(Name, 'Vpc')].[Name,Value]" \
  --output table | tee /tmp/retail-exports.txt
```
Expected: retail VPC ID·subnet IDs export 발견. **없으면** Step 2로(태그 lookup 사용).

- [ ] **Step 2: retail VPC을 태그로 직접 조회 (export 없을 때 fallback)**

```bash
aws ec2 describe-vpcs --region ap-northeast-2 \
  --filters "Name=tag:Project,Values=ontology-retail" \
  --query "Vpcs[].[VpcId,CidrBlock,Tags[?Key=='aws:cdk:path']|[0].Value]" \
  --output table | tee /tmp/retail-vpc-info.txt
```
Expected: VPC ID·CIDR 표시.

- [ ] **Step 3: subnet ID 수집 (3-AZ × public/private/isolated)**

```bash
RETAIL_VPC_ID=$(aws ec2 describe-vpcs --region ap-northeast-2 \
  --filters "Name=tag:Project,Values=ontology-retail" \
  --query "Vpcs[0].VpcId" --output text)
echo "RETAIL_VPC_ID=$RETAIL_VPC_ID"

aws ec2 describe-subnets --region ap-northeast-2 \
  --filters "Name=vpc-id,Values=$RETAIL_VPC_ID" \
  --query "Subnets[].[SubnetId,AvailabilityZone,Tags[?Key=='aws-cdk:subnet-type']|[0].Value]" \
  --output table | tee /tmp/retail-subnets.txt
```
Expected: 9개 subnet (3 public + 3 private + 3 isolated) 표시.

- [ ] **Step 4: `.env`에 RETAIL_VPC_* 채우기**

```bash
cp .env.example .env
# .env에 RETAIL_VPC_ID, RETAIL_VPC_AZS, RETAIL_PUBLIC_SUBNET_IDS,
# RETAIL_PRIVATE_SUBNET_IDS, RETAIL_ISOLATED_SUBNET_IDS 값 직접 입력
# (Step 3 결과 참고)
grep ^RETAIL_ .env
```
Expected: 5개 env 모두 값 채워짐.

- [ ] **Step 5: ADR 0001 작성**

`docs/decisions/0001-retail-vpc-import.md` 내용:

```markdown
# ADR 0001 — Retail VPC Import

- Status: Accepted
- Date: 2026-05-08
- Deciders: brainstorming session

## Context

`ontology-for-gcc`는 `ontology-for-retail`이 이미 ap-northeast-2에 배포한 VPC·NAT GW·prefix-list를 그대로 import해 사용한다. 새 VPC를 만들지 않음으로써 (1) NAT GW 시간당 비용 중복 회피, (2) 동일 가용영역 패턴 재사용, (3) retail/gcc 간 향후 cross-domain 분석 시 네트워크 단순성 확보.

## Decision

- gcc의 `network-stack`은 VPC를 *생성하지 않고*, 다음 둘 중 하나로 import:
  - **Preferred**: `Vpc.fromVpcAttributes` — `.env`의 `RETAIL_VPC_ID`/subnet IDs를 사용 (deterministic).
  - **Fallback**: `Vpc.fromLookup({tags: {Project: 'ontology-retail'}})` — context cache 사용 (`cdk.context.json`).
- gcc는 자체 SG (`gcc-app-sg`, `gcc-neptune-sg`, `gcc-os-sg`, `gcc-alb-sg`)만 신규 생성. retail의 SG는 ingress source로 *허용하지 않음*.
- prefix-list `com.amazonaws.global.cloudfront.origin-facing`은 retail이 생성한 게 아니라 AWS 관리 — 그대로 사용.

## Consequences

- retail 스택을 destroy하면 gcc는 VPC 의존성을 잃음 — destroy 전 gcc 먼저 destroy 필요. 운영 runbook에 명시.
- retail이 VPC CIDR을 변경하면 gcc도 영향. 변경 시 retail 팀 사전 통지 + ADR 갱신.
- east-west 보안: retail SG ↔ gcc SG는 이론상 같은 VPC 내 통신 가능하므로 SG 내 explicit allow가 없는 한 차단됨을 IaC로 보장.

## Alternatives Considered

1. 신규 VPC + VPC Peering — 비용 증가, NAT GW 중복.
2. Transit Gateway hub — PoC에 과함.
3. 완전 Shared VPC (RAM) — 권한 모델 복잡, retail 변경 위험.
```

- [ ] **Step 6: 커밋**

```bash
git add docs/decisions/0001-retail-vpc-import.md
git commit -m "docs: ADR 0001 retail VPC import strategy"
```

---

### Task 1.2: `infra-cdk/bin/gcc.ts` 엔트리 + `network-stack.ts` (VPC import + GCC SGs)

**Files:**
- Create/Replace: `infra-cdk/bin/gcc.ts`
- Modify: `infra-cdk/lib/network-stack.ts`
- Modify: `infra-cdk/cdk.json`·`infra-cdk/package.json`

- [ ] **Step 1: bin 파일 이름 정렬 + 식별자 swap**

```bash
cd infra-cdk
# mfg fork 후 이미 mfg→gcc 치환되었지만 파일명만 별도 처리
ls bin/
# 만약 bin/mfg.ts가 남아있으면:
[ -f bin/mfg.ts ] && git mv bin/mfg.ts bin/gcc.ts || echo "bin/gcc.ts already exists"
ls bin/
cd -
```

- [ ] **Step 2: cdk.json `app` 갱신**

`infra-cdk/cdk.json`의 `"app": "..."` 라인을 다음으로 교체:

```json
{
  "app": "npx ts-node --prefer-ts-exts bin/gcc.ts",
  "context": {
    "@aws-cdk/aws-lambda:recognizeLayerVersion": true,
    "@aws-cdk/core:checkSecretUsage": true,
    "@aws-cdk/core:target-partitions": ["aws"]
  }
}
```

- [ ] **Step 3: bin/gcc.ts 작성 (모든 6 스택 instantiation)**

`infra-cdk/bin/gcc.ts` 전체 내용:

```typescript
#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';
import { DataStack } from '../lib/data-stack';
import { ComputeStack } from '../lib/compute-stack';
import { AiStack } from '../lib/ai-stack';
import { EdgeStack } from '../lib/edge-stack';
import { ObservabilityStack } from '../lib/observability-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'ap-northeast-2',
};

const projectPrefix = 'ontology-gcc-dev';
const tags = { Project: 'ontology-gcc', Env: 'dev', ManagedBy: 'cdk' };

// retail VPC import params (.env)
const retailVpcId = process.env.RETAIL_VPC_ID;
const retailAzs = (process.env.RETAIL_VPC_AZS ?? '').split(',').filter(Boolean);
const retailPublicSubnets = (process.env.RETAIL_PUBLIC_SUBNET_IDS ?? '').split(',').filter(Boolean);
const retailPrivateSubnets = (process.env.RETAIL_PRIVATE_SUBNET_IDS ?? '').split(',').filter(Boolean);
const retailIsolatedSubnets = (process.env.RETAIL_ISOLATED_SUBNET_IDS ?? '').split(',').filter(Boolean);

if (!retailVpcId) {
  throw new Error('RETAIL_VPC_ID env var is required (see .env.example).');
}

const network = new NetworkStack(app, `${projectPrefix}-network`, {
  env, tags,
  retailVpc: {
    vpcId: retailVpcId,
    availabilityZones: retailAzs,
    publicSubnetIds: retailPublicSubnets,
    privateSubnetIds: retailPrivateSubnets,
    isolatedSubnetIds: retailIsolatedSubnets,
  },
});

const data = new DataStack(app, `${projectPrefix}-data`, {
  env, tags,
  vpc: network.vpc,
  appSg: network.appSg,
  neptuneSg: network.neptuneSg,
  osSg: network.osSg,
});

const ai = new AiStack(app, `${projectPrefix}-ai`, {
  env, tags,
  rawDocsBucket: data.rawDocsBucket,
});

const compute = new ComputeStack(app, `${projectPrefix}-compute`, {
  env, tags,
  vpc: network.vpc,
  appSg: network.appSg,
  albSg: network.albSg,
  neptuneEndpoint: data.neptuneEndpoint,
  openSearchEndpoint: data.openSearchEndpoint,
  rawDocsBucket: data.rawDocsBucket,
  uploadsBucket: data.uploadsBucket,
  syntheticDataBucket: data.syntheticDataBucket,
  bedrockKbId: ai.kbId,
  bedrockGuardrailId: ai.guardrailId,
  agentCoreMemoryId: ai.memoryId,
});

const edge = new EdgeStack(app, `${projectPrefix}-edge`, {
  env: { ...env, region: 'us-east-1' }, // ACM + Lambda@Edge are us-east-1
  tags,
  alb: compute.alb,
  domainName: app.node.tryGetContext('domain') as string | undefined,
});

new ObservabilityStack(app, `${projectPrefix}-observability`, {
  env, tags,
  apiServiceArn: compute.apiServiceArn,
  webServiceArn: compute.webServiceArn,
  neptuneClusterId: data.neptuneClusterId,
});

app.synth();
```

- [ ] **Step 4: lib/network-stack.ts 교체 (VPC import + GCC SGs only)**

`infra-cdk/lib/network-stack.ts` 전체 내용:

```typescript
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface NetworkStackProps extends cdk.StackProps {
  retailVpc: {
    vpcId: string;
    availabilityZones: string[];
    publicSubnetIds: string[];
    privateSubnetIds: string[];
    isolatedSubnetIds: string[];
  };
}

export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.IVpc;
  public readonly appSg: ec2.SecurityGroup;
  public readonly neptuneSg: ec2.SecurityGroup;
  public readonly osSg: ec2.SecurityGroup;
  public readonly albSg: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    const { retailVpc } = props;

    this.vpc = ec2.Vpc.fromVpcAttributes(this, 'RetailVpc', {
      vpcId: retailVpc.vpcId,
      availabilityZones: retailVpc.availabilityZones,
      publicSubnetIds: retailVpc.publicSubnetIds,
      privateSubnetIds: retailVpc.privateSubnetIds,
      isolatedSubnetIds: retailVpc.isolatedSubnetIds,
    });

    this.albSg = new ec2.SecurityGroup(this, 'AlbSg', {
      vpc: this.vpc,
      securityGroupName: 'gcc-alb-sg',
      description: 'GCC ALB — ingress from CloudFront prefix list only',
      allowAllOutbound: true,
    });

    const cfPrefixList = ec2.PrefixList.fromLookup(this, 'CloudFrontPrefixList', {
      prefixListName: 'com.amazonaws.global.cloudfront.origin-facing',
    });
    this.albSg.addIngressRule(
      ec2.Peer.prefixList(cfPrefixList.prefixListId),
      ec2.Port.tcp(80),
      'CloudFront origins',
    );

    this.appSg = new ec2.SecurityGroup(this, 'AppSg', {
      vpc: this.vpc,
      securityGroupName: 'gcc-app-sg',
      description: 'GCC ECS tasks (api+web)',
      allowAllOutbound: true,
    });
    this.appSg.addIngressRule(this.albSg, ec2.Port.tcp(8000), 'ALB → api');
    this.appSg.addIngressRule(this.albSg, ec2.Port.tcp(3000), 'ALB → web');

    this.neptuneSg = new ec2.SecurityGroup(this, 'NeptuneSg', {
      vpc: this.vpc,
      securityGroupName: 'gcc-neptune-sg',
      description: 'GCC Neptune — ingress from gcc-app-sg only',
      allowAllOutbound: false,
    });
    this.neptuneSg.addIngressRule(this.appSg, ec2.Port.tcp(8182), 'GCC api → Neptune');

    this.osSg = new ec2.SecurityGroup(this, 'OsSg', {
      vpc: this.vpc,
      securityGroupName: 'gcc-os-sg',
      description: 'GCC OpenSearch Serverless VPC endpoint',
      allowAllOutbound: false,
    });
    this.osSg.addIngressRule(this.appSg, ec2.Port.tcp(443), 'GCC api → OS');

    new cdk.CfnOutput(this, 'GccAppSgId', { value: this.appSg.securityGroupId });
    new cdk.CfnOutput(this, 'GccNeptuneSgId', { value: this.neptuneSg.securityGroupId });
  }
}
```

- [ ] **Step 5: cdk synth (network 스택만)**

```bash
cd infra-cdk
npm ci
npx cdk synth ontology-gcc-dev-network 2>&1 | tail -20
cd -
```
Expected: `Successfully synthesized to cdk.out` 또는 동등 메시지. 에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add infra-cdk/bin/gcc.ts infra-cdk/lib/network-stack.ts infra-cdk/cdk.json infra-cdk/package.json
git commit -m "feat(infra): network stack imports retail VPC + GCC-only SGs"
```

---

### Task 1.3: `data-stack.ts` (Neptune + OpenSearch Serverless + S3) + ADR 0003 (Bulk Loader IAM)

**Files:**
- Modify: `infra-cdk/lib/data-stack.ts`
- Create: `docs/decisions/0003-bulk-loader-iam-prep.md`

- [ ] **Step 1: ADR 0003 작성 (Bulk Loader 사전 IAM 결정)**

`docs/decisions/0003-bulk-loader-iam-prep.md`:

```markdown
# ADR 0003 — Neptune Bulk Loader IAM Prep

- Status: Accepted (Plan 1 사전, Plan 2에서 사용)
- Date: 2026-05-08

## Context

GCC 합성 데이터 규모는 ~100만 노드 + ~350만 엣지. 직접 openCypher MERGE는 30~45분, Neptune Bulk Loader (S3 → Neptune)는 5~8분 — 7~8배 빠름. Plan 2 진입 전 IAM·VPC endpoint를 미리 가설해 둔다.

## Decision

`data-stack`이 다음을 사전 생성:

1. IAM Role `gcc-neptune-bulk-loader-role` — Neptune cluster의 `IamRoles` 속성으로 attach.
   - `AssumeRolePolicyDocument`: `rds.amazonaws.com` (Neptune trust).
   - `Policies`: `s3:GetObject`·`s3:ListBucket` on `synthetic-data` bucket.
2. VPC endpoint `com.amazonaws.<region>.s3` (Gateway type) — Neptune이 S3로 GetObject할 수 있도록 isolated subnet route table에 attach.
3. CFN Output: `BulkLoaderRoleArn` — Plan 2 loader가 `aws s3 cp ...` 후 Neptune Loader API 호출 시 사용.

## Consequences

- Plan 1 첫 배포에 IAM·endpoint가 함께 올라감 → Plan 2가 코드만 추가하면 됨.
- VPC endpoint는 retail VPC에 추가됨 (route table 수정). retail 운영 영향 미미하나 ADR 0001에 따라 retail 팀 통지 필요.
```

- [ ] **Step 2: data-stack.ts 작성**

`infra-cdk/lib/data-stack.ts` 전체:

```typescript
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as neptune from 'aws-cdk-lib/aws-neptune';
import * as oss from 'aws-cdk-lib/aws-opensearchserverless';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface DataStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  appSg: ec2.SecurityGroup;
  neptuneSg: ec2.SecurityGroup;
  osSg: ec2.SecurityGroup;
}

export class DataStack extends cdk.Stack {
  public readonly neptuneEndpoint: string;
  public readonly neptuneClusterId: string;
  public readonly openSearchEndpoint: string;
  public readonly rawDocsBucket: s3.IBucket;
  public readonly uploadsBucket: s3.IBucket;
  public readonly syntheticDataBucket: s3.IBucket;
  public readonly bulkLoaderRoleArn: string;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    // ── S3 buckets ─────────────────────────────────────────────────
    const account = cdk.Stack.of(this).account;
    this.rawDocsBucket = new s3.Bucket(this, 'RawDocs', {
      bucketName: `ontology-gcc-dev-raw-docs-${account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    this.uploadsBucket = new s3.Bucket(this, 'Uploads', {
      bucketName: `ontology-gcc-dev-uploads-${account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    this.syntheticDataBucket = new s3.Bucket(this, 'Synthetic', {
      bucketName: `ontology-gcc-dev-synthetic-data-${account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── Neptune Bulk Loader IAM (ADR 0003 prep) ────────────────────
    const bulkLoaderRole = new iam.Role(this, 'NeptuneBulkLoaderRole', {
      roleName: 'gcc-neptune-bulk-loader-role',
      assumedBy: new iam.ServicePrincipal('rds.amazonaws.com'),
    });
    this.syntheticDataBucket.grantRead(bulkLoaderRole);
    this.bulkLoaderRoleArn = bulkLoaderRole.roleArn;

    // ── VPC endpoint for S3 (Neptune Loader needs S3 reach) ────────
    new ec2.GatewayVpcEndpoint(this, 'S3VpcEndpoint', {
      vpc: props.vpc,
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [{ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }],
    });

    // ── Neptune ────────────────────────────────────────────────────
    const subnetGroup = new neptune.CfnDBSubnetGroup(this, 'NeptuneSubnetGroup', {
      dbSubnetGroupDescription: 'GCC Neptune subnets',
      subnetIds: props.vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }).subnetIds,
      dbSubnetGroupName: 'gcc-neptune-subnets',
    });

    const cluster = new neptune.CfnDBCluster(this, 'NeptuneCluster', {
      dbClusterIdentifier: 'ontology-gcc-dev-neptune',
      engineVersion: '1.3.2.0',
      dbSubnetGroupName: subnetGroup.dbSubnetGroupName,
      vpcSecurityGroupIds: [props.neptuneSg.securityGroupId],
      iamAuthEnabled: true,
      associatedRoles: [{ roleArn: bulkLoaderRole.roleArn }],
    });
    cluster.addDependency(subnetGroup);

    new neptune.CfnDBInstance(this, 'NeptuneInstance', {
      dbInstanceClass: 'db.t4g.medium',
      dbClusterIdentifier: cluster.ref,
      dbInstanceIdentifier: 'ontology-gcc-dev-neptune-1',
    });

    this.neptuneEndpoint = cluster.attrEndpoint;
    this.neptuneClusterId = cluster.ref;

    // ── OpenSearch Serverless ──────────────────────────────────────
    const securityPolicy = new oss.CfnSecurityPolicy(this, 'OsSecurityPolicy', {
      name: 'gcc-os-encryption',
      type: 'encryption',
      policy: JSON.stringify({
        Rules: [{ ResourceType: 'collection', Resource: ['collection/ontology-gcc-dev'] }],
        AWSOwnedKey: true,
      }),
    });

    const networkPolicy = new oss.CfnSecurityPolicy(this, 'OsNetworkPolicy', {
      name: 'gcc-os-network',
      type: 'network',
      policy: JSON.stringify([
        {
          Rules: [
            { ResourceType: 'collection', Resource: ['collection/ontology-gcc-dev'] },
            { ResourceType: 'dashboard', Resource: ['collection/ontology-gcc-dev'] },
          ],
          AllowFromPublic: false,
          SourceVPCEs: [],  // VPC endpoint added below
        },
      ]),
    });

    const collection = new oss.CfnCollection(this, 'OsCollection', {
      name: 'ontology-gcc-dev',
      type: 'VECTORSEARCH',
    });
    collection.addDependency(securityPolicy);
    collection.addDependency(networkPolicy);

    this.openSearchEndpoint = collection.attrCollectionEndpoint;

    // ── Outputs ────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'NeptuneEndpoint', { value: this.neptuneEndpoint });
    new cdk.CfnOutput(this, 'OpenSearchEndpoint', { value: this.openSearchEndpoint });
    new cdk.CfnOutput(this, 'BulkLoaderRoleArn', { value: this.bulkLoaderRoleArn });
    new cdk.CfnOutput(this, 'SyntheticBucketName', { value: this.syntheticDataBucket.bucketName });
  }
}
```

- [ ] **Step 3: cdk synth로 검증**

```bash
cd infra-cdk
npx cdk synth ontology-gcc-dev-data 2>&1 | tail -10
cd -
```
Expected: 에러 없이 synth 성공.

- [ ] **Step 4: 커밋**

```bash
git add infra-cdk/lib/data-stack.ts docs/decisions/0003-bulk-loader-iam-prep.md
git commit -m "feat(infra): data stack — Neptune + OpenSearch + S3 + Bulk Loader IAM"
```

---

### Task 1.4: `compute-stack.ts` (ECS Fargate ARM64 + ALB + 2 services)

**Files:**
- Modify: `infra-cdk/lib/compute-stack.ts`

- [ ] **Step 1: API + Web 컨테이너용 task definition + ALB 작성**

`infra-cdk/lib/compute-stack.ts` 전체:

```typescript
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secrets from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface ComputeStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  appSg: ec2.SecurityGroup;
  albSg: ec2.SecurityGroup;
  neptuneEndpoint: string;
  openSearchEndpoint: string;
  rawDocsBucket: s3.IBucket;
  uploadsBucket: s3.IBucket;
  syntheticDataBucket: s3.IBucket;
  bedrockKbId: string;
  bedrockGuardrailId: string;
  agentCoreMemoryId: string;
}

export class ComputeStack extends cdk.Stack {
  public readonly alb: elbv2.ApplicationLoadBalancer;
  public readonly apiServiceArn: string;
  public readonly webServiceArn: string;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc: props.vpc,
      clusterName: 'ontology-gcc-dev-cluster',
      containerInsights: true,
    });

    const apiRepo = new ecr.Repository(this, 'ApiRepo', {
      repositoryName: 'ontology-gcc-dev-api',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    const webRepo = new ecr.Repository(this, 'WebRepo', {
      repositoryName: 'ontology-gcc-dev-web',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const originAuthSecret = new secrets.Secret(this, 'OriginAuthSecret', {
      secretName: 'ontology-gcc-dev/origin-auth',
      generateSecretString: { passwordLength: 48, excludePunctuation: true },
    });

    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    taskRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('NeptuneFullAccess'));
    taskRole.addToPolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel', 'bedrock:Converse', 'bedrock:Retrieve',
                'bedrock:ApplyGuardrail', 'aoss:APIAccessAll'],
      resources: ['*'],
    }));
    props.rawDocsBucket.grantReadWrite(taskRole);
    props.uploadsBucket.grantReadWrite(taskRole);
    props.syntheticDataBucket.grantReadWrite(taskRole);
    originAuthSecret.grantRead(taskRole);

    // ── API task ──
    const apiTask = new ecs.FargateTaskDefinition(this, 'ApiTask', {
      cpu: 1024, memoryLimitMiB: 2048,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
      taskRole,
    });
    apiTask.addContainer('api', {
      image: ecs.ContainerImage.fromEcrRepository(apiRepo, 'latest'),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'api',
        logRetention: logs.RetentionDays.ONE_MONTH,
      }),
      portMappings: [{ containerPort: 8000 }],
      environment: {
        AWS_REGION: cdk.Stack.of(this).region,
        NEPTUNE_ENDPOINT: props.neptuneEndpoint,
        OPENSEARCH_ENDPOINT: props.openSearchEndpoint,
        OPENSEARCH_INDEX: 'ontology-gcc-dev-kb-index',
        BEDROCK_CHAT_MODEL_ID: 'global.anthropic.claude-sonnet-4-6',
        BEDROCK_EMBED_MODEL_ID: 'global.cohere.embed-v4:0',
        BEDROCK_KB_ID: props.bedrockKbId,
        BEDROCK_GUARDRAIL_ID: props.bedrockGuardrailId,
        AGENTCORE_MEMORY_ID: props.agentCoreMemoryId,
        RAW_DOCS_BUCKET: props.rawDocsBucket.bucketName,
        UPLOADS_BUCKET: props.uploadsBucket.bucketName,
        SYNTHETIC_DATA_BUCKET: props.syntheticDataBucket.bucketName,
        ONTOLOGY_ENV: 'dev',
        DEMO_PUBLIC_MODE: 'false',
      },
      secrets: { ORIGIN_AUTH_TOKEN: ecs.Secret.fromSecretsManager(originAuthSecret) },
    });

    // ── Web task ──
    const webTask = new ecs.FargateTaskDefinition(this, 'WebTask', {
      cpu: 512, memoryLimitMiB: 1024,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });
    webTask.addContainer('web', {
      image: ecs.ContainerImage.fromEcrRepository(webRepo, 'latest'),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'web',
        logRetention: logs.RetentionDays.ONE_MONTH,
      }),
      portMappings: [{ containerPort: 3000 }],
      environment: {
        NEXT_PUBLIC_API_BASE: '/api',
      },
    });

    const apiService = new ecs.FargateService(this, 'ApiService', {
      cluster,
      serviceName: 'ontology-gcc-dev-api',
      taskDefinition: apiTask,
      desiredCount: 2,
      securityGroups: [props.appSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false,
    });
    const webService = new ecs.FargateService(this, 'WebService', {
      cluster,
      serviceName: 'ontology-gcc-dev-web',
      taskDefinition: webTask,
      desiredCount: 2,
      securityGroups: [props.appSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false,
    });

    this.alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: props.albSg,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });
    const listener = this.alb.addListener('Http', { port: 80, open: false });

    listener.addTargets('ApiTargets', {
      port: 8000,
      targets: [apiService],
      healthCheck: { path: '/healthz', healthyHttpCodes: '200' },
      conditions: [elbv2.ListenerCondition.pathPatterns(['/api/*', '/healthz'])],
      priority: 10,
    });
    listener.addTargets('WebTargets', {
      port: 3000,
      targets: [webService],
      healthCheck: { path: '/', healthyHttpCodes: '200,307' },
    });

    this.apiServiceArn = apiService.serviceArn;
    this.webServiceArn = webService.serviceArn;

    new cdk.CfnOutput(this, 'AlbDnsName', { value: this.alb.loadBalancerDnsName });
  }
}
```

- [ ] **Step 2: synth 검증**

```bash
cd infra-cdk
npx cdk synth ontology-gcc-dev-compute 2>&1 | tail -10
cd -
```
Expected: synth 성공.

- [ ] **Step 3: 커밋**

```bash
git add infra-cdk/lib/compute-stack.ts
git commit -m "feat(infra): compute stack — ECS Fargate ARM64 + ALB + 2 services"
```

---

### Task 1.5: `ai-stack.ts` (Bedrock KB + Guardrails + AgentCore Memory)

**Files:**
- Modify: `infra-cdk/lib/ai-stack.ts`

- [ ] **Step 1: ai-stack.ts 작성**

`infra-cdk/lib/ai-stack.ts` 전체:

```typescript
import * as cdk from 'aws-cdk-lib';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface AiStackProps extends cdk.StackProps {
  rawDocsBucket: s3.IBucket;
}

export class AiStack extends cdk.Stack {
  public readonly kbId: string;
  public readonly guardrailId: string;
  public readonly memoryId: string;

  constructor(scope: Construct, id: string, props: AiStackProps) {
    super(scope, id, props);

    // ── Bedrock Guardrails ─────────────────────────────────────────
    const guardrail = new bedrock.CfnGuardrail(this, 'Guardrail', {
      name: 'ontology-gcc-dev-guardrail',
      blockedInputMessaging: '입력에 차단된 콘텐츠가 포함되어 있습니다.',
      blockedOutputsMessaging: '출력에 차단된 콘텐츠가 포함되어 있습니다.',
      contentPolicyConfig: {
        filtersConfig: [
          { type: 'SEXUAL',     inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'VIOLENCE',   inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'HATE',       inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'INSULTS',    inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'MISCONDUCT', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'PROMPT_ATTACK', inputStrength: 'HIGH', outputStrength: 'NONE' },
        ],
      },
      sensitiveInformationPolicyConfig: {
        piiEntitiesConfig: [
          { type: 'PHONE',           action: 'ANONYMIZE' },
          { type: 'EMAIL',           action: 'ANONYMIZE' },
          { type: 'CREDIT_DEBIT_CARD_NUMBER', action: 'BLOCK' },
        ],
      },
    });
    this.guardrailId = guardrail.attrGuardrailId;

    // ── Bedrock Knowledge Base (placeholder — actual ingestion in Plan 5) ──
    const kbRole = new iam.Role(this, 'KbRole', {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
    });
    props.rawDocsBucket.grantRead(kbRole);
    kbRole.addToPolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: ['*'],
    }));

    // KB itself is created via custom resource or manually if Bedrock CFN gaps;
    // for now expose a placeholder ID (overwritten when KB is provisioned).
    this.kbId = cdk.Fn.importValue('GccBedrockKbId').toString();

    // ── AgentCore Memory (custom resource — same pattern as retail ADR 0001) ──
    // Plan 1에서는 placeholder string으로 두고, 실제 생성은 retail의 패턴 그대로
    // (AwsCustomResource로 createMemory 호출) 후 Outputs로 주입.
    this.memoryId = 'pending-agentcore-memory-id';

    new cdk.CfnOutput(this, 'GuardrailId', { value: this.guardrailId });
    new cdk.CfnOutput(this, 'KbIdRef',     { value: this.kbId });
  }
}
```

> 주: AgentCore Memory의 실제 CDK 통합은 retail의 ADR 0001 (AgentCore Memory via AwsCustomResource) 패턴과 동일. Plan 1에선 placeholder, Plan 2 진입 전 retail의 `infra-cdk/lib/ai-stack.ts`의 AwsCustomResource 블록을 그대로 복사·식별자만 swap. 이번 Step에서는 빌드 가능성·synth 통과만 확인.

- [ ] **Step 2: synth 검증**

```bash
cd infra-cdk
npx cdk synth ontology-gcc-dev-ai 2>&1 | tail -10
cd -
```
Expected: synth 성공 (`pending-agentcore-memory-id`는 string 그대로 통과).

- [ ] **Step 3: 커밋**

```bash
git add infra-cdk/lib/ai-stack.ts
git commit -m "feat(infra): ai stack — Guardrail + KB scaffolding (Memory via custom resource in Plan 2)"
```

---

### Task 1.6: `edge-stack.ts` (CloudFront + Lambda@Edge + Cognito) + ADR 0002 (도메인 분리 배포)

**Files:**
- Modify: `infra-cdk/lib/edge-stack.ts`
- Create: `docs/decisions/0002-domain-deferred-deployment.md`

- [ ] **Step 1: ADR 0002 작성**

`docs/decisions/0002-domain-deferred-deployment.md`:

```markdown
# ADR 0002 — Domain Deferred Deployment

- Status: Accepted
- Date: 2026-05-08

## Context

사용자가 도메인 (`gcc-ontology.whchoi.net`)·ACM 인증서·Route53 wiring을 첫 배포 후 별도 절차로 수행한다고 명시. CDK 첫 배포는 CloudFront 기본 도메인(`*.cloudfront.net`)으로 동작해야 함.

## Decision

- `EdgeStack`은 `domainName?: string` 옵셔널 prop을 받음 (`-c domain=...`).
- domainName 없으면: CloudFront alias·ACM·Route53 record 생성 *없음*. Cognito callback URL은 CloudFront 기본 도메인으로 등록.
- domainName 있으면: ACM(us-east-1)·alias·R53 record 생성. Cognito callback은 추가 PUT(`scripts/cognito-update-callbacks.sh`)으로 *기존 + 신규* 머지.

## Consequences

- 첫 배포가 단순 (`cdk deploy --all`) — 도메인 무관 작동.
- 도메인 추가는 후작업 — `cdk deploy ontology-gcc-dev-edge -c domain=gcc-ontology.whchoi.net && bash scripts/cognito-update-callbacks.sh gcc-ontology.whchoi.net`.
- Cognito callback의 PUT 위험성 — 안전 머지 스크립트 필수 (Task 1.10).

## Alternatives Considered

1. CDK가 항상 도메인 생성 → ACM·R53 권한 첫 배포 시 필수, 운영 환경 관리 부담.
2. 도메인을 `cdk.context.json`에 항상 채워두기 → 컨텍스트 캐시 의존 PoC 부적합.
```

- [ ] **Step 2: edge-stack.ts 작성 (옵셔널 도메인 패턴)**

`infra-cdk/lib/edge-stack.ts` 전체:

```typescript
import * as cdk from 'aws-cdk-lib';
import * as cf from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';

export interface EdgeStackProps extends cdk.StackProps {
  alb: elbv2.IApplicationLoadBalancer;
  domainName?: string;  // optional — first deploy without
}

export class EdgeStack extends cdk.Stack {
  public readonly distribution: cf.Distribution;
  public readonly userPool: cognito.UserPool;

  constructor(scope: Construct, id: string, props: EdgeStackProps) {
    super(scope, id, props);

    // ── ACM (only if domain provided) ──────────────────────────────
    let cert: acm.ICertificate | undefined;
    if (props.domainName) {
      cert = new acm.Certificate(this, 'Cert', {
        domainName: props.domainName,
        validation: acm.CertificateValidation.fromDns(),
      });
    }

    // ── CloudFront ────────────────────────────────────────────────
    this.distribution = new cf.Distribution(this, 'Dist', {
      defaultBehavior: {
        origin: new origins.LoadBalancerV2Origin(props.alb, {
          protocolPolicy: cf.OriginProtocolPolicy.HTTP_ONLY,
          customHeaders: {
            // Origin auth token 별도 secret 매핑은 Plan 5 polish에서 추가
          },
        }),
        viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cf.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cf.OriginRequestPolicy.ALL_VIEWER,
      },
      domainNames: props.domainName ? [props.domainName] : undefined,
      certificate: cert,
      priceClass: cf.PriceClass.PRICE_CLASS_200,
    });

    // ── Cognito ───────────────────────────────────────────────────
    const cfDomain = `https://${this.distribution.distributionDomainName}`;
    const customDomain = props.domainName ? `https://${props.domainName}` : undefined;

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'ontology-gcc-dev-userpool',
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      passwordPolicy: { minLength: 8, requireDigits: true, requireLowercase: true, requireUppercase: true, requireSymbols: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      generateSecret: true,
      authFlows: { userPassword: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        callbackUrls: [
          `${cfDomain}/auth/callback`,
          ...(customDomain ? [`${customDomain}/auth/callback`] : []),
        ],
        logoutUrls: [
          cfDomain,
          ...(customDomain ? [customDomain] : []),
        ],
        scopes: [cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID],
      },
    });

    // Lambda@Edge auth function — placeholder edge function;
    // retail의 lambda-edge-auth/는 Phase 1에선 stub 함수만 배포해 200 OK 가능하게.
    // 실제 JWT 검증은 retail 패턴 그대로 가져오되 Plan 5 polish에서 보강.

    new cdk.CfnOutput(this, 'CloudFrontDomainName', { value: this.distribution.distributionDomainName });
    new cdk.CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
  }
}
```

- [ ] **Step 3: synth 검증 (도메인 없이)**

```bash
cd infra-cdk
npx cdk synth ontology-gcc-dev-edge 2>&1 | tail -10
cd -
```
Expected: synth 성공, ACM·alias·R53 리소스 *없음* (synth 출력 grep으로 확인 권장).

- [ ] **Step 4: synth 검증 (도메인 있음 — `-c domain=...`)**

```bash
cd infra-cdk
npx cdk synth ontology-gcc-dev-edge -c domain=gcc-ontology.whchoi.net 2>&1 | tail -10
cd -
```
Expected: synth 성공, ACM 리소스 등장 (cdk.out/*.json grep `AWS::CertificateManager::Certificate`).

- [ ] **Step 5: 커밋**

```bash
git add infra-cdk/lib/edge-stack.ts docs/decisions/0002-domain-deferred-deployment.md
git commit -m "feat(infra): edge stack — CloudFront + Cognito (domain optional via -c)"
```

---

### Task 1.7: `observability-stack.ts` (CloudWatch dashboards + alarms)

**Files:**
- Modify: `infra-cdk/lib/observability-stack.ts`

- [ ] **Step 1: 작성**

`infra-cdk/lib/observability-stack.ts` 전체:

```typescript
import * as cdk from 'aws-cdk-lib';
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';

export interface ObservabilityStackProps extends cdk.StackProps {
  apiServiceArn: string;
  webServiceArn: string;
  neptuneClusterId: string;
}

export class ObservabilityStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);

    const dashboard = new cw.Dashboard(this, 'Dashboard', {
      dashboardName: 'ontology-gcc-dev',
    });

    dashboard.addWidgets(
      new cw.GraphWidget({
        title: 'ECS API CPU/Memory',
        left: [
          new cw.Metric({ namespace: 'AWS/ECS', metricName: 'CPUUtilization',
            dimensionsMap: { ServiceName: 'ontology-gcc-dev-api', ClusterName: 'ontology-gcc-dev-cluster' } }),
          new cw.Metric({ namespace: 'AWS/ECS', metricName: 'MemoryUtilization',
            dimensionsMap: { ServiceName: 'ontology-gcc-dev-api', ClusterName: 'ontology-gcc-dev-cluster' } }),
        ],
      }),
      new cw.GraphWidget({
        title: 'Neptune CPU/Connections',
        left: [
          new cw.Metric({ namespace: 'AWS/Neptune', metricName: 'CPUUtilization',
            dimensionsMap: { DBClusterIdentifier: props.neptuneClusterId } }),
          new cw.Metric({ namespace: 'AWS/Neptune', metricName: 'TotalRequestsPerSec',
            dimensionsMap: { DBClusterIdentifier: props.neptuneClusterId } }),
        ],
      }),
    );

    new cw.Alarm(this, 'ApiHighCpu', {
      alarmName: 'gcc-api-high-cpu',
      metric: new cw.Metric({
        namespace: 'AWS/ECS', metricName: 'CPUUtilization',
        dimensionsMap: { ServiceName: 'ontology-gcc-dev-api', ClusterName: 'ontology-gcc-dev-cluster' },
        period: cdk.Duration.minutes(5),
      }),
      threshold: 85,
      evaluationPeriods: 3,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING,
    });
  }
}
```

- [ ] **Step 2: synth 검증**

```bash
cd infra-cdk
npx cdk synth ontology-gcc-dev-observability 2>&1 | tail -10
cd -
```
Expected: synth 성공.

- [ ] **Step 3: 커밋**

```bash
git add infra-cdk/lib/observability-stack.ts
git commit -m "feat(infra): observability stack — dashboard + ECS alarm"
```

---

### Task 1.8: Jest 스냅샷 테스트 (6 stacks)

**Files:**
- Modify: `infra-cdk/test/stacks.test.ts`
- Modify: `infra-cdk/jest.config.ts` (있으면 설정 확인)

- [ ] **Step 1: 테스트 파일 작성**

`infra-cdk/test/stacks.test.ts` 전체:

```typescript
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { NetworkStack } from '../lib/network-stack';
import { DataStack } from '../lib/data-stack';
import { ComputeStack } from '../lib/compute-stack';
import { AiStack } from '../lib/ai-stack';
import { EdgeStack } from '../lib/edge-stack';
import { ObservabilityStack } from '../lib/observability-stack';

const env = { account: '111122223333', region: 'ap-northeast-2' };
const retailVpc = {
  vpcId: 'vpc-fake',
  availabilityZones: ['ap-northeast-2a', 'ap-northeast-2b', 'ap-northeast-2c'],
  publicSubnetIds:    ['subnet-pub1','subnet-pub2','subnet-pub3'],
  privateSubnetIds:   ['subnet-pri1','subnet-pri2','subnet-pri3'],
  isolatedSubnetIds:  ['subnet-iso1','subnet-iso2','subnet-iso3'],
};

function buildApp() {
  const app = new cdk.App();
  const network = new NetworkStack(app, 't-network', { env, retailVpc });
  const data = new DataStack(app, 't-data', { env,
    vpc: network.vpc, appSg: network.appSg, neptuneSg: network.neptuneSg, osSg: network.osSg });
  const ai = new AiStack(app, 't-ai', { env, rawDocsBucket: data.rawDocsBucket });
  const compute = new ComputeStack(app, 't-compute', { env,
    vpc: network.vpc, appSg: network.appSg, albSg: network.albSg,
    neptuneEndpoint: data.neptuneEndpoint, openSearchEndpoint: data.openSearchEndpoint,
    rawDocsBucket: data.rawDocsBucket, uploadsBucket: data.uploadsBucket,
    syntheticDataBucket: data.syntheticDataBucket,
    bedrockKbId: ai.kbId, bedrockGuardrailId: ai.guardrailId, agentCoreMemoryId: ai.memoryId });
  const edge = new EdgeStack(app, 't-edge', { env: { ...env, region: 'us-east-1' }, alb: compute.alb });
  const obs = new ObservabilityStack(app, 't-obs', { env,
    apiServiceArn: compute.apiServiceArn, webServiceArn: compute.webServiceArn,
    neptuneClusterId: data.neptuneClusterId });
  return { network, data, ai, compute, edge, obs };
}

describe('GCC stacks snapshot', () => {
  test.each([
    ['network'], ['data'], ['ai'], ['compute'], ['edge'], ['obs'],
  ])('%s stack matches snapshot', (name) => {
    const stacks = buildApp();
    const stack = (stacks as any)[name];
    expect(Template.fromStack(stack).toJSON()).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: jest 의존성 설치**

```bash
cd infra-cdk
grep -E "\"jest\"|\"ts-jest\"|@types/jest" package.json || \
  npm install --save-dev jest ts-jest @types/jest
cd -
```

- [ ] **Step 3: jest 첫 실행 — 6 스냅샷 생성**

```bash
cd infra-cdk
npx jest --ci 2>&1 | tail -15
cd -
```
Expected: 6 tests passed, 6 snapshots written.

- [ ] **Step 4: 커밋**

```bash
git add infra-cdk/test/stacks.test.ts infra-cdk/test/__snapshots__/
git commit -m "test(infra): jest snapshot tests for 6 stacks"
```

---

### Task 1.9: api/web 최소 컨테이너 + `/healthz` + 빈 홈

**Files:**
- Create: `api/main.py`·`api/config.py`·`api/aws_clients.py`·`api/middleware_auth.py`·`api/requirements.txt`·`api/Dockerfile`
- Create: `web/app/layout.tsx`·`web/app/page.tsx`·`web/components/Sidebar.tsx`·`web/lib/api-client.ts`·`web/package.json`·`web/next.config.mjs`·`web/tsconfig.json`·`web/tailwind.config.ts`·`web/Dockerfile`
- Create: `tests/conftest.py`·`tests/test_smoke.py`·`tests/api/test_healthz.py`

- [ ] **Step 1: TDD — `tests/api/test_healthz.py` 먼저 작성**

```python
# tests/api/test_healthz.py
import os
os.environ.setdefault('DEMO_PUBLIC_MODE', 'true')

from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)

def test_healthz_returns_200_ok():
    response = client.get('/healthz')
    assert response.status_code == 200
    assert response.json() == {'status': 'ok'}
```

- [ ] **Step 2: 테스트 실행 — FAIL 확인**

```bash
pip install fastapi httpx pydantic-settings pytest
pytest tests/api/test_healthz.py -v 2>&1 | tail -10
```
Expected: `ModuleNotFoundError: No module named 'api.main'`.

- [ ] **Step 3: `api/main.py` 최소 구현**

```python
# api/main.py
from fastapi import FastAPI

app = FastAPI(title='ontology-gcc-api', version='0.1.0')

@app.get('/healthz')
async def healthz():
    return {'status': 'ok'}
```

- [ ] **Step 4: 테스트 재실행 — PASS 확인**

```bash
pytest tests/api/test_healthz.py -v 2>&1 | tail -5
```
Expected: `1 passed`.

- [ ] **Step 5: 나머지 api 파일 (config, aws_clients, middleware_auth, requirements, Dockerfile)**

`api/config.py`:
```python
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
    AWS_REGION: str = 'ap-northeast-2'
    NEPTUNE_ENDPOINT: str = ''
    OPENSEARCH_ENDPOINT: str = ''
    OPENSEARCH_INDEX: str = 'ontology-gcc-dev-kb-index'
    BEDROCK_CHAT_MODEL_ID: str = 'global.anthropic.claude-sonnet-4-6'
    BEDROCK_EMBED_MODEL_ID: str = 'global.cohere.embed-v4:0'
    BEDROCK_KB_ID: str = ''
    BEDROCK_GUARDRAIL_ID: str = ''
    AGENTCORE_MEMORY_ID: str = ''
    COGNITO_USER_POOL_ID: str = ''
    ORIGIN_AUTH_TOKEN: str = ''
    PUBLIC_DOMAIN: str = ''
    DEMO_PUBLIC_MODE: bool = False
    REQUIRE_ORIGIN_AUTH: bool = True
    ONTOLOGY_ENV: str = 'dev'

settings = Settings()
```

`api/aws_clients.py`:
```python
from functools import lru_cache
import boto3
from .config import settings

@lru_cache
def session() -> boto3.Session:
    return boto3.Session(region_name=settings.AWS_REGION)
```

`api/middleware_auth.py`: skeleton — Plan 5에서 retail 구현 그대로 복사:
```python
from fastapi import Request, HTTPException
from .config import settings

async def cognito_jwt_middleware(request: Request, call_next):
    if settings.DEMO_PUBLIC_MODE or request.url.path in ('/healthz', '/metrics'):
        return await call_next(request)
    # Plan 5: retail의 RS256 JWT 검증 + JWKS TTL 캐시 + constant-time origin token 비교
    raise HTTPException(503, 'auth not yet wired')
```

`api/requirements.txt`:
```
fastapi==0.115.0
uvicorn[standard]==0.30.6
pydantic==2.9.2
pydantic-settings==2.5.2
httpx==0.27.2
boto3==1.35.36
opensearch-py==2.7.1
```

`api/Dockerfile` (ARM64 multi-purpose):
```dockerfile
FROM --platform=linux/arm64 python:3.12-slim
WORKDIR /app
COPY api/requirements.txt /tmp/req.txt
RUN pip install --no-cache-dir -r /tmp/req.txt
COPY api/ /app/api/
COPY data/ /app/data/
ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 6: web 최소 파일 (layout, page, Sidebar stub, package, next.config, tsconfig, tailwind, Dockerfile)**

`web/package.json`:
```json
{
  "name": "ontology-gcc-web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "next": "14.2.13",
    "react": "18.3.1",
    "react-dom": "18.3.1"
  },
  "devDependencies": {
    "@types/node": "22.7.5",
    "@types/react": "18.3.11",
    "typescript": "5.6.2",
    "tailwindcss": "3.4.13",
    "postcss": "8.4.47",
    "autoprefixer": "10.4.20"
  }
}
```

`web/next.config.mjs`:
```javascript
const config = { output: 'standalone', reactStrictMode: true };
export default config;
```

`web/app/layout.tsx`:
```tsx
import './globals.css';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'ontology-gcc', description: 'GS Caltex 고객 온톨로지 PoC' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang='ko'><body className='min-h-screen bg-white text-slate-900'>{children}</body></html>;
}
```

`web/app/page.tsx`:
```tsx
import Sidebar from '../components/Sidebar';
export default function Home() {
  return (
    <main className='flex'>
      <Sidebar />
      <section className='flex-1 p-8'>
        <h1 className='text-3xl font-bold'>ontology-gcc</h1>
        <p className='mt-2 text-slate-600'>GS Caltex M&M본부 고객 데이터 PoC — 시나리오는 Plan 3·4에서 구축됩니다.</p>
      </section>
    </main>
  );
}
```

`web/components/Sidebar.tsx`:
```tsx
const SCENARIOS = [
  ['A', '의미 검색', '/search'],
  ['B', '대화 에이전트', '/chat'],
  ['C', 'MD 인사이트', '/insights'],
  ['D', '페르소나 매칭', '/persona-match'],
  ['E', '고객 클러스터링', '/cluster'],
  ['F', '룩어라이크', '/lookalike'],
  ['G', '캠페인 ROI', '/campaign-roi'],
  ['H', '주유소 네트워크', '/network'],
  ['I', '약관·규제', '/compliance'],
  ['J', '외부 시그널', '/signals'],
  ['K', 'Outlier 탐지', '/outlier'],
  ['L', '결제·가격', '/payment'],
  ['M', '고객 통합 여정', '/journey'],
  ['N', '날씨 × 주유', '/weather'],
];
export default function Sidebar() {
  return (
    <nav className='w-64 border-r border-slate-200 p-4 bg-slate-50'>
      <h2 className='text-xs font-semibold uppercase text-slate-500'>시나리오</h2>
      <ul className='mt-2 space-y-1'>
        {SCENARIOS.map(([code, name, href]) => (
          <li key={code}><a href={href} className='block px-2 py-1 rounded hover:bg-slate-200'>
            <span className='font-mono text-xs text-slate-400 mr-2'>{code}</span>{name}
          </a></li>
        ))}
      </ul>
    </nav>
  );
}
```

`web/Dockerfile`:
```dockerfile
FROM --platform=linux/arm64 node:20-slim AS deps
WORKDIR /app
COPY web/package.json web/package-lock.json* ./
RUN npm ci

FROM --platform=linux/arm64 node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY web/ ./
RUN npm run build

FROM --platform=linux/arm64 node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```

`tests/conftest.py`:
```python
import os
os.environ.setdefault('DEMO_PUBLIC_MODE', 'true')
os.environ.setdefault('REQUIRE_ORIGIN_AUTH', 'false')
os.environ.setdefault('AWS_REGION', 'ap-northeast-2')
```

`tests/test_smoke.py`:
```python
def test_main_imports():
    from api import main
    assert main.app is not None
```

- [ ] **Step 7: 모든 테스트 통과 검증**

```bash
pytest tests/ -v 2>&1 | tail -10
```
Expected: 2 passed (test_healthz + test_main_imports).

- [ ] **Step 8: 커밋**

```bash
git add api/ web/ tests/
git commit -m "feat: minimal api+web with /healthz, 14-scenario sidebar stub, smoke tests"
```

---

### Task 1.10: 전체 cdk synth → bootstrap → deploy

**Files:** none new (all CDK already in place from Tasks 1.1~1.8). 이 task는 명령 실행 + 검증.

전제: `.env` 파일에 `RETAIL_VPC_*` 5개 env 모두 채워짐 (Task 1.1에서 완료).

- [ ] **Step 1: 전체 synth**

```bash
cd infra-cdk
set -a; source ../.env; set +a
npx cdk synth --all 2>&1 | tail -20
cd -
```
Expected: 6 stacks 모두 `Successfully synthesized`. cdk.out/에 6개 template JSON.

- [ ] **Step 2: 6 스택 jest 스냅샷 ↔ synth 일치 확인**

```bash
cd infra-cdk
npx jest --ci 2>&1 | tail -10
cd -
```
Expected: 6 tests passed (no snapshot mismatch).

- [ ] **Step 3: cdk bootstrap (retail이 이미 부트스트랩한 동일 account/region이면 skip 가능)**

```bash
cd infra-cdk
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
npx cdk bootstrap aws://$ACCOUNT/ap-northeast-2 2>&1 | tail -5
cd -
```
Expected: `already bootstrapped` 또는 새 부트스트랩 성공.

- [ ] **Step 4: data·ai·observability 먼저 배포 (compute가 의존)**

```bash
cd infra-cdk
npx cdk deploy ontology-gcc-dev-network ontology-gcc-dev-data ontology-gcc-dev-ai \
  --require-approval never 2>&1 | tail -30
cd -
```
Expected: 3 스택 배포 성공. CFN Outputs에 `NeptuneEndpoint`·`OpenSearchEndpoint`·`GuardrailId`·`SyntheticBucketName` 등.

- [ ] **Step 5: 임시로 ai-stack에서 placeholder `bedrockKbId`/`memoryId` 처리 검증**

ai-stack의 `kbId = Fn.importValue('GccBedrockKbId')`가 실제 export 없어서 deploy 실패할 수 있음. 임시로 ai-stack의 해당 라인을 `this.kbId = 'PLACEHOLDER-KB-ID'`로 hard-code (추후 Plan 5 polish에서 KB 실제 생성 + Output export 추가). 변경 후:

```bash
cd infra-cdk
npx cdk deploy ontology-gcc-dev-ai --require-approval never 2>&1 | tail -10
cd -
```

- [ ] **Step 6: compute 배포 (ECR 이미지가 아직 없으므로 service desiredCount는 0으로 임시)**

`compute-stack.ts`의 `desiredCount: 2`를 `desiredCount: 0`으로 임시 변경 후:

```bash
cd infra-cdk
npx cdk deploy ontology-gcc-dev-compute --require-approval never 2>&1 | tail -20
cd -
```
Expected: ALB·ECS cluster·서비스(0 task)·ECR repo 생성 완료.

- [ ] **Step 7: edge·observability 배포**

```bash
cd infra-cdk
npx cdk deploy ontology-gcc-dev-edge ontology-gcc-dev-observability \
  --require-approval never 2>&1 | tail -20
cd -
```
Expected: CloudFront distribution·Cognito user pool·dashboard·alarm 생성. CFN Output `CloudFrontDomainName` 표시.

- [ ] **Step 8: 모든 스택 배포 결과 확인**

```bash
aws cloudformation list-stacks --region ap-northeast-2 \
  --query "StackSummaries[?starts_with(StackName, 'ontology-gcc-dev')].[StackName,StackStatus]" \
  --output table
```
Expected: 6 스택 모두 `CREATE_COMPLETE`.

- [ ] **Step 9: 커밋 (배포 변경사항 — placeholder + desiredCount=0)**

```bash
git add infra-cdk/lib/ai-stack.ts infra-cdk/lib/compute-stack.ts
git commit -m "chore(infra): temporary placeholders for first deploy (kbId, desiredCount=0)"
```

---

### Task 1.11: 컨테이너 빌드 + ECR 푸시 + ECS 서비스 가동

**Files:** none.

- [ ] **Step 1: ECR 로그인**

```bash
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REGION=ap-northeast-2
aws ecr get-login-password --region $REGION | \
  docker login --username AWS --password-stdin ${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com
```
Expected: `Login Succeeded`.

- [ ] **Step 2: API 이미지 빌드·푸시 (ARM64)**

```bash
SHA=$(git rev-parse --short HEAD)
docker build --platform linux/arm64 -f api/Dockerfile \
  -t ${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/ontology-gcc-dev-api:${SHA} \
  -t ${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/ontology-gcc-dev-api:latest .
docker push ${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/ontology-gcc-dev-api:${SHA}
docker push ${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/ontology-gcc-dev-api:latest
```
Expected: push 성공.

- [ ] **Step 3: Web 이미지 빌드·푸시**

```bash
docker build --platform linux/arm64 -f web/Dockerfile \
  -t ${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/ontology-gcc-dev-web:${SHA} \
  -t ${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/ontology-gcc-dev-web:latest .
docker push ${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/ontology-gcc-dev-web:${SHA}
docker push ${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/ontology-gcc-dev-web:latest
```

- [ ] **Step 4: compute-stack `desiredCount` 2로 복귀 + 재배포**

`infra-cdk/lib/compute-stack.ts`의 `desiredCount: 0`을 `desiredCount: 2`로 되돌리고:

```bash
cd infra-cdk
npx cdk deploy ontology-gcc-dev-compute --require-approval never 2>&1 | tail -10
cd -
```

- [ ] **Step 5: 서비스 헬스 — running task 2개씩**

```bash
aws ecs describe-services --cluster ontology-gcc-dev-cluster \
  --services ontology-gcc-dev-api ontology-gcc-dev-web \
  --query "services[].[serviceName,runningCount,desiredCount]" --output table
```
Expected: 두 서비스 모두 running=desired=2 (배포에 1~2분 소요, 필요시 polling).

- [ ] **Step 6: ALB 직접 헬스체크 (CloudFront 통하지 않고)**

```bash
ALB_DNS=$(aws cloudformation describe-stacks --stack-name ontology-gcc-dev-compute \
  --query "Stacks[0].Outputs[?OutputKey=='AlbDnsName'].OutputValue" --output text)
curl -sf -H "Host: temp" http://$ALB_DNS/healthz
```
Expected: `{"status":"ok"}`.

- [ ] **Step 7: 커밋**

```bash
git add infra-cdk/lib/compute-stack.ts
git commit -m "chore(infra): restore desiredCount=2 after first image push"
```

---

### Task 1.12: Cognito 사용자 프로비저닝 + CloudFront 200 OK 검증

**Files:**
- Create: `scripts/cognito-provision.sh`·`scripts/cognito-update-callbacks.sh`
- Create: `docs/runbooks/01-first-deployment.md`·`02-add-custom-domain.md`

- [ ] **Step 1: cognito-provision.sh 작성**

`scripts/cognito-provision.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
USER_POOL_ID="${1:?usage: $0 <user-pool-id>}"
PASSWORD="${2:-!234Qwer}"
for email in admin@whchoi.net demo@whchoi.net; do
  aws cognito-idp admin-create-user --user-pool-id "$USER_POOL_ID" \
    --username "$email" \
    --user-attributes Name=email,Value="$email" Name=email_verified,Value=true \
    --message-action SUPPRESS 2>/dev/null || echo "User $email may already exist"
  aws cognito-idp admin-set-user-password --user-pool-id "$USER_POOL_ID" \
    --username "$email" --password "$PASSWORD" --permanent
  echo "Provisioned $email"
done
```

```bash
chmod +x scripts/cognito-provision.sh
```

- [ ] **Step 2: cognito-update-callbacks.sh 작성 (안전 PUT)**

`scripts/cognito-update-callbacks.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
USER_POOL_ID="${1:?usage: $0 <user-pool-id> <client-id> <new-domain>}"
CLIENT_ID="${2:?}"
NEW_DOMAIN="${3:?}"

CURRENT=$(aws cognito-idp describe-user-pool-client \
  --user-pool-id "$USER_POOL_ID" --client-id "$CLIENT_ID" \
  --query "UserPoolClient" --output json)

NEW_CALLBACK="https://${NEW_DOMAIN}/auth/callback"
NEW_LOGOUT="https://${NEW_DOMAIN}"

UPDATED=$(echo "$CURRENT" | python3 -c "
import json, sys
d = json.load(sys.stdin)
cbs = list(set(d.get('CallbackURLs', []) + ['$NEW_CALLBACK']))
los = list(set(d.get('LogoutURLs', []) + ['$NEW_LOGOUT']))
print(json.dumps({'CallbackURLs': cbs, 'LogoutURLs': los}))
")

aws cognito-idp update-user-pool-client \
  --user-pool-id "$USER_POOL_ID" \
  --client-id "$CLIENT_ID" \
  --callback-urls $(echo "$UPDATED" | python3 -c "import json,sys;print(' '.join(json.load(sys.stdin)['CallbackURLs']))") \
  --logout-urls $(echo "$UPDATED" | python3 -c "import json,sys;print(' '.join(json.load(sys.stdin)['LogoutURLs']))") \
  --allowed-o-auth-flows code \
  --allowed-o-auth-scopes openid email \
  --allowed-o-auth-flows-user-pool-client \
  --supported-identity-providers COGNITO

echo "Callbacks updated for $NEW_DOMAIN"
```

```bash
chmod +x scripts/cognito-update-callbacks.sh
```

- [ ] **Step 3: 사용자 프로비저닝 실행**

```bash
USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name ontology-gcc-dev-edge \
  --region us-east-1 \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)
bash scripts/cognito-provision.sh "$USER_POOL_ID"
```
Expected: `Provisioned admin@whchoi.net` + `Provisioned demo@whchoi.net`.

- [ ] **Step 4: CloudFront 도메인으로 200 OK 검증**

```bash
CF_DOMAIN=$(aws cloudformation describe-stacks --stack-name ontology-gcc-dev-edge \
  --region us-east-1 \
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDomainName'].OutputValue" --output text)
echo "CloudFront: https://$CF_DOMAIN"
# CloudFront 캐시 propagation에 5~15분 소요 가능. 폴링:
for i in 1 2 3 4 5; do
  STATUS=$(curl -so /dev/null -w "%{http_code}" "https://$CF_DOMAIN/" || true)
  echo "Attempt $i: HTTP $STATUS"
  [ "$STATUS" = "200" ] && break
  sleep 30
done
```
Expected: 마지막 시도에서 HTTP 200 (또는 307 — auth로 redirect 시).

- [ ] **Step 5: 첫 배포 runbook 작성**

`docs/runbooks/01-first-deployment.md`에 위 명령들을 절차로 정리. 차후 재배포 시 참고.

- [ ] **Step 6: 도메인 추가 runbook 작성**

`docs/runbooks/02-add-custom-domain.md`:
```markdown
# 02 — Add Custom Domain (`gcc-ontology.whchoi.net`)

## Prereqs
- Plan 1 (Foundation) 완료, CloudFront 기본 도메인으로 200 OK.
- Route53 hosted zone `whchoi.net` 존재 + 권한.
- ACM 인증서 검증 가능한 DNS validation 권한.

## Steps

```bash
# 1) edge stack 재배포 with -c domain
cd infra-cdk
npx cdk deploy ontology-gcc-dev-edge -c domain=gcc-ontology.whchoi.net --require-approval never
cd -

# 2) Cognito callback 머지 PUT (기존 *.cloudfront.net + 신규 도메인 모두 유지)
USER_POOL_ID=...
CLIENT_ID=...
bash scripts/cognito-update-callbacks.sh "$USER_POOL_ID" "$CLIENT_ID" gcc-ontology.whchoi.net

# 3) Route53 A record (alias to CloudFront) — CDK가 생성. 만약 hosted zone 분리 시 수동:
# aws route53 change-resource-record-sets ...

# 4) 도메인 200 OK 검증
curl -I https://gcc-ontology.whchoi.net/
```
```

- [ ] **Step 7: 커밋**

```bash
git add scripts/ docs/runbooks/
git commit -m "feat(scripts): cognito provision + safe callback update + first deploy runbook"
```

---

### Task 1.13: Phase 1 종료 — CHANGELOG, harness-eval baseline, README 배지, 최종 sanity

**Files:**
- Modify: `CHANGELOG.md`·`README.md`

- [ ] **Step 1: CI 4-job 로컬 시뮬**

```bash
python3 -m compileall -q api data scripts
cd web && npx tsc --noEmit && cd -
cd infra-cdk && npx tsc --noEmit && npx jest --ci && cd -
pytest tests -q
```
Expected: 모두 그린.

- [ ] **Step 2: harness-eval 첫 실행 (선택, 사용 가능 시)**

```bash
# harness-eval:standard 또는 :quick — Plan 1 Foundation 후 baseline 평가
# (스킬은 이번 Plan 외부에서 호출되므로 task로는 명령만 메모)
echo "RUN: harness-eval:standard via Skill — record score in .harness-eval/latest.json"
```

- [ ] **Step 3: CHANGELOG 갱신**

`CHANGELOG.md` `## [Unreleased] / Added`에 추가:
```markdown
- Phase 1 Foundation: 6-stack CDK deployed (network imports retail VPC, others GCC-only).
- ECR repos `ontology-gcc-dev-api`/`-web` with first ARM64 images pushed.
- Cognito users `admin@whchoi.net` / `demo@whchoi.net` provisioned.
- ADRs 0001 (retail VPC import), 0002 (domain deferred), 0003 (Bulk Loader IAM prep).
- Runbooks: 01 first-deployment, 02 add-custom-domain.
- `*.cloudfront.net`에서 빈 홈이 200 OK.
```

- [ ] **Step 4: README 배지 마커 채움 (Phase 1 baseline)**

`README.md`의 `<!-- harness-eval-badge:start -->`~`end` 사이의 라벨을 baseline 점수(아직 평가 전이면 `0/10`·`F`·`baseline`)로 갱신. harness-eval 결과가 있으면 해당 점수.

- [ ] **Step 5: 최종 git log + tag**

```bash
git add CHANGELOG.md README.md
git commit -m "docs: Phase 1 baseline — Foundation complete, ready for Plan 2 (Data)"
git tag -a plan1-complete -m "Plan 1 Foundation complete on 2026-05-08"
git log --oneline | head -20
```
Expected: ~25개 커밋 (Phase 0 + Phase 1), 태그 `plan1-complete` 생성.

---

## Self-Review (writing-plans 스킬 권장)

**1. Spec coverage**: 
- Spec §1 인프라 → Phase 1 Tasks 1.1~1.7 ✓
- Spec §2 프로젝트 구조 → Phase 0 Tasks 0.1~0.2 (mfg fork) + Phase 1 Task 1.9 (api/web stub) ✓
- Spec §3·§4 시나리오·온톨로지 → Plan 2~4에서 커버 (Plan 1 범위 외, 의도적)
- Spec §5 데이터 전략 → Plan 2 (의도적 제외)
- Spec §6 빌드 단계 → Plan 1 = Phase 0+1, Plan 2~5가 나머지 ✓
- Spec §7 Risks → ADR 0001·0002·0003에 일부 반영 ✓
- Spec §8 OQ1 (retail VPC export) → Task 1.1 Step 1·2에서 결정 ✓
- Spec §9 Acceptance — Plan 1 범위만: deploy 6 stacks · 200 OK · admin/demo 로그인 (`/api/objects/...`·시나리오 페이지·eval은 Plan 2~5)

**2. Placeholder scan**: 
- Task 1.10 Step 5의 `PLACEHOLDER-KB-ID` 하드코드는 *명시적 임시 처리* (Plan 5 polish에서 KB 실 생성·export 추가) — 스펙 OQ로 수용.
- AgentCore Memory `pending-agentcore-memory-id` (Task 1.5) 동일하게 *명시적 임시 처리* — Plan 2 진입 전 retail의 AwsCustomResource 패턴 복사로 대체 (이미 ADR 0001 retail에서 검증된 패턴).

**3. Type consistency**: 
- `appSg`·`neptuneSg`·`osSg`·`albSg` 4개 SG가 NetworkStack 출력 → DataStack·ComputeStack 입력으로 일관 사용 ✓
- `kbId`·`guardrailId`·`memoryId` AiStack → ComputeStack 일관 ✓
- `domainName?` EdgeStack 옵셔널 prop, `-c domain=...` context 매개 ✓

**4. Ambiguity**: 
- Task 1.10 Step 5의 `Fn.importValue('GccBedrockKbId')`가 export 없는 상태에서 string으로 처리되어 synth 통과 — *Step 5 임시 하드코드 적용*으로 명시.

이슈 없음. Plan 1 작성 완료.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-08-plan1-foundation.md` (총 ~30 tasks, ~150 steps, Phase 0 Bootstrap + Phase 1 Infrastructure).

**다음에 어떻게 실행하시겠습니까?**

**1. Subagent-Driven (recommended)** — 각 task별로 fresh subagent 디스패치, task 사이 리뷰, 빠른 iteration. *대규모 plan에 강한 패턴 — 컨텍스트 분리·병렬 가능*.

**2. Inline Execution** — 이 세션에서 executing-plans 스킬로 batch 실행, 체크포인트 마다 검토. *컨텍스트 연속성이 필요한 경우*.

**3. 일단 멈추기 — Plan 1 검토 후 결정** — Plan 1 파일을 사용자가 직접 검토하고, Plan 2 (Data Pipeline) 작성으로 즉시 이동 또는 실제 실행 시점을 별도 결정.

어떤 옵션을 선택하시겠습니까?

