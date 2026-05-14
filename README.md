# ontology-gcc

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![English](https://img.shields.io/badge/lang-English-blue.svg)](#english)
[![한국어](https://img.shields.io/badge/lang-한국어-red.svg)](#한국어)

A 30–60 minute proof-of-concept demo for a Korean fuel-retail (GS Caltex) customer-analytics knowledge graph on AWS Bedrock + AgentCore + Neptune — 14 wow scenarios (A–N) · 25 ontology classes · 5 부서 페르소나 · real + synthetic + external data.

AWS Bedrock + AgentCore + Neptune 위에서 한국 주유 리테일(GS칼텍스) 고객 분석 지식그래프 14개 wow 시나리오(A–N) · 25 클래스 · 5 부서 페르소나를 보여주는 30–60분 PoC 데모. 실 데이터 cohort + 합성 lookalike + 외부 시그널(기상청·opinet) 3-tier 출처 분리.

---

# English

## Overview

`ontology-gcc` is a hands-on demonstration of how a 25-class domain ontology (customers, fuel transactions, gas stations, fuel products, weather observations, campaigns, coupons, app events, surveys, etc.) can power **14 distinct** customer-analytics scenarios for GS Caltex on AWS managed AI services. The demo deploys a multi-tier application — FastAPI backend, Next.js 14 frontend, AWS CDK infrastructure (6 stacks) — that integrates Bedrock Sonnet 4.6, AgentCore Memory and Code Interpreter, Neptune openCypher, OpenSearch Serverless hybrid search, and CloudFront-fronted ECS Fargate (Graviton ARM64).

Scenarios span semantic search, conversational marketer agent with multi-turn memory, MD-grade insights with streaming token summaries, persona matching, customer clustering, lookalike expansion, campaign ROI simulation, station network map, compliance/term-consent guardrails, external-signal fusion, behavior-change outlier detection (PM+M 92 RON DIY · 디젤→premium 전환), payment/price/channel matrix, full customer journey timeline, and weather × fuel correlation.

**Data cohorts (D14)**: real (deep-history 16 + sales-only 17 + coupon-only 500 + 약관 500), synthetic (lookalike-syn ~50,000 + PM+M 250 + 디젤→premium 250), external (기상청 단기예보 + opinet 가격 시계열). Each node is tagged with `data_depth` for cohort filtering and `source ∈ {real, synthetic, external}` for provenance badges.

## Features

- **Semantic Search (A)** — Korean natural-language queries through OpenSearch BM25 (Nori) + Cohere KNN hybrid, fused with reciprocal-rank fusion, then reranked with `cohere.rerank-v3` and visualized as a 1-hop knowledge subgraph.
- **Conversational Marketer Agent (B)** — Bedrock Converse multi-turn with AgentCore Memory short/long-term recall and 10 tool definitions, streamed via SSE with a live tool-call panel.
- **MD Insights (C)** — Sonnet 4.6 streaming Korean summary plus AgentCore Code Interpreter rendering matplotlib PNG charts with NanumGothic Korean glyphs.
- **Persona Match (D)** — 5-department personas (마케팅·고객전략·데이터·AI·CRM·회원사업·리테일영업) graph walk with weighted KPI scoring.
- **Customer Clustering (E)** — sklearn KMeans 6 clusters with LLM-driven cluster labels, write-back to Cluster nodes.
- **Lookalike Expansion (F)** — Cohere embed-v4 seed + OpenSearch KNN top-X% similarity expansion.
- **Campaign ROI Simulator (G)** — Bayesian conversion estimate plus Code Interpreter distribution chart, baseline ROI from CampaignAggregation pre-computed KPIs.
- **Station Network Map (H)** — Korean sido choropleth + 30~50 GSC stations with opinet_no real coords + haversine k-NN nearest stations.
- **Compliance Lens (I)** — Bedrock Guardrails plus Term/TermAgreement graph walk for marketing-eligibility filtering.
- **External Signal Fusion (J)** — 현대카드 consumption index + Airbridge app behavior + driving-inconvenience survey cross-source narrative.
- **Behavior-Change Outlier (K)** — pandas window detection (디젤→고급휘발유 transition, PM+M 92 RON DIY mixing) with LLM pattern labeling. PDF 3-page signature.
- **Payment/Price/Channel Analysis (L)** — PaymentMethod × FuelPrice × Channel matrix aggregation with Cytoscape flow visualization.
- **Customer Journey Timeline (M)** — App + Tx + Term + Coupon unified timeline with fuel-grade transition highlighting. PDF 3-page signature.
- **Weather × Fuel Correlation (N)** — 기상청 단기예보 17-시도 daily ETL × FuelTransaction join with scatter plot.

Plus: **25-class object explorer** (search · pagination · 1-hop subgraph), **meta page** (ER · Standards · Validation tabs), **operational console** (5 panels — ingest · guardrail · memory · eval · trace), and **GuidedTour** (5 페르소나 × 14 시나리오 추천 카드).

## Prerequisites

- AWS account with Bedrock, Neptune, OpenSearch Serverless, and AgentCore enabled in `ap-northeast-2`
- AWS CLI v2 with credentials (SSO or IAM)
- Node.js 20 or later
- Python 3.12 or later
- Docker with `linux/arm64` build support (Graviton ECS targets)
- AWS CDK v2.150 or later

## Installation

```bash
# Clone the repository
git clone https://github.com/whchoi98/ontology-gcc.git
cd ontology-gcc

# Install backend dependencies
python3 -m venv .venv
source .venv/bin/activate
pip install -r api/requirements.txt

# Install frontend dependencies
cd web && npm ci && cd -

# Install infrastructure dependencies
cd infra-cdk && npm ci && cd -

# Bootstrap CDK and deploy stacks
cd infra-cdk
npx cdk bootstrap aws://<account>/ap-northeast-2
npx cdk deploy --all
```

## Usage

```bash
# Build and push API + Web container images to ECR
docker build --platform linux/arm64 -f api/Dockerfile -t <ecr>/ontology-gcc-dev-api:latest .
docker build --platform linux/arm64 -f web/Dockerfile -t <ecr>/ontology-gcc-dev-web:latest .
docker push <ecr>/ontology-gcc-dev-api:latest
docker push <ecr>/ontology-gcc-dev-web:latest

# Reload synthetic data into Neptune + OpenSearch (one-shot ECS task)
aws ecs run-task \
  --cluster ontology-gcc-dev-cluster \
  --task-definition ontology-gcc-dev-api \
  --launch-type FARGATE \
  --overrides file://loader-overrides.json
# Loads ~50K customers (500 real + 49.5K synthetic lookalike), 139K fuel transactions,
# 8.5K stations, 1,275 days × 17 sido weather observations, 5 부서 personas

# Force a service rollout after image push
aws ecs update-service \
  --cluster ontology-gcc-dev-cluster \
  --service ontology-gcc-dev-api \
  --force-new-deployment

# Visit the deployed CloudFront domain
open https://<cloudfront-distribution>.cloudfront.net
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `AWS_REGION` | AWS region for all services | `ap-northeast-2` |
| `NEPTUNE_ENDPOINT` | Neptune cluster writer endpoint | resolved from CDK output |
| `OPENSEARCH_ENDPOINT` | OpenSearch Serverless collection endpoint | resolved from CDK output |
| `OPENSEARCH_INDEX` | Vector + BM25 index name | `ontology-gcc-dev-kb-index` |
| `BEDROCK_CHAT_MODEL_ID` | Foundation model for chat and insights | `global.anthropic.claude-sonnet-4-6` |
| `BEDROCK_KB_ID` | Bedrock Knowledge Base ID | resolved from CDK output |
| `BEDROCK_GUARDRAIL_ID` | Bedrock Guardrails ID | resolved from CDK output |
| `BEDROCK_RERANKER_INFERENCE_PROFILE_ARN` | Cross-region inference profile for reranker | (set per environment) |
| `BEDROCK_EMBED_MODEL_ID` | Embedding model | `global.cohere.embed-v4:0` |
| `AGENTCORE_MEMORY_ID` | AgentCore Memory store ID | resolved from CDK output |
| `COGNITO_USER_POOL_ID` | Cognito user pool for SSO | resolved from CDK output |
| `ORIGIN_AUTH_SECRET_ARN` | CloudFront-to-ALB shared secret ARN | resolved from CDK output |
| `RAW_DOCS_BUCKET` | S3 bucket for KB raw documents | `ontology-gcc-dev-raw-docs-<account>` |
| `UPLOADS_BUCKET` | S3 bucket for user uploads | `ontology-gcc-dev-uploads-<account>` |
| `SYNTHETIC_DATA_BUCKET` | S3 bucket for loader sync | `ontology-gcc-dev-synthetic-data-<account>` |
| `ONTOLOGY_ENV` | Environment name | `dev` |
| `PUBLIC_DOMAIN` | CloudFront distribution domain | resolved from CDK output |

## Project Structure

```
ontology-gcc/
├── api/                  # FastAPI backend (Python 3.12, ARM64)
│   ├── routers/          # Per-scenario endpoints (chat, search, insights, logistics, ...)
│   ├── services/         # Bedrock, Neptune, OpenSearch, AgentCore wrappers
│   ├── middleware_auth.py # Cognito JWT verification
│   └── Dockerfile        # Multi-purpose: API server + one-shot data loader
├── web/                  # Next.js 14 frontend (TypeScript, ARM64)
│   ├── app/              # App Router scenarios A-L + objects + ops + meta
│   ├── components/       # PersonaSwitch, GuidedTour, CytoscapeView, Sidebar
│   └── lib/api-client.ts # Typed SSE + REST client
├── infra-cdk/            # AWS CDK v2 infrastructure (TypeScript)
│   ├── lib/              # network, data, compute, ai, edge, observability stacks
│   └── test/             # Jest snapshot tests for all 6 stacks
├── data/                 # Synthetic data generator + Neptune/OpenSearch loader
├── ontology/             # Mapping CSVs (Opinet 유종/주유소 codes, KFDA 약관 terms,
│                         #  GSC 내부 codes, KOSTAT 시도 GeoJSON, 5부서×14시나리오 priority)
├── tests/                # Pytest suite — smoke + tests/api/ (httpx integration)
├── docs/                 # Architecture, ADRs (decisions/0001-0004), runbooks
├── scripts/              # KB index, Cognito provisioning, evaluation
├── .claude/              # Project harness — agents, skills, hooks, commands
├── .github/workflows/    # CI pipeline (python-ast, tsc, cdk-synth+jest, pytest)
└── .harness-eval/        # Score history (drives the Harness Score badge)
```

## Testing

The project has four test surfaces, ordered fastest first:

```bash
# 1. Python AST validation (no installs, ~1s) — also a CI job
python3 -m compileall -q api data scripts

# 2. TypeScript type-check (~10s with cache) — runs for both web and infra-cdk in CI
cd web && npx tsc --noEmit
cd infra-cdk && npx tsc --noEmit

# 3. Pytest offline suite (28 tests, <1s) — smoke imports + Pydantic validation + /api/search integration with mocked services
pip install -r api/requirements.txt -r requirements-dev.txt
pytest tests -q

# 4. CDK snapshot tests (6 stacks, ~13s) — drift detection on Template.fromStack().toJSON()
cd infra-cdk && npx jest --ci

# 5. Live wow-query evaluation against deployed CloudFront (target ≥85%, sys.exit(1) below)
python3 scripts/eval_wow_queries.py
```

Steps 1–4 run in `.github/workflows/ci.yml` on every push/PR (concurrency cancel-in-progress). Step 5 requires a deployed environment.

## API Documentation

See [docs/api-reference.md](docs/api-reference.md) for the full OpenAPI surface, including:

- `POST /api/search` and `POST /api/search/stream` (Scenario A)
- `POST /api/chat` (Scenario B, SSE)
- `POST /api/insights` and `POST /api/insights/stream` (Scenario C)
- `POST /api/persona-match` (Scenario D)
- `POST /api/safety/check` (Scenario E)
- `POST /api/substitute` (Scenario F)
- `POST /api/price/compare` (Scenario G)
- `GET  /api/logistics/{network,status,events,warehouse/...,inventory/...,nearest,shortest-path}` (Scenario H)
- `GET  /api/objects/{type}` and `/api/objects/{type}/{id}`
- `GET  /api/ontology/{schema,standards,validation}`
- `GET  /api/ops/{ingest,guardrail,memory,eval,trace}`

## Contributing

1. Fork the repository.
2. Create a feature branch: `git checkout -b feat/<scenario-or-fix>`.
3. Make changes following the conventions in [CLAUDE.md](CLAUDE.md). Use Conventional Commits format (e.g. `feat(api): add price compare`, `fix(infra-cdk): correct Cognito password policy`).
4. Push the branch: `git push origin feat/<scenario-or-fix>`.
5. Open a Pull Request describing the scenario impact and any infrastructure changes.

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## Contact

- Maintainer: [whchoi98](https://github.com/whchoi98)
- Issues: <https://github.com/whchoi98/ontology-gcc/issues>
- Email: whchoi98@gmail.com

---

# 한국어

## 개요

`ontology-gcc`은 25-class 도메인 온톨로지(고객, 주유 거래, 주유소, 연료 상품, 기상 관측, 캠페인, 쿠폰, 앱 행동, 설문, 약관 등)가 AWS 매니지드 AI 서비스 위에서 GS칼텍스를 위한 **14가지** 고객 분석 시나리오를 어떻게 구동하는지 보여주는 실습형 데모입니다. FastAPI 백엔드, Next.js 14 프론트엔드, AWS CDK 인프라(6 stacks)로 구성된 다층 애플리케이션이 Bedrock Sonnet 4.6, AgentCore Memory와 Code Interpreter, Neptune openCypher, OpenSearch Serverless 하이브리드 검색, CloudFront 앞단에 ECS Fargate(Graviton ARM64)를 통합합니다.

시나리오는 의미 검색, 다회차 메모리 기반 대화형 마케터 에이전트, 토큰 스트리밍 요약을 갖춘 MD급 인사이트, 페르소나 매칭, 고객 클러스터링, 룩어라이크 확장, 캠페인 ROI 시뮬레이션, 주유소 네트워크 지도, 컴플라이언스/약관 동의 가드레일, 외부 신호 융합, 행동 변화 이상치 탐지(PM+M 92 RON DIY · 디젤→premium 전환), 결제·가격·채널 매트릭스, 고객 통합 여정 timeline, 날씨 × 주유 상관 등 14개에 걸쳐 있습니다.

**데이터 cohort (D14)**: real (deep-history 16 + sales-only 17 + coupon-only 500 + 약관 500), synthetic (lookalike-syn ~50,000 + PM+M 250 + 디젤→premium 250), external (기상청 단기예보 + opinet 가격 시계열). 각 노드에 `data_depth`와 `source ∈ {real, synthetic, external}`를 태깅하여 cohort 필터링과 출처 배지 노출 가능.

**데모 사용자**: `admin@whchoi.net` / `demo@whchoi.net` (비밀번호 `!234Qwer`).

## 주요 기능

- **의미 검색 (A)** — 한국어 자연어 쿼리를 OpenSearch BM25(Nori) + Cohere KNN 하이브리드로 처리하고 RRF로 융합한 뒤 `cohere.rerank-v3`으로 재정렬해 1-hop 지식그래프 부분그래프와 함께 시각화합니다.
- **대화형 마케터 에이전트 (B)** — Bedrock Converse 다회차 + AgentCore Memory short/long-term 회상 + 10개 도구 정의를 SSE로 스트리밍하며 실시간 도구 호출 패널을 보여줍니다.
- **MD 인사이트 (C)** — Sonnet 4.6 토큰 스트리밍 한국어 요약 + AgentCore Code Interpreter가 NanumGothic 한글 폰트로 matplotlib PNG 차트를 렌더링합니다.
- **페르소나 매칭 (D)** — 5개 부서 페르소나(마케팅·고객전략·데이터·AI·CRM·회원사업·리테일영업)를 대상으로 그래프 워크 + 가중 KPI 스코어링.
- **고객 클러스터링 (E)** — sklearn KMeans 6개 클러스터 + LLM 기반 클러스터 라벨링, Cluster 노드로 결과 write-back.
- **룩어라이크 확장 (F)** — Cohere embed-v4 시드 + OpenSearch KNN 상위 X% 유사도 확장.
- **캠페인 ROI 시뮬레이터 (G)** — 베이지안 전환 추정 + Code Interpreter 분포 차트, CampaignAggregation 사전 계산 KPI 기반 baseline ROI.
- **주유소 네트워크 지도 (H)** — 한국 시도 choropleth + opinet_no 실제 좌표 기반 30~50 GSC 주유소 + haversine k-NN 가까운 주유소 검색.
- **컴플라이언스 렌즈 (I)** — Bedrock Guardrails + Term/TermAgreement 그래프 워크로 마케팅 적격성 필터링.
- **외부 신호 융합 (J)** — 현대카드 소비 지수 + Airbridge 앱 행동 + 운전 불편 설문 교차 소스 내러티브.
- **행동 변화 이상치 (K)** — pandas 윈도 탐지(디젤→고급휘발유 전환, PM+M 92 RON DIY 혼합) + LLM 패턴 라벨링. PDF 3-page 시그니처.
- **결제·가격·채널 분석 (L)** — PaymentMethod × FuelPrice × Channel 매트릭스 집계 + Cytoscape 흐름 시각화.
- **고객 통합 여정 timeline (M)** — App + Tx + Term + Coupon 통합 시간축 + 유종 전환 강조. PDF 3-page 시그니처.
- **날씨 × 주유 상관 (N)** — 기상청 단기예보 17-시도 일별 ETL × FuelTransaction 산점도.

추가: **25-class 객체 탐색기** (검색 · 페이지네이션 · 1-hop subgraph), **메타 페이지** (ER · 표준 · 검증 리포트 3-탭), **운영 콘솔** (5 패널 — 적재 · 가드레일 · 메모리 · 평가 · 트레이스), **GuidedTour** (5 페르소나 × 14 시나리오 추천 카드).

## 사전 요구 사항

- `ap-northeast-2`에서 Bedrock, Neptune, OpenSearch Serverless, AgentCore가 활성화된 AWS 계정
- 자격 증명이 구성된 AWS CLI v2 (SSO 또는 IAM)
- Node.js 20 이상
- Python 3.12 이상
- `linux/arm64` 빌드를 지원하는 Docker (Graviton ECS 타깃)
- AWS CDK v2.150 이상

## 설치 방법

```bash
# 저장소 클론
git clone https://github.com/whchoi98/ontology-gcc.git
cd ontology-gcc

# 백엔드 의존성 설치
python3 -m venv .venv
source .venv/bin/activate
pip install -r api/requirements.txt

# 프론트엔드 의존성 설치
cd web && npm ci && cd -

# 인프라 의존성 설치
cd infra-cdk && npm ci && cd -

# CDK 부트스트랩 + 전체 스택 배포
cd infra-cdk
npx cdk bootstrap aws://<account>/ap-northeast-2
npx cdk deploy --all
```

## 사용법

```bash
# API + Web 컨테이너 이미지 빌드 후 ECR로 푸시
docker build --platform linux/arm64 -f api/Dockerfile -t <ecr>/ontology-gcc-dev-api:latest .
docker build --platform linux/arm64 -f web/Dockerfile -t <ecr>/ontology-gcc-dev-web:latest .
docker push <ecr>/ontology-gcc-dev-api:latest
docker push <ecr>/ontology-gcc-dev-web:latest

# 합성 데이터를 Neptune + OpenSearch로 일회성 ECS 태스크로 적재
aws ecs run-task \
  --cluster ontology-gcc-dev-cluster \
  --task-definition ontology-gcc-dev-api \
  --launch-type FARGATE \
  --overrides file://loader-overrides.json
# 약 50K 고객 (실데이터 N=500 + 합성 룩어라이크 49.5K), 139K 주유 거래,
# 8.5K 주유소, 1,275일 × 17 시도 KMA 기상, 5 부서 페르소나 적재

# 이미지 푸시 후 서비스 강제 롤아웃
aws ecs update-service \
  --cluster ontology-gcc-dev-cluster \
  --service ontology-gcc-dev-api \
  --force-new-deployment

# 배포된 CloudFront 도메인 접속
open https://<cloudfront-distribution>.cloudfront.net
```

## 환경 설정

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `AWS_REGION` | 모든 서비스가 배포되는 AWS 리전 | `ap-northeast-2` |
| `NEPTUNE_ENDPOINT` | Neptune 클러스터 writer 엔드포인트 | CDK output에서 자동 해석 |
| `OPENSEARCH_ENDPOINT` | OpenSearch Serverless 컬렉션 엔드포인트 | CDK output에서 자동 해석 |
| `OPENSEARCH_INDEX` | 벡터 + BM25 인덱스 이름 | `ontology-gcc-dev-kb-index` |
| `BEDROCK_CHAT_MODEL_ID` | 채팅·인사이트용 Foundation 모델 | `global.anthropic.claude-sonnet-4-6` |
| `BEDROCK_KB_ID` | Bedrock Knowledge Base ID | resolved from CDK output |
| `BEDROCK_GUARDRAIL_ID` | Bedrock Guardrails ID | resolved from CDK output |
| `BEDROCK_RERANKER_INFERENCE_PROFILE_ARN` | 리랭커 cross-region inference profile | 환경별 설정 |
| `BEDROCK_EMBED_MODEL_ID` | 임베딩 모델 | `global.cohere.embed-v4:0` |
| `AGENTCORE_MEMORY_ID` | AgentCore Memory store ID | CDK output에서 자동 해석 |
| `COGNITO_USER_POOL_ID` | SSO용 Cognito 사용자 풀 | CDK output에서 자동 해석 |
| `ORIGIN_AUTH_SECRET_ARN` | CloudFront ↔ ALB 공유 비밀 ARN | CDK output에서 자동 해석 |
| `RAW_DOCS_BUCKET` | KB 원본 문서 S3 버킷 | `ontology-gcc-dev-raw-docs-<account>` |
| `UPLOADS_BUCKET` | 사용자 업로드 S3 버킷 | `ontology-gcc-dev-uploads-<account>` |
| `SYNTHETIC_DATA_BUCKET` | 로더 동기화용 S3 버킷 | `ontology-gcc-dev-synthetic-data-<account>` |
| `ONTOLOGY_ENV` | 환경 이름 | `dev` |
| `PUBLIC_DOMAIN` | CloudFront 배포 도메인 | CDK output에서 자동 해석 |

## 프로젝트 구조

```
ontology-gcc/
├── api/                  # FastAPI 백엔드 (Python 3.12, ARM64)
│   ├── routers/          # 시나리오별 엔드포인트 (chat, search, insights, ...)
│   ├── services/         # Bedrock, Neptune, OpenSearch, AgentCore 래퍼
│   ├── middleware_auth.py # Cognito JWT 검증
│   └── Dockerfile        # 다목적 이미지 — API 서버 + 일회성 데이터 로더
├── web/                  # Next.js 14 프론트엔드 (TypeScript, ARM64)
│   ├── app/              # App Router 시나리오 A-G + 객체 + 운영 + 메타
│   ├── components/       # PersonaSwitch, GuidedTour, CytoscapeView, Sidebar
│   └── lib/api-client.ts # 타입 안전 SSE + REST 클라이언트
├── infra-cdk/            # AWS CDK v2 인프라 (TypeScript)
│   └── lib/              # network, data, compute, ai, edge, observability 스택
├── data/                 # 합성 데이터 생성기 + Neptune/OpenSearch 로더
├── ontology/             # 매핑 CSV (Opinet 유종/주유소 표준, KFDA 약관 용어,
│                         #  GSC 내부 코드, KOSTAT 시도 GeoJSON, 5부서×14시나리오 priority)
├── docs/                 # 아키텍처, ADR, 런북
└── scripts/              # KB 인덱스, Cognito 사용자 프로비저닝, 평가
```

## 테스트

빠른 순서대로 5개 테스트 surface:

```bash
# 1. Python AST 검증 (설치 불필요, ~1초) — CI job 1
python3 -m compileall -q api data scripts

# 2. TypeScript 타입 검사 (캐시 시 ~10초) — CI는 web + infra-cdk 매트릭스로 실행
cd web && npx tsc --noEmit
cd infra-cdk && npx tsc --noEmit

# 3. Pytest 오프라인 스위트 (28 tests, <1초) — smoke import + Pydantic 검증 + /api/search 통합 (서비스 모킹)
pip install -r api/requirements.txt -r requirements-dev.txt
pytest tests -q

# 4. CDK 스냅샷 테스트 (6 stacks, ~13초) — Template.fromStack().toJSON() drift 감지
cd infra-cdk && npx jest --ci

# 5. 배포된 CloudFront 대상 wow 쿼리 라이브 평가 (목표 ≥85%, 미달 시 sys.exit(1))
python3 scripts/eval_wow_queries.py
```

1–4 단계는 `.github/workflows/ci.yml`이 push/PR마다 실행 (concurrency cancel-in-progress). 5 단계는 배포된 환경 필요.

## API 문서

전체 OpenAPI 표면은 [docs/api-reference.md](docs/api-reference.md)에 정리돼 있습니다. 포함되는 엔드포인트:

- `POST /api/search` 및 `POST /api/search/stream` (시나리오 A)
- `POST /api/chat` (시나리오 B, SSE)
- `POST /api/insights` 및 `POST /api/insights/stream` (시나리오 C)
- `POST /api/persona-match` (시나리오 D)
- `POST /api/safety/check` (시나리오 E)
- `POST /api/substitute` (시나리오 F)
- `POST /api/price/compare` (시나리오 G)
- `GET  /api/logistics/{network,status,events,warehouse/...,inventory/...,nearest,shortest-path}` (시나리오 H)
- `GET  /api/objects/{type}` 및 `/api/objects/{type}/{id}`
- `GET  /api/ontology/{schema,standards,validation}`
- `GET  /api/ops/{ingest,guardrail,memory,eval,trace}`

## 기여 방법

1. 저장소를 Fork 합니다.
2. 기능 브랜치를 생성합니다: `git checkout -b feat/<scenario-or-fix>`.
3. [CLAUDE.md](CLAUDE.md)의 컨벤션에 따라 변경합니다. 커밋 메시지는 Conventional Commits 형식을 사용합니다 (예: `feat(api): add price compare`, `fix(infra-cdk): correct Cognito password policy`).
4. 브랜치를 푸시합니다: `git push origin feat/<scenario-or-fix>`.
5. 시나리오 영향과 인프라 변경 사항을 설명하는 Pull Request를 엽니다.

## 라이선스

이 프로젝트는 MIT License로 배포됩니다 — 자세한 내용은 [LICENSE](LICENSE) 파일을 참고하시기 바랍니다.

## 연락처

- 메인테이너: [whchoi98](https://github.com/whchoi98)
- 이슈: <https://github.com/whchoi98/ontology-gcc/issues>
- 이메일: whchoi98@gmail.com

<!-- harness-eval-badge:start -->
![Harness Score](https://img.shields.io/badge/harness-8.9%2F10-green)
![Harness Grade](https://img.shields.io/badge/grade-A-green)
![Last Eval](https://img.shields.io/badge/eval-2026--05--11-blue)
<!-- harness-eval-badge:end -->
