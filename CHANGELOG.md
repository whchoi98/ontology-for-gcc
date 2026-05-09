# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
