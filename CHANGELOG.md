# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] — 2026-05-18

### Security
- **IAM task role scope-down** (ADR-0014): NeptuneFullAccess + `bedrock:*` + `aoss:*` 제거 → 명시 ARN (cluster ARN / inference-profile + foundation-model ARN 패턴 / collection ARN).
- **DEMO_PUBLIC_MODE prod guard** (ADR-0015): `-c stage=prod` 시 환경변수 미생성 → fail-closed.
- **Lambda@Edge DEMO bypass** (ADR-0017): `USER_POOL_ID` 빈 값 시 모든 request pass-through. 운영 모드는 `.env` 채우고 redeploy.
- **CloudFront Prefix List SG ingress** (ADR-0019): `com.amazonaws.global.cloudfront.origin-facing` (pl-22a6434b) port 80 만 — 옛 구성에 누락된 prefix list 보강.

### Infrastructure
- **AOSS VPCE hardening — retail VPCE 재사용** (ADR-0016): AOSS 의 *VPC 당 1 VPCE 제한* 발견. retail PoC 의 `vpce-0d638a0ed56410be0` 에 gcc-os-sg 추가 + GCC network policy 의 collection 만 `AllowFromPublic: false` + `SourceVPCEs`. Dashboard 는 운영 디버깅용 `AllowFromPublic: true` 유지.
- **Wildcard cert import** (ADR-0018): `*.whchoi.net` cert 를 `fromCertificateArn` 으로 import — DNS validation 우회. 도메인 alias 는 외부 active zone 의 stale CNAME 충돌 시 *분리 deploy* 패턴.
- **Lambda@Edge synth-time string replace** (ADR-0017): `process.env.COGNITO_USER_POOL_ID` 를 source 에 string replace 후 fromAsset 으로 deploy (runtime env var 미지원 우회).
- **ECR repo import**: `Repository.fromRepositoryName` 으로 import — RETAIN 으로 살아남은 repo 와 충돌 회피.
- **cdk.json `requireApproval: "never"`**: `yes |` pipe 대체 — 표준 CDK 자동 승인 방식.
- **새 인프라 식별자**: CloudFront `drgcjkihqi37f.cloudfront.net` (E2KI5SBELKE0PU), Cognito user pool `us-east-1_7QQGUrp3C`, AlbSg `sg-0aeeefd52ce6cedb0`, AppSg `sg-0954678996ae100d9`.

### Documentation
- 6 신규 ADR (0014-0019) — IAM scope-down / DEMO guard / AOSS Deferred / Lambda@Edge / Wildcard cert / Public ALB Prefix List.
- Root CLAUDE.md, infra-cdk/CLAUDE.md, docs/architecture.md (KR/EN), docs/runbooks/02-add-custom-domain.md, README.md 갱신.

## [1.0.0] — 2026-05-09

### Added — first PoC release

**Infrastructure**
- 6-stack CDK (network imports retail VPC; data/ai/compute/edge/observability are GCC-only) deployed in account 061525506239.
- ECR images (api + web ARM64) on ECS Fargate Graviton, 2/2 each.
- Lambda@Edge Cognito JWT verification (RS256 + 10-min JWKS TTL cache, Plan 5 Task 5.5.1).
- Custom domain runbook `docs/runbooks/02-add-custom-domain.md` with safe Cognito callback merge + rollback procedure.

**Data** (~1.4M nodes / partial edge load, see Plan 4 hybrid traversal note)
- Real cohort: coupon-only 500 + sales-only 17 + deep-history 16 + 약관 500 + 소비지수 287 + 앱 352 + 설문 25,961.
- Synthetic: lookalike-syn ~50,000 + PM+M 92 RON 250 seeds + 디젤→premium 250 seeds.
- External: 기상청 단기예보 17-시도 daily ETL (ADR 0005 — 6h TTL cache) + opinet 1년치 ETL stub (Plan 5 Task 5.6.1).
- 25 classes + 31 relations + `ontology/standards/opinet_codes.yaml`.
- Customer 15 핵심 속성 (DW_CU_CUST_MAST 청사진).
- ADR 0004 — `Customer.data_depth` 4단계 cohort tagging.

**Scenarios** (14 — A–N)
- A 의미 검색 (BM25 Nori + Cohere KNN, RRF, rerank-v3, 1-hop Cytoscape subgraph)
- B 마케터 챗 (Bedrock Converse 다회차 + AgentCore Memory + 10 도구, Tool dispatcher = `api/services/agent.py`)
- C MD 인사이트 (Code Interpreter matplotlib NanumGothic + Sonnet 한국어 요약)
- D 페르소나 매칭 (PERSONA_REGISTRY × KPI weights — ADR 0007)
- E 클러스터링 KMeans 6 + LLM 라벨링
- F 룩어라이크 (lookalike_expand)
- G 캠페인 ROI 시뮬 + Bayesian 분포 차트
- H 주유소 지도 (시도 choropleth)
- I 약관·가드레일 (TermAgreement + Bedrock Guardrails)
- J 외부 시그널 융합 (현대카드·앱·설문·날씨)
- K Outlier (PM+M 92 RON DIY · 디젤→premium 전환) — PDF 3페이지 시그니처
- L 결제·가격·채널 매트릭스
- M 고객 통합 여정 timeline (App+Tx+Term+Coupon + 유종 전환) — PDF 3페이지 시그니처
- N 날씨 × 주유 (기상청 join + 산점도)
- 70+ wow 평가 케이스 (시나리오 × 페르소나 매트릭스).

**Operations / Meta / UI** (Plan 5)
- 25 클래스 객체 탐색기 (검색·페이지네이션·디테일·1-hop subgraph) — `web/app/objects/[type]/`, `web/app/objects/[type]/[id]/`.
- 메타 페이지 3 탭 (ER · Standards · Validation 검증 리포트) — `/api/ontology/{schema,standards,validation}`.
- 운영 콘솔 5 패널 (적재·가드레일·메모리·평가·트레이스) — `/api/ops/live/*` + 5 panel components.
- GuidedTourGcc (5 페르소나 × 14 시나리오 추천 카드 — ADR 0008).
- DataSourceBadge (real/synthetic/external 출처 명시).
- harness-eval nightly README badge automation (`scripts/run_harness_eval.sh` + `.github/workflows/harness.yml`).

**ADRs** 0001 (retail VPC import) · 0002 (domain deferred) · 0003 (bulk loader IAM) · 0004 (cohort data_depth) · 0005 (KMA API cache) · 0006 (tool specs design) · 0007 (persona registry SSOT) · 0008 (guided tour design).

**Tests** CI 4-job 그린 (~50+ tests) + harness baseline 7.5/B (target ≥7.5/B reached).
**Docs** README 한·영 + CLAUDE.md + SECURITY.md (Plan 1–5 통합) + 8 ADR + 2 runbook.

## [Unreleased]

### Added
- Initial fork from `ontology-for-mfg` with `ontology-for-retail` overlay (CI 4-job, eval template, ADR template, harness-eval baseline).
- Design spec: `docs/superpowers/specs/2026-05-08-ontology-gcc-design.md` (14 scenarios A-N, 25 classes, 5 부서 페르소나).
- 5 implementation plans: `docs/superpowers/plans/2026-05-08-plan{1..5}-*.md`.
- Phase 0 Bootstrap (Plan 1 Tasks 0.1~0.8): mfg directory copy, mfg→gcc identifier rename, CI workflow, harness-eval baseline, .claude harness, CLAUDE.md (~280 line), bilingual README, SECURITY/.env/.editorconfig/.mcp.json/requirements-dev.
- Phase 1 Infrastructure deploy complete: 6-stack CDK live in account 061525506239 (network imports retail VPC).
- ECR images pushed (api + web ARM64); ECS services running 2/2 each.
- Cognito users provisioned (admin@whchoi.net, demo@whchoi.net / `!234Qwer`).
- CloudFront `https://d2vtgoziwcvh15.cloudfront.net/` returns 200/307 (Phase 1 acceptance: empty home reachable).

### Notes
- raw_data/ (PII inputs) is gitignored. Stored separately in KMS-encrypted S3.
- Phase 1 (Infrastructure) — 6-stack CDK with retail VPC import — complete.

### Phase 2 Data Pipeline ✅ (2026-05-09)
- raw_data 11 files uploaded to s3://ontology-gcc-dev-raw-docs-061525506239/raw_data/.
- api Docker image rebuilt + pushed (Plan 2 code: data/external, data/loader, data/load, api/services/cohort, /api/objects 25-class).
- Bulk Loader fallback (data/loader/cypher_bulk.py) — openCypher UNWIND MERGE batches via SigV4 — used when CSV format doesn't fit.
- ECS one-shot task ran loader: **869,648 nodes merged** to Neptune.
- Cohort verified: Customer 50,517 (500 real + 17 sales-only + 50K lookalike-syn), FuelTransaction 556,712, GasStation 31,109, Campaign 137, Coupon 997, CouponUse 5,278, Term 0/12, TermAgreement 17,615, AppEvent 121,700, ConsumptionIndex 287, Persona 5, Cluster 6, Segment 20, Member 50,517, CampaignSMS 34,250, CampaignAggregation 137.
- Some classes show 0 — to be addressed in Plan 5 polish: Term (no separate generator output), FuelPrice (real 6일/synthetic 1년 generator output mismatch), TimeSlot (5 fixed not in pipeline), Survey anonymous 25,946 (load filter).
- KMA ETL deferred — no API key registered yet.
- PM+M 92 RON detection + cohort breakdown verification deferred to Plan 3 (requires functional api/services/neptune.py).

### Phase 3 Vertical Slice ✅ (2026-05-09)
- Common services: bedrock (Converse+embed+rerank), opensearch (RRF K=60), persona (5 부서 SSOT + ADR 0007), sse, guardrails, neptune (botocore SigV4 openCypher).
- 시나리오 A search: search_pipeline (embed → BM25+KNN+RRF → rerank → 1-hop subgraph) + /api/search + /api/search/stream (SSE) + web/app/search/ + 5 wow cases.
- AgentCore Memory + Code Interpreter (NanumGothic) wrappers.
- 시나리오 B chat agent: TOOL_SPECS 10 tools + ADR 0006 + 10 tool modules + /api/chat (Converse 다회차 + Guardrail + Memory + tool dispatch trace) + 4 chat UI components (ChatThread, ToolCallPanel, PersonaSwitchGcc, page.tsx) + 5 wow cases.
- behavior_change_detect tool: PDF 3페이지 시그니처 (PM+M 92 RON DIY + 디젤→premium 전환). Property-based cust_id/store_cd join — Plan 2 loaded nodes only, no edges.
- PM+M detection verified: **28,798 customers** with both premium and regular fuel transactions (well above ≥250 threshold).
- ECR images rebuilt + pushed (api edd49a0 / web f6aa01d), ECS rolled, /healthz 200, /api/personas 401 (Cognito-protected as designed).

### Phase 4 12 시나리오 (C~N) ✅ (2026-05-09)
- C 인사이트 (Code Interpreter matplotlib NanumGothic + Sonnet 요약)
- D 페르소나 매칭 (PERSONA_REGISTRY × KPI weights)
- E 클러스터링 KMeans 6 + LLM 라벨링 (PDF Scenario 2)
- F 룩어라이크 (lookalike_expand tool)
- G 캠페인 ROI 시뮬 + Bayesian 분포 차트
- H 주유소 네트워크 지도 (시도 choropleth) — KOSTAT GeoJSON placeholder; load real shapes in Plan 5 polish
- I 약관·가드레일 (TermAgreement + Bedrock Guardrails) — uses graph traversal (AGREED_TO + FOR edges loaded)
- J 외부 시그널 융합 (현대카드·앱·설문·날씨) — uses graph traversal (HAS_INDEX + USED_APP + ANSWERED edges loaded)
- K Outlier (PM+M 92 RON DIY · 디젤→premium 전환) — PDF 3 시그니처
- L 결제·가격·채널 매트릭스
- M 고객 통합 여정 timeline (App+Tx+Term+Coupon + 유종 전환) — PDF 3 시그니처
- N 날씨 × 주유 (기상청 join + 산점도)
- 60 신규 wow cases (12 시나리오 × 5 페르소나)
- KoreaChoropleth, JourneyTimeline, ChartImage, WeatherOverlay 컴포넌트
- 12 라우터 + 12 페이지 + 4 전용 서비스 (insights/cluster/journey/weather pipelines)
- Hybrid graph traversal: where edges loaded (REFUELED, AGREED_TO, FOR, USED_APP, ANSWERED, IS_MEMBER, HAS_INDEX) prefer graph; otherwise property-join fallback. Plan 5 polish: load remaining 24 edge types.
- ECR images rebuilt + pushed (api f1fc29a / web f1fc29a), ECS rolled to ontologygccdevcomputeApiTask02010DB0 / ontologygccdevcomputeWebTask08E5C83F (latest revision).
