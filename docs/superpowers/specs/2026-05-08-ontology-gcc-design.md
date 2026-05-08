# ontology-for-gcc — GS Caltex 고객 온톨로지 PoC 설계

| | |
|---|---|
| 작성일 | 2026-05-08 (D11~D18 정합 갱신) |
| 상태 | 설계 완료 + 5-plan 분해, Plan 1 (Foundation) 작성됨 → Plan 2 (Data) 대기 |
| 참조 PoC | `ontology-for-retail` (8 시나리오), `ontology-for-mfg` (12 시나리오·22 클래스) |
| 입력 자산 | `raw_data/` (CSV 9 + DL_DA xlsx 13 큐레이트 엔터티 + GSC_희망시나리오_Update.pdf 3 페이지) |
| 빌드 접근 | mfg fork + retail 성숙도 오버레이 + vertical slice |
| 시나리오 | **14개 (A~N)** — A~L 기본 12 + M 고객여정 + N 날씨×주유 |
| 클래스 | **25개** — 고객·회원 5 / 행동·거래 5 / 마케팅 6 / 운영·상품 4 / 컴플·외부 4 / 시간 1 |
| 표준 카탈로그 | `ontology/standards/opinet_codes.yaml` (D18) |
| Cohort | 실 데이터 500 (depth 3종) + 룩어라이크 합성 ~5만 (D14) |

## Summary

GS Caltex (이하 **GSC**) M&M본부의 **de-identified 실 고객 데이터(500명 cohort) + DW_CU_CUST_MAST 청사진 기반 합성 룩어라이크(~5만)**를 25 클래스 통합 온톨로지로 모델링하고, AWS Bedrock + AgentCore + Neptune + OpenSearch + 기상청 공공 API 위에서 14개 wow 시나리오(A~N) 를 통해 *Agentic AI 분석*을 시연하는 30~60분 PoC. 5개 부서 페르소나(마케팅·고객전략·데이터·AI·CRM·회원사업·리테일영업)가 동일 데이터를 자신의 KPI 렌즈로 보는 일관 경험을 제공한다. PDF 3페이지의 *PM+M 92 RON DIY 혼유* 같은 실 행동 패턴, 매출 시계열 deep-history 16명, 그리고 합성 lookalike-syn 5만이 모두 같은 그래프에 공존하며 데이터 출처(real/synthetic/external) 배지로 구분된다.

## Goals

1. raw_data CSV 9개 + DL_DA xlsx 13 큐레이트 엔터티 + 기상청 공공 API를 단일 진실원으로 삼아 **25 클래스 + opinet_codes 카탈로그** 온톨로지를 Neptune에 적재. 동일 데이터를 OpenSearch BM25(Nori) + Cohere KNN 하이브리드 인덱스로 동시 검색 가능하게 한다.
2. PDF 3페이지의 세 시그니처 시나리오 — (a) 고급휘발유 업셀링 타겟·룩어라이크·캠페인 후 ROI, (b) 고객 클러스터 6개 분류·Action Item·캠페인 시뮬·트래킹, (c) **PM+M 92 RON DIY 혼유 + 유종 전환 Celebration + 고객 통합 여정** — 를 end-to-end로 구현한다.
3. retail/mfg 동일 패턴(FastAPI + Next.js 14 + CDK 6-stack + Sonnet 4.6 + AgentCore Memory + Code Interpreter)을 그대로 채택해 구현 리스크를 최소화한다.
4. retail의 기존 VPC를 import해 비용·네트워크 일관성을 확보하고, GCC 전용 데이터·런타임(Neptune·OS·ECS·CloudFront·Cognito)은 완전 분리해 teardown 안전성을 유지한다.
5. CI 4-job + **14 시나리오 × 5 페르소나** wow 쿼리 평가 ≥85% + harness-eval 7.5+/10 (B 등급)을 첫 릴리즈 기준으로 한다.
6. **데이터 출처 투명성**: Customer.data_depth ∈ {deep-history, coupon-only, sales-only, lookalike-syn} 및 FuelPrice.source ∈ {real, synthetic} 등의 명시 태그로 데모 시 *어느 인사이트가 실 데이터에서 왔는지* 구분 가능.

## Non-Goals

- 실 raw_data를 production 적재(익명화 파이프라인 별도 프로젝트로 분리).
- 도메인 `gcc-ontology.whchoi.net` 자동 wiring — 첫 배포는 `*.cloudfront.net`이고 도메인·ACM·Route53는 수동 후작업.
- 기존 retail/mfg 코드 변경 (gcc는 별도 디렉토리, 영향 격리).
- 모바일 앱·iOS/Android 클라이언트 (브라우저만 지원).
- 실시간 스트리밍 적재 (모든 데이터는 배치 합성 + Neptune Bulk Loader).

## Decisions Log

| ID | 항목 | 선택 | 대안 | 근거 |
|---|---|---|---|---|
| D1 | 도메인·범위 | GS Caltex 고객 온톨로지 PoC, retail/mfg 동일 패턴 | PDF 2 시나리오만 / 다른 도메인 | raw_data·PDF 모두 GSC 단서 충실; PoC 빠른 복제 검증 |
| D2 | 페르소나 | 5 부서 — 마케팅·고객전략·데이터·AI·CRM·회원사업·리테일영업 | 5명 개인 / 외부 고객 5명 / PDF 직목 | 부서 단위가 mfg Buyer/Engineer/... 패턴과 정렬 |
| D3 | 시나리오 수 | 12개 A–L (mfg 패턴) | 8개 / 10개 | 다양한 페르소나·객체 탐색 + 데모 풍부함 |
| D4 | 클래스 수 | 22개 (5 군집) + FuelProduct 5 서브클래스 | 16 / 26 | mfg 동일 풍부함, 30~60분 데모 분량 |
| D5 | 데이터 모드 | **실데이터 N=500 cohort + 룩어라이크 합성 확장(~5만)** [updated 2026-05-08] | 100% 합성 / 실데이터만 | 실 500명은 이미 de-identified, 비식별고객번호 join key. F·G·K 시나리오 풍부함 위해 seed-based 합성 확장 (`seg=lookalike` 태그) |
| D6 | 인프라 패턴 | retail/mfg 동일 — ap-northeast-2 + 6-stack CDK + 도메인 분리 배포 | 단순화 / 다른 도메인 | 컨벤션 일치, 운영 손숨 재사용 |
| D7 | VPC | retail VPC import (`Vpc.fromVpcAttributes` 또는 lookup) | 신규 VPC / 완전 공유 | 비용·네트워크 일관성 + 데이터 격리 양립 |
| D8 | 자원 공유 | VPC·NAT·prefix-list 공유, 나머지 모두 GCC 전용 | Neptune·OpenSearch 공유 / ECS 공유 | 데이터 격리 + 독립 teardown |
| D9 | 빌드 접근 | mfg fork → retail 성숙도 overlay → vertical slice (시나리오 A 골드 스탠다드 우선) | greenfield / monorepo 추출 | 시간 단축 + 시나리오 템플릿 확립 |
| D10 | 적재 방식 | Neptune Bulk Loader (S3 → Neptune) | 직접 openCypher MERGE | 100만 노드 규모, 7~8배 빠름 |
| D11 | 시나리오 추가 [2026-05-08] | **시나리오 M (고객 통합 여정 / Customer Journey)** + **시나리오 N (날씨 × 주유 패턴 / Weather Correlation)** | 12개 유지 | PDF 3페이지의 "고객 통합 여정 기반 Needs 도출" + 사용자 명시 "한국 공공 날씨 데이터 추가" |
| D12 | 외부 API 통합 [2026-05-08] | 기상청 단기예보·동네예보 API (`services/external_api.py` 어댑터, S3 캐시 + 일일 ETL → Neptune `WeatherObservation` 클래스) | 무시 / 합성 weather | 사용자 명시 요구, GSC 내부 수집 없음 |
| D13 | 클래스 추가 [2026-05-08] | **`WeatherObservation`** (23번째 클래스, 컴플·외부 군집) — 시도·시간 × 기온·강수·풍속·미세먼지 | 22 유지 | 시나리오 N 지원 |
| D14 | Cohort 전략 [2026-05-08 점검 후] | **실 데이터 그대로 + Customer.data_depth 태그**: deep-history 16 (쿠폰+매출+약관) / coupon-only 484 (쿠폰+약관만, 매출 결측) / sales-only 17 (매출만) / lookalike-syn ~5만 (합성 확장, seed=실 33명 매출 패턴) | 484명 매출 합성 보강 / GSC 재요청 | 실 데이터 진실성 보존 + 시나리오 필터로 cohort 선택 (PoC 인수 기준 = "실 데이터 패턴 시연") |
| D15 | 가격 시계열 처리 [2026-05-08] | **실 6일(2026-05-01~05-06) + 시나리오 N·G·L에 한해 과거 1년치 합성 보강** (월별 옵셋·계절성 패턴 시뮬). FuelPrice 노드에 `source: "real" \| "synthetic"` 속성 | 6일만 / opinet API 재 ETL | 시나리오 시계열 데모 가능 + 실 가격 레벨 유지. opinet API ETL은 Plan 5 polish에서 옵션 |
| D16 | Customer 속성 (DW_CU_CUST_MAST 청사진) [2026-05-08] | **핵심 15개 속성**: cust_id, age_val, age_section_cd, gender_cd, sido_nm, sgg_nm, work_sgg, occupation_cd, vip_yn, primary_site_cd, member_grade, kixx_join_dt, bns_card_join_dt, mail_recv_yn, plcc_yn | 78개 전체 / 7개 린 | 시나리오 D·E·F의 페르소나 매칭·클러스터링·룩어라이크 차별화에 필요한 최소 명시 속성 |
| D17 | 클래스 추가 [2026-05-08] | **CampaignSms (24)** — 시나리오 G·B의 SMS 발송 ROI 추적 (DW_CP_SM_CAMP_MSG 청사진), **CampaignAggregation (25)** — 시나리오 G의 캠페인 집계 KPI 사전계산 (TB_SM_CMPG_OFER_S 청사진) | 23 유지 / 26 추가 | PDF 1페이지 마케터 dialog의 "지난번 문자 보낸 고객" 시연 + GSC BI 일치 |
| D18 | 표준 코드 카탈로그 [2026-05-08] | **`ontology/standards/opinet_codes.yaml`** — erm_gass_trdm_dvs_cd, opinet_sale_sts_cd, sido/sgg_opinet_area_cd 등 GSC 내부 코드 표준. 클래스 아님 — yaml 파일 | 무시 / 별도 클래스 | 시나리오 H 권역 경쟁 주유소 (SK·HD·Hyundai) 식별 |

## 1. Architecture & Infrastructure

### 1.1 인프라 토폴로지

```
ap-northeast-2 (서울)
┌──────────────────────────────────────────────────────────────────────┐
│  retail-network-stack (기존)                                          │
│  ┌─────────────────────────────────────────┐                          │
│  │  VPC  (10.x.0.0/16, 3-AZ)                │  ← Vpc.fromVpcAttributes │
│  │  public / private(NAT) / isolated         │     또는 fromLookup      │
│  │  NAT GW · prefix-list                     │                          │
│  └─────────────────────────────────────────┘                          │
│         │                                                             │
│  ┌──────┴──────────────────────────────────────────────────┐         │
│  │  GCC-only stacks (모두 신규)                              │         │
│  │  • gcc-network: SG only (gcc-app-sg, gcc-neptune-sg, ...) │         │
│  │  • gcc-data:    Neptune cluster (private), OpenSearch     │         │
│  │                 Serverless, S3 (raw/uploads/synthetic)    │         │
│  │  • gcc-compute: ECS cluster, ALB(gcc), api+web 서비스     │         │
│  │  • gcc-ai:      Bedrock KB, Guardrails, AgentCore Memory  │         │
│  │  • gcc-edge:    CloudFront(gcc), Lambda@Edge, Cognito     │         │
│  │  • gcc-observ:  CloudWatch dashboards, alarms, logs       │         │
│  └──────────────────────────────────────────────────────────┘         │
└──────────────────────────────────────────────────────────────────────┘
```

### 1.2 기술 스택

| Layer | 선택 |
|---|---|
| Backend runtime | Python 3.12 on Fargate ARM64 |
| Backend framework | FastAPI + Pydantic v2 + uvicorn |
| Frontend runtime | Node.js 20 on Fargate ARM64 |
| Frontend framework | Next.js 14 App Router (standalone) + React 18 + Tailwind |
| Graph DB | Amazon Neptune (openCypher) — gcc 전용 클러스터 |
| Search | OpenSearch Serverless (Nori BM25 + Cohere KNN, RRF 융합) — gcc 컬렉션 |
| Foundation models | Bedrock Sonnet 4.6 (chat·insights), Cohere embed-v4 (벡터), Cohere rerank-v3 |
| Memory | AgentCore Memory (short-term session + long-term user) |
| Sandbox | AgentCore Code Interpreter Firecracker microVM (matplotlib + NanumGothic) |
| Maps | react-simple-maps + d3-geo + KOSTAT 시도 GeoJSON |
| Auth | Cognito user pool + Lambda@Edge 쿠키 인증 |
| Edge | CloudFront → ALB (HTTP origin, cloudfront prefix-list SG) |
| Compute | ECS Fargate ARM64, two-replica services (api + web) |
| IaC | AWS CDK v2 (TypeScript) — 6 stacks |

### 1.3 도메인 분리 배포 패턴

- 첫 배포: `cdk deploy --all` (도메인·ACM·Route53 없음, `*.cloudfront.net` URL).
- 도메인 추가: `cdk deploy gcc-edge -c domain=gcc-ontology.whchoi.net` 후 Cognito callback URL 갱신은 `scripts/cognito-update-callbacks.sh` (전체 PUT 안전화).

### 1.4 보안

- Cognito RS256 JWT, JWKS TTL 캐시, constant-time origin token 비교 (retail 동일).
- ALB SG → `cloudfront.origin-facing` prefix-list만 ingress.
- Neptune private subnet — 직접 EC2 접근 불가, 로더는 ECS one-shot task.
- Bedrock Guardrails 입력 스크럽 + 출력 필터 (시나리오 I·B·C에 적용).
- IAM least privilege, Secrets Manager로 origin token + Cognito client secret 관리.
- `.claude/hooks/scrub-secrets.sh` PreToolUse + PostToolUse 그대로.
- `raw_data/` 디렉토리는 `.gitignore` (PII·내부 자산 노출 방지) — KMS 암호화 S3 별도 보관.

## 2. Project Structure

```
ontology-for-gcc/
├── api/                          # FastAPI (Python 3.12, ARM64)
│   ├── main.py                   # 14 라우터 등록 (A~N + objects/ontology/ops)
│   ├── config.py                 # Settings (env)
│   ├── aws_clients.py            # @lru_cache boto3 session
│   ├── middleware_auth.py        # Cognito JWT 검증
│   ├── routers/                  # search, chat, insights, persona_match,
│   │                             # cluster, lookalike, campaign_roi, network_map,
│   │                             # compliance, external_signal, outlier, payment,
│   │                             # journey (M), weather (N),
│   │                             # objects, ontology, ops
│   ├── services/                 # neptune, opensearch, bedrock, agent,
│   │                             # agentcore, guardrails, persona,
│   │                             # external_api (기상청, D12), cohort
│   ├── models/                   # Pydantic v2 도메인 모델
│   └── Dockerfile                # API + 일회성 데이터 로더 겸용
├── web/                          # Next.js 14 (TS, ARM64)
│   ├── app/                      # 14 시나리오 페이지 + objects/[type] + meta + ops
│   ├── components/               # PersonaSwitch, GuidedTour, CytoscapeView,
│   │                             # KoreaChoropleth, Sidebar, JourneyTimeline (M),
│   │                             # WeatherOverlay (N), DataSourceBadge (real/syn/external)
│   └── lib/api-client.ts         # 타입 안전 SSE + REST
├── infra-cdk/                    # AWS CDK v2 (TS) — 6 stacks
│   ├── bin/gcc.ts
│   ├── lib/{network,data,compute,ai,edge,observability}-stack.ts
│   └── test/                     # Jest 스냅샷 (6 stacks)
├── data/                         # 데이터 적재 (실 + 합성 + 외부)
│   ├── load.py                   # CLI: --neptune --opensearch --from-s3 --weather
│   ├── schemas.py                # 25 클래스 Pydantic + 관계
│   ├── real/                     # raw_data 어댑터 (cp949 → utf-8 정규화)
│   │   ├── coupon_fact.py        # file 1 → Campaign/Offer/Coupon/CouponUse
│   │   ├── transaction.py        # file 3 → FuelTransaction (33명 deep)
│   │   ├── term_agreement.py     # file 4 → Term/TermAgreement
│   │   ├── opinet_price.py       # file 5 → FuelPrice (실 6일)
│   │   ├── opinet_station.py     # file 7 → GasStation
│   │   ├── consumption_index.py  # file 6 → ConsumptionIndex
│   │   ├── airbridge.py          # file 8 → AppEvent
│   │   └── survey.py             # file 9 → SurveyResponse
│   ├── synthetic/                # 25 클래스 generator
│   │   ├── customer.py           # 15 attrs from DW_CU_CUST_MAST 청사진
│   │   ├── lookalike.py          # ~5만 lookalike-syn cohort
│   │   ├── campaign_sms.py       # CampaignSms (D17, DW_CP_SM_CAMP_MSG 청사진)
│   │   ├── campaign_aggr.py      # CampaignAggregation (D17)
│   │   ├── price_synth.py        # 1년치 FuelPrice 보강 (source=synthetic)
│   │   └── seeds.py              # PM+M 92 RON 250명, 디젤→고급 250명, F 시드 1,000명
│   └── external/                 # 외부 API ETL
│       └── kma_weather.py        # 기상청 단기예보 (D12) → WeatherObservation
├── ontology/                     # 도메인 산출물
│   ├── classes/                  # 25 클래스 yaml 카탈로그
│   ├── relations/                # 엣지 정의
│   ├── mappings/                 # raw_data column → 클래스 attr 매핑 (xlsx 기반)
│   └── standards/                # D18 — 표준 코드 카탈로그
│       └── opinet_codes.yaml     # erm_gass_trdm_dvs_cd, opinet_sale_sts_cd 등 + 경쟁사
├── tests/                        # Pytest (smoke + api integration)
├── docs/                         # specs, decisions(ADR), runbooks, api-reference
├── scripts/                      # eval_wow_queries, cognito callbacks, kb_index
├── .claude/                      # agents, skills, hooks, commands, settings
├── .github/workflows/ci.yml      # 4-job CI
├── .harness-eval/                # 점수 history → README 배지
├── raw_data/                     # 입력 자산 (gitignored)
├── CLAUDE.md, README.md, SECURITY.md, CHANGELOG.md
└── .env.example, requirements-dev.txt
```

### 2.1 핵심 컴포넌트 노트

- **`services/agent.py:TOOL_SPECS`** — retail의 가장 강력한 추상. 기본 4개(`memory_recall`, `neptune_subgraph`, `semantic_search`, `kb_lookup`) + GSC 추가 8개(`customer_lookup`, `cluster_predict`, `nearest_stations`, `campaign_simulator`, `lookalike_expand`, `behavior_change_detect`, `journey_timeline`, `weather_correlate`).
- **`data/schemas.py`** — **25 클래스** single source of truth (Pydantic v2 + 관계 메타). `ontology/classes/*.yaml`은 사람용 카탈로그.
- **`api/services/persona.py:PERSONA_REGISTRY`** — 5 부서 × 14 시나리오 가중치 + KPI 카드 + 시스템 프롬프트 어조. 모든 라우터가 `request.persona_id`로 조회.
- **`api/services/cohort.py:select(persona_id, scenario_code)`** — `data_depth` 조합을 반환. 예: `select('marketing', 'K') → ['deep-history', 'sales-only']`, `select('data-ai', 'F') → ['*']`.
- **`api/services/external_api.py:KmaForecastClient`** — 기상청 단기예보·동네예보 어댑터 (D12). S3 일별 캐시 + rate limit 준수 (인증키는 Secrets Manager).
- **SSE 어휘** retail 그대로: `{"type":"phase|delta|log|final|result", "data":{...}}`. `streamSSE<T>` helper 동일.
- **`web/components/DataSourceBadge.tsx`** — 모든 데모 화면에 *real / synthetic / external* 배지 노출 (Goal 6).

## 3. 14 시나리오 × 5 부서 페르소나

### 3.1 시나리오 카탈로그

| # | 코드 | 시나리오 | 핵심 기술 | 데이터 소스 |
|---|---|---|---|---|
| A | `search` | 의미 검색 + 1-hop subgraph | OpenSearch BM25(Nori) + Cohere KNN, RRF, rerank-v3 | customer + transaction + campaign 통합 인덱스 |
| B | `chat` | 마케터 대화 에이전트 (PDF Scenario 1) | Bedrock Converse + AgentCore Memory + 10 도구 | Neptune 전체 그래프 |
| C | `insights` | MD 인사이트 + matplotlib 차트 | Sonnet 4.6 streaming + Code Interpreter NanumGothic | Neptune 집계 + 캠페인 ROI 시계열 |
| D | `persona-match` | 페르소나 매칭 + 액션 추천 | Sonnet 4.6 + 페르소나 가중치 그래프 워크 | Customer ↔ Persona 가중 엣지 |
| E | `cluster` | 6 클러스터 분류 + Action Item (PDF Scenario 2) | Code Interpreter sklearn KMeans + LLM 라벨링 | 50만 거래 + 5만 고객 |
| F | `lookalike` | 룩어라이크 익스팬션 | Cohere embed-v4 + OpenSearch KNN | 시드 set + Neptune 속성 vectorize |
| G | `campaign-roi` | 캠페인 ROI 시뮬레이터 | Sonnet 4.6 + Bayesian 추정 + Code Interpreter | Campaign·Coupon·CouponUse·Transaction 체인 |
| H | `network` | 주유소 네트워크 지도 (시도 choropleth) | react-simple-maps + d3-geo + haversine k-NN | 실 opinet_no + 합성 고객 분포 |
| I | `compliance` | 약관·규제 가드레일 | Bedrock Guardrails + Term/TermAgreement 그래프 워크 | 합성 동의 이력 + 약관 카탈로그 |
| J | `signals` | 외부 시그널 (현대카드·앱행동·설문) 융합 | Sonnet 4.6 cross-source 융합 + Cytoscape 신호 그래프 | 외부 3소스 + 내부 세그먼트 |
| K | `outlier` | 행동 변화 탐지 (디젤→고급 전환) | Code Interpreter pandas window + LLM 패턴 라벨링 | Transaction 시계열 + FuelProduct 서브클래스 |
| L | `payment` | 결제·가격·채널 분석 | Neptune 집계 + Cytoscape 흐름도 + Sonnet 4.6 | Transaction × PaymentMethod × FuelPrice |
| M | `journey` | **고객 통합 여정** — App 설치 → 가입 → 첫 주유 → 멤버십 → 유종 전환 시계열 view, **PM+M 혼유 (92 RON DIY) 검출** + 유종 전환 Celebration 트리거 | Cytoscape timeline + AppEvent×Transaction×Term×Membership join + Sonnet 4.6 narrative | 500명 cohort 실 데이터 + 합성 lookalike (PDF page 3 케이스 재현) |
| N | `weather` | **날씨 × 주유 패턴** — 기상청 단기예보·강수·기온이 주유 빈도·연료 등급에 미치는 영향 + 시나리오 H 지도와 overlay | `services/external_api.py` 기상청 어댑터 + WeatherObservation 적재 + 시계열 회귀 / Code Interpreter | 기상청 API + Transaction join (시도·시간 단위) |

### 3.2 페르소나 × 시나리오 매트릭스 (🔥 = 우선, ◯ = 보조)

| | A | B | C | D | E | F | G | H | I | J | K | L | M | N |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| 마케팅 | 🔥 | 🔥 | 🔥 | ◯ | 🔥 | 🔥 | 🔥 | ◯ | ◯ | 🔥 | 🔥 | ◯ | 🔥 | 🔥 |
| 고객전략 | 🔥 | ◯ | 🔥 | 🔥 | 🔥 | ◯ | ◯ | 🔥 | 🔥 | 🔥 | 🔥 | ◯ | 🔥 | ◯ |
| 데이터·AI | ◯ | ◯ | 🔥 | ◯ | 🔥 | 🔥 | 🔥 | ◯ | ◯ | 🔥 | 🔥 | 🔥 | 🔥 | 🔥 |
| CRM·회원 | ◯ | 🔥 | ◯ | 🔥 | ◯ | 🔥 | 🔥 | ◯ | 🔥 | ◯ | ◯ | 🔥 | 🔥 | ◯ |
| 리테일영업 | ◯ | ◯ | 🔥 | ◯ | ◯ | ◯ | ◯ | 🔥 | ◯ | ◯ | ◯ | 🔥 | ◯ | 🔥 |

페르소나 전환 효과: (1) 사이드바 정렬 순서, (2) 홈 시나리오 카드 하이라이트, (3) 챗 에이전트 system prompt 어조·KPI 우선순위, (4) Object Explorer 기본 펼침 클래스.

## 4. 25 온톨로지 클래스 + 관계

### 4.1 클래스 카탈로그

```
[고객·회원] (5)
  Customer        [D16 — DW_CU_CUST_MAST 78cols 청사진의 15 핵심] cust_id, age_val,
                  age_section_cd, gender_cd, sido_nm, sgg_nm, work_sgg,
                  occupation_cd, vip_yn, primary_site_cd, member_grade,
                  kixx_join_dt, bns_card_join_dt, mail_recv_yn, plcc_yn
                  + data_depth ∈ {deep-history, coupon-only, sales-only, lookalike-syn}
  Persona         5 부서 (마케팅·고객전략·데이터·AI·CRM·회원사업·리테일영업)
  Cluster         K-means 6 클러스터 (충전형·출퇴근형·장거리·도심집중·고급선호·디젤전환)
  Segment         룩어라이크/캠페인 타겟. seed + similarity_score
  Member          회원 등급 (Silver/Gold/Black) + 누적 포인트

[행동·거래] (5)
  FuelTransaction tx_id, ts, store_cd, fuel_grade, qty, unit_price, amount, payment_type
  AppEvent        event_action, event_label, ts (에어브릿지 패턴)
  SurveyResponse  운전 중 불편요소 다중 응답 + 자유응답
  CouponUse       쿠폰 사용 인스턴스 (campaign↔customer↔transaction join 노드)
  PaymentMethod   PLCC/일반신용/스마트카드/포인트/현금

[마케팅] (6) — D17 갱신: CampaignSms, CampaignAggregation 추가
  Campaign            cmpg_cd, name, period, target_persona, kpi
  Coupon              denomination, valid_period, terms
  Offer               캠페인 오퍼 (쿠폰 발급 정책)
  Channel             SMS/PUSH/이메일/앱배너
  CampaignSms         [2026-05-08] DW_CP_SM_CAMP_MSG 청사진 — 발송 결과·도달·반응
  CampaignAggregation [2026-05-08] TB_SM_CMPG_OFER_S 청사진 — 캠페인×오퍼 KPI 사전계산

[운영·상품] (4)
  FuelProduct     추상. ↳ RegularGasoline/PremiumGasoline/Diesel/Kerosene/LPG
  GasStation      30~50 주유소. opinet_no(실), 주소, 셀프, 편의점
  FuelPrice       시계열 가격 {station, fuel_grade, dt, amount}
  Region          시도/시군구 (KOSTAT 행정구역코드)

[컴플·외부] (4)
  Term              약관 카탈로그. 필수/선택, 마케팅 활용 자격
  TermAgreement     동의 이력 (customer↔term + 동의일·채널)
  ConsumptionIndex  현대카드 소비지수 (외부, 차종·라이프스타일·온라인성향)
  WeatherObservation [2026-05-08] 기상청 시도×시간 단위 관측·예보 (기온·강수·풍속·미세먼지)

[시간] (1)
  TimeSlot        출근/점심/퇴근/심야/주말 5 버킷 (derived)
```

### 4.2 핵심 관계

```
Customer ─[HAS_PERSONA]→     Persona
Customer ─[BELONGS_TO]→      Cluster
Customer ─[IN_SEGMENT]→      Segment
Customer ─[IS_MEMBER]→       Member
Customer ─[AGREED_TO]→       TermAgreement ─[FOR]→ Term
Customer ─[HAS_INDEX]→       ConsumptionIndex
Customer ─[USED_APP]→        AppEvent
Customer ─[ANSWERED]→        SurveyResponse

Customer ─[REFUELED]→        FuelTransaction
                              ├─[AT]→        GasStation ─[IN]→ Region
                              ├─[OF]→        FuelProduct (subclass)
                              ├─[VIA]→       PaymentMethod
                              ├─[AT_TIME]→   TimeSlot
                              └─[USED]→      CouponUse ─[OF]→ Coupon

Campaign ─[HAS_OFFER]→       Offer ─[ISSUES]→ Coupon
Campaign ─[TARGETS]→         Persona | Cluster | Segment
Campaign ─[SENT_VIA]→        Channel
Coupon   ─[REDEEMED_AS]→     CouponUse

GasStation ─[PRICED_AT]→     FuelPrice (시계열)
GasStation ─[SELLS]→         FuelProduct
```

22 노드 + 약 30 관계 → Cytoscape ER에서 5 도메인 그룹별 색상·레이아웃 분리. 각 노드 클릭 → `/objects/<type>/` 라우트.

## 5. 데이터 전략

> **[2026-05-08 갱신 v2 — 정밀 점검 반영]** raw_data 정밀 점검 결과 cohort가 파일별로 다름이 확인됨:
> - 쿠폰(file 1) 500명 = 메인 cohort, 약관(file 4) 500명 (100% 일치)
> - 매출(file 3) **단 33명** × ~1,003 거래 = 깊은 6년 시계열 (사용자 노트의 "500명 매출"은 실제 33명) — c1∩c3 = 16명만, c3-c1 = 17명 (매출에만 있음)
> - 소비지수(file 6) 287명 (c1의 57.4%), 앱(file 8) 352명 (c1의 70.4%), 설문(file 9) 25,961 (c1∩c9=15명, 나머지는 anonymous SurveyResponse)
> - 가격(file 5) 12,315 stations × **2026-05-01~05-06 단 6일**, 주유소 마스터(file 7) 452 GSC stations
> - 시계열: 매출 2020-01~2026-05 (6년), 가격 6일, 쿠폰 2023-05~2025-12, 약관 일부 '00000000' 결측
> - encoding: 파일 2(utf-8) 외 모두 cp949 — 로더는 cp949 read + utf-8 정규화
>
> → **데이터 전략**: (a) 실 데이터 그대로 적재 + Customer.data_depth ∈ {deep-history(16), coupon-only(484), sales-only(17), lookalike-syn(~5만)}, (b) 가격 시계열은 실 6일 + 시나리오 N·G·L용 과거 1년 합성 보강 (FuelPrice.source = "real" | "synthetic"), (c) 설문 25,946은 anonymous SurveyResponse 노드로 적재 (cohort 매핑 15명만 customer 엣지). 자세한 적재 규모는 Plan 2.

### 5.1 raw_data → 온톨로지 매핑

| raw_data CSV | 온톨로지 클래스 |
|---|---|
| `1.tb_sm_cmpg_ofer_f_쿠폰발급사용내역` | Campaign + Offer + Coupon + CouponUse + (FK) Customer + FuelTransaction |
| `2.캠페인마스터` | Campaign 마스터 속성 |
| `3.cust_deal_cntx_intg_주유매출내역` | FuelTransaction (핵심 fact) + (FK) Customer, GasStation, FuelProduct, PaymentMethod, TimeSlot |
| `4.dw_cu_crd_mast_약관동의내역` | Term + TermAgreement |
| `5.tco017_주유소가격` | FuelPrice (시계열) + (FK) GasStation, FuelProduct |
| `6.현대카드소비지수` | ConsumptionIndex (외부) |
| `7.tco016_주유소마스터` | GasStation + (FK) Region, FuelProduct |
| `8.에어브릿지수집앱행동데이터` | AppEvent + (FK) Customer, Channel |
| `9.운전중불편요소설문` | SurveyResponse + (FK) Customer |
| `DL_DA_고객전략팀_테이블컬럼목록.xlsx` | `ontology/mappings/raw_to_ontology.csv` (사람·코드 SSOT) |
| `GSC_희망시나리오.pdf` | `docs/decisions/0001-scenario-source.md` (시나리오 출처 추적) |

### 5.2 적재 규모 — 실 데이터 + 합성 + 외부 (D14·D15·D16·D17 반영)

| 클래스 | 실 (raw_data) | 합성 | 외부 (API) | 총 |
|---|---:|---:|---:|---:|
| Customer | 500+17 (cohort + sales-only) | ~50,000 (lookalike-syn) | — | ~50,517 |
| Persona | — | 5 (고정) | — | 5 |
| Cluster | — | 6 (E 시나리오 산출) | — | 6 |
| Segment | — | ~20 (룩어라이크·캠페인 타겟 누적) | — | ~20 |
| Member | — | ~50,000 (Customer 1:1) | — | ~50,000 |
| FuelTransaction | 33,113 (33명 deep) | ~500,000 (484+lookalike에 합성 분포) | — | ~533,000 |
| AppEvent | 122,832 (실 352명) | ~200,000 (lookalike) | — | ~322,832 |
| SurveyResponse | 25,961 (15 매핑 + 25,946 anonymous) | — | — | 25,961 |
| CouponUse | 5,278 (실) | ~5,000 (lookalike) | — | ~10,278 |
| PaymentMethod | 5 (고정) | — | — | 5 |
| Campaign | 130 (실 + 합성 보강) | ~70 | — | 200 |
| Coupon | ~5,278 (실 fact) | ~25,000 (lookalike) | — | ~30,278 |
| Offer | 130 (Campaign 1:1) | ~70 | — | 200 |
| Channel | 4 (고정) | — | — | 4 |
| **CampaignSms** [D17] | — | ~50,000 (캠페인×수신자 합성) | — | ~50,000 |
| **CampaignAggregation** [D17] | — | 200 (캠페인×사전계산 KPI) | — | 200 |
| FuelProduct (5 subs) | 5 (고정) | — | — | 5 |
| GasStation | 452 (실 GSC + 11,863 외부 opinet) | — | — | ~12,315 |
| FuelPrice | 71,766 (실 6일) | ~440K (1년 보강 source=synthetic) | — | ~510,000 |
| Region | 250 (KOSTAT) | — | — | 250 |
| Term | 12 (고정) | — | — | 12 |
| TermAgreement | 17,616 (실 500명) | ~250K (lookalike 5만 × 5 약관) | — | ~268,000 |
| ConsumptionIndex | 287 (실 일부 cohort) | — | — | 287 |
| **WeatherObservation** [D13] | — | — | ~17,520 (시도 17 × 시간 24 × 일 365 / 7배 sampling) | ~17,520 |
| TimeSlot | 5 (고정) | — | — | 5 |
| **노드 총계** | **~280K 실** | **~1.1M 합성** | **~17.5K 외부** | **~1.4M** |
| **엣지 총계** | — | — | — | **~4M** |

**Customer cohort depth 분포 (D14)**:
- `deep-history` 16 (쿠폰+매출+약관 모두) — 시나리오 K·M 핵심 cohort
- `coupon-only` 484 (쿠폰+약관, 매출 결측) — 시나리오 D·E·F·I 사용
- `sales-only` 17 (매출에만 존재) — 시나리오 K·L 보강
- `lookalike-syn` ~50,000 — 시나리오 F·G·K·M 풍부함

**합성 분포 시뮬 기준**: KOSIS·GS 공개 IR 통계 참조 (예: 30대 28%, 40대 25%, 셀프주유 65%, 일반휘발유 50% / 디젤 35% / 고급휘발유 8% / LPG 5% / 등유 2%). 시나리오 K가 발견할 "디젤→고급 전환 0.5%" 와 PDF 3페이지의 *PM+M 92 RON 혼유 1:1~3:1* 패턴은 `data/synthetic/seeds.py`에서 명시 시드.

**Customer 15 핵심 속성 (D16, DW_CU_CUST_MAST 청사진)**: cust_id, age_val, age_section_cd, gender_cd, sido_nm, sgg_nm, work_sgg, occupation_cd, vip_yn, primary_site_cd, member_grade, kixx_join_dt, bns_card_join_dt, mail_recv_yn, plcc_yn + data_depth 태그.

### 5.3 적재 파이프라인

```
data/synthetic/* (Python)  →  S3: ontology-gcc-dev-synthetic-data/ (ndjson)
                              ↓
                Neptune Bulk Loader (S3 → Neptune)        ← 채택
                  POST /loader API (병렬 적재 ~5~8분)
                              ↓
                       Neptune cluster (gcc 전용)
                              ↓ 동시
              OpenSearch Serverless (gcc-kb-index)
              bulk indexing — 텍스트 + Cohere embed-v4
```

호출:
```bash
aws ecs run-task --cluster ontology-gcc-dev-cluster \
  --task-definition ontology-gcc-dev-api \
  --overrides '{"containerOverrides":[{"name":"api",
    "command":["python","-m","data.load","--neptune","--opensearch","--from-s3"]}]}'
```

시계열 일관성: FuelTransaction.ts와 FuelPrice.dt를 ISO8601 KST로 정렬. Neptune 인덱스 ts 기반.

## 6. 빌드 단계 + 검증

### 6.1 Phase 별 작업 (D11·D14·D16·D17·D18 정합 갱신)

| Phase | Plan | 작업 | 기간 |
|---|---|---|---|
| **0. Bootstrap** | Plan 1 | mfg fork 복사 + find&replace + retail CI/eval/ADR/.harness-eval 오버레이 + CLAUDE.md/README.md 신규 + retail VPC import 패턴 확정 + .claude 그대로 | 1일 |
| **1. 인프라 minimal** | Plan 1 | 6 stacks 중 network·data·compute·edge 배포(도메인 없이) + retail VPC import 검증 + Neptune·OpenSearch·S3·ECS·ALB·CF 헬스체크 + Cognito 프로비저닝 + 빈 홈이 200 OK | 2~3일 |
| **2. 데이터 파이프라인** | Plan 2 | **25 클래스 Pydantic** + 실 raw_data 어댑터 (cp949 → utf-8) + Customer.data_depth 태깅 + 합성 lookalike-syn 5만 + 합성 매출 484명 보강 + FuelPrice 1년 보강 (source 태그) + **opinet_codes.yaml 카탈로그** + **기상청 ETL** + Bulk Loader IAM + ~1.4M 노드 적재 + Cytoscape ER 25 노드 표시 | 4~5일 |
| **3. Vertical slice + 챗** | Plan 3 | 시나리오 A search (골드 스탠다드) + 시나리오 B 마케터 챗 (10 도구, AgentCore Memory) | 4일 |
| **4. 12 시나리오 확장** | Plan 4 | C 인사이트 / D 페르소나매칭 / E 클러스터 / F 룩어라이크 / G ROI (CampaignAggregation·CampaignSms 활용) / H 지도 (opinet_codes 경쟁사) / I 약관 / J 외부 / K Outlier (PM+M 검출) / L 결제 / **M 고객 통합 여정 (timeline view)** / **N 날씨 × 주유 (기상청 join)** | 5~7일 |
| **5. 객체·메타·운영** | Plan 5 | 25 `/objects/<type>/` + meta(ER+standards+validation+카탈로그) + ops(ingest/guardrail/memory/eval/trace) | 2일 |
| **6. 마무리** | Plan 5 | harness-eval:full → 배지 갱신, 가이드 투어 5×14 흐름, SECURITY/CHANGELOG/한·영 README 정합성, 데이터 출처 배지 UI 폴리싱 | 1~2일 |

총 19~24일 (1인 풀타임) / 12~15일 (2인 병렬).

### 6.2 CI 게이트

```
.github/workflows/ci.yml — 4 jobs (concurrency cancel-in-progress)
  python-ast    : python3 -m compileall -q api data scripts          (~1초)
  tsc-check     : matrix [web, infra-cdk] tsc --noEmit                (~10초)
  cdk-synth     : dummy account + jest --ci (6 stack 스냅샷)          (~13초)
  pytest        : tests/ 28 tests (smoke + api + models)              (<1초)
```

### 6.3 평가

- `scripts/eval_wow_queries.py` — **14 시나리오 × 5 페르소나 × 평균 5 케이스 = 약 350 wow 쿼리**, 목표 ≥85% pass, 미달 시 `sys.exit(1)`. 배포된 CloudFront 필요(`DEMO_PUBLIC_MODE=true` 또는 세션 쿠키). 시나리오 K·M의 PM+M 검출 / 유종 전환 Celebration 케이스를 별도 *시그니처 인수 케이스*로 명시.
- `harness-eval:full` (5~10분) — 12 dimension 종합 → `.harness-eval/latest.json` → README 배지. 목표 첫 릴리즈 7.5+/B, 장기 8.5+/A.

## 7. Risks & Mitigations

| 리스크 | 영향 | 완화 |
|---|---|---|
| retail VPC import 실패 (export 누락) | gcc 배포 전체 차단 | retail CDK 점검 → 필요 시 retail-network-stack에 CFN export 추가 / 또는 `Vpc.fromLookup` 태그 기반 fallback |
| Neptune Bulk Loader IAM 설정 누락 | ~1.4M 노드 적재 실패 | gcc-data-stack에 `neptune.LoadFromS3` + `s3.GetObject` IAM role + S3 VPC endpoint 필수, ADR 0003에 명시 |
| ~1.4M 노드 Cytoscape 렌더 불가 | Object Explorer UX 손상 | `/objects/<type>/`은 paginate(50/page) + 1-hop subgraph만 Cytoscape, ER 다이어그램은 25 노드 메타만 |
| 모든 raw_data CSV가 cp949 (file 2 외) | 합성 generator 한글 깨짐 | adapter에서 cp949 → utf-8 정규화 의무화. file 8 (Airbridge) event_name 깨짐은 PoC 단계 무시 (사용자 명시) |
| **deep-history 16명만 매출 보유** | 시나리오 K·G·M outlier 발견 부족 | `data/synthetic/seeds.py`에 PM+M 92 RON 혼유 250명·디젤→고급 전환 250명·룩어라이크 시드 1,000명 명시. lookalike-syn cohort에 패턴 인위 식재. |
| **가격 시계열 단 6일 (2026-05-01~06)** | 시나리오 G·L·N 시계열 분석 부족 | FuelPrice 1년치 합성 보강 (source=synthetic 태그). Plan 5 polish에서 opinet 공개 API ETL 옵션 |
| **DW_CU_CUST_MAST 78cols 미공개** | Customer 인구·직장·차량 속성 누락 | 15 핵심 속성 명시 (D16). 나머지 63개는 합성 분포로 채움 — 데모에서는 화면 노출 안 함 |
| **기상청 API rate limit** | 시나리오 N 데이터 부재 | data.go.kr 인증키 + S3 일별 캐시 + 17 시도 × 4회/일 = 68 호출/일 (rate limit 내). 캐시 적중 시 호출 안 함 |
| 외부 시그널 인코딩 (현대카드 CSV cp949) | 시나리오 J 파싱 실패 | adapter에서 `chardet` 자동 감지 + UTF-8 정규화 |
| raw_data PII 유출 | 보안 사고 | `.gitignore` raw_data/, KMS S3 별도, scrub-secrets hook은 raw_data path도 패턴 |
| Cognito callback URL 덮어쓰기 사고 | 도메인 추가 시 로그인 차단 | `scripts/cognito-update-callbacks.sh`가 기존 config 읽고 머지 후 PUT |
| **DW_CP_SM_CAMP_MSG SMS 합성** ground truth 없음 | 시나리오 G ROI 추정값이 *허구*가 될 위험 | 합성 SMS 발송 패턴은 file 1 쿠폰 발급일·캠페인 채널 분포에 정렬. 데모 시 "합성 SMS" 출처 배지 명시 |

## 8. Open Questions

OQ1. **retail VPC export 상태** — retail의 `network-stack.ts`가 VPC ID·subnet IDs를 CFN export하는지 확인 필요. export 없으면 retail에 작은 패치 또는 `Vpc.fromLookup` 사용. 빌드 Phase 0에서 결정.

OQ2. **AiU 협업** — PDF에 등장하는 내부 AI팀 자원(룩어라이크 모델·기존 클러스터 정의)을 import할지, GCC PoC가 자체 시뮬할지. 현재 설계는 자체 시뮬 가정. 협업이 가능하면 시나리오 F·E의 ground truth 정확도 향상 기대.

OQ3. **harness-eval ADR 0005** — Bulk Loader IAM 보안 감사 ADR을 사전 작성할지, Phase 1 후 작성할지. 사전 작성이 +0.2 점.

## 9. Acceptance Criteria

**인프라**
- [ ] `cdk deploy --all`이 retail이 배포된 동일 계정·리전에서 6 stacks 모두 성공 (도메인 없이, `*.cloudfront.net` URL).
- [ ] retail VPC import 검증: gcc Neptune이 retail의 isolated subnet에서 동작.
- [ ] `https://<gcc-cf>.cloudfront.net`에 데모 사용자(`admin@whchoi.net`/`demo@whchoi.net`/`!234Qwer`) 로그인 가능.

**데이터**
- [ ] `aws ecs run-task ... data.load`로 ~1.4M 노드 + ~4M 엣지 적재 완료, Neptune 카운트 일치.
- [ ] **실 데이터 cohort 검증**: deep-history=16, coupon-only=484, sales-only=17, anonymous-survey=25,946, lookalike-syn=~50,000.
- [ ] **FuelPrice source 태그 검증**: real=71,766 (2026-05-01~06), synthetic=~440,000 (1년 보강).
- [ ] **WeatherObservation 적재**: 기상청 단기예보 17 시도 × 1년 일별 = ~6,000 nodes (Plan 5에서 보강 가능).
- [ ] **opinet_codes.yaml 카탈로그**: erm_gass_trdm_dvs_cd 등 GSC 표준 코드 목록 + 경쟁사 (SK·HD·Hyundai·Self) 매핑 완성.
- [ ] **PM+M 92 RON 혼유 검출**: 시나리오 K가 deep-history 16 + lookalike 시드에서 ≥250명의 same-day PM+M 거래 발견.

**시나리오**
- [ ] **14 시나리오 (A–N)** 모두 페이지 로드 + 핵심 동작 재현. PDF Scenario 1·2·3 (PM+M 92 RON·고객 통합 여정 포함) 시연 가능.
- [ ] 5 페르소나 전환 시 사이드바·홈·챗 어조·KPI 카드 + cohort 필터 (data_depth 토글)가 일관 변경.
- [ ] **시나리오 G ROI 추정** : CampaignAggregation 사전계산 KPI ±5% 이내 일치 (deep-history cohort).
- [ ] **시나리오 N 날씨×주유**: 기상청 데이터로 주유 빈도·연료 등급 상관 시각화.

**CI / 평가 / 보안**
- [ ] CI 4 jobs 모두 그린 (`python-ast`, `tsc-check`, `cdk-synth`+jest, `pytest`), `pytest tests -q` 28+ tests 통과.
- [ ] `eval_wow_queries.py` 14 시나리오 × 5 페르소나 = ~350 wow 쿼리 ≥85% pass.
- [ ] `harness-eval:full` ≥7.5/10 (B 등급).
- [ ] `raw_data/`는 git에 포함되지 않음, KMS S3에 분리 보관.
- [ ] CHANGELOG, SECURITY, README(한·영) 모두 정합.

**데이터 출처 투명성**
- [ ] 모든 데모 화면에서 cohort 인사이트가 *real / synthetic / external* 배지로 구분되어 표시.

## 10. Next Steps

이 설계서는 5 plan으로 분해되어 작성 중:

| Plan | 포함 Phase | 상태 | 산출물 |
|---|---|---|---|
| **Plan 1** | Phase 0 + 1 (Bootstrap + Infra) | ✅ 작성 완료 | `docs/superpowers/plans/2026-05-08-plan1-foundation.md` (2,458 line) |
| **Plan 2** | Phase 2 (Data Pipeline) | ⏳ 작성 예정 | 25 클래스 generator + 실/합성/외부 통합 + Bulk Loader + 기상청 ETL |
| **Plan 3** | Phase 3 (시나리오 A·B 골드 + 챗) | ⏳ | search 골드 스탠다드 + 마케터 챗 에이전트 |
| **Plan 4** | Phase 4 (시나리오 C~N) | ⏳ | 12 시나리오 vertical slice (M·N 포함) |
| **Plan 5** | Phase 5 + 6 (객체·메타·운영·Polish) | ⏳ | 25 객체 탐색 + harness-eval + 데이터 출처 배지 + opinet 보강 |

각 plan 실행은 `superpowers:executing-plans` 또는 `superpowers:subagent-driven-development`로 진행. 검증 체크포인트는 plan 내 self-review 섹션 참조.

## Appendix A — 참조 PoC 비교

| | retail | mfg | **gcc (this)** |
|---|---|---|---|
| 도메인 | Korean 리테일/CPG | 한국 Hi-Tech MFG | **GS Caltex M&M본부 고객** |
| 시나리오 | 8 (A-H) | 12 (A-L) | **14 (A-N)** |
| 클래스 | ~10 | 22 | **25 + opinet_codes 카탈로그** |
| 페르소나 | 5 소비자 | 5 B2B 역할 | **5 부서** |
| 데이터 | 100% 합성 | 100% 합성 | **실 500+17명 + 합성 5만 + 기상청 외부 API** |
| Cohort 깊이 | 단일 | 단일 | **4단계 data_depth 태그** |
| VPC | 자체 | 자체 | **retail import** |
| 도메인 | retail-ontology.whchoi.net | mfg-ontology.whchoi.net | gcc-ontology.whchoi.net (수동) |
| 외부 API | — | — | **기상청 단기예보·동네예보 (D12)** |
| harness-eval | 7.9/B | 미배지 | 7.5+ 목표 |

## Appendix B — 빌드 명령 (예상)

```bash
# 1) Bootstrap
cp -r ../ontology-for-mfg/. .
# find&replace mfg→gcc on filenames, code, configs
# overlay retail's .github, scripts/eval_*, .harness-eval, ADR template

# 2) 인프라 배포 (도메인 없이)
cd infra-cdk
npm ci
npx cdk bootstrap aws://<account>/ap-northeast-2  # 이미 retail이 부트스트랩한 경우 생략
npx cdk deploy --all

# 3) 컨테이너 빌드·푸시
docker build --platform linux/arm64 -f api/Dockerfile -t <ecr>/ontology-gcc-dev-api:latest .
docker build --platform linux/arm64 -f web/Dockerfile -t <ecr>/ontology-gcc-dev-web:latest .
docker push ...

# 4) 데이터 적재
aws ecs run-task --cluster ontology-gcc-dev-cluster \
  --task-definition ontology-gcc-dev-api \
  --overrides '{"containerOverrides":[{"name":"api",
    "command":["python","-m","data.load","--neptune","--opensearch","--from-s3"]}]}'

# 5) 도메인 추가 (별도 후작업)
npx cdk deploy gcc-edge -c domain=gcc-ontology.whchoi.net
bash scripts/cognito-update-callbacks.sh gcc-ontology.whchoi.net
```
