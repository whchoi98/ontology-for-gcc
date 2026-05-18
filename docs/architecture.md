<p align="center">
  <a href="#한국어"><kbd> &nbsp; 한국어 &nbsp; </kbd></a> &nbsp;
  <a href="#english"><kbd> &nbsp; English &nbsp; </kbd></a>
</p>

---

## 한국어

### 시스템 개요

`ontology-gcc` 는 GS Caltex M&M본부 고객 온톨로지 PoC. AWS Bedrock (Sonnet 4.6 + Cohere embed-v4 + rerank-v3) 와 AgentCore (Memory + Code Interpreter) 위에서 5 부서 페르소나가 25 클래스 / 14 시나리오의 고객·주유소·약관 지식 그래프를 의미 검색·대화형 에이전트·실시간 인사이트로 탐색합니다. 멀티 런타임 모노레포 (Python FastAPI + Next.js 14 + AWS CDK) 이며 VPC 는 자매 PoC `ontology-for-retail` 의 네트워크 스택에서 임포트됩니다.

### 레이어별 컴포넌트

#### Ingestion
| Component | 역할 |
|-----------|------|
| `data/load.py` | CLI 진입점. Neptune + OpenSearch 동시 로드. ECS one-shot 태스크로 실행 (private subnet). |
| `data/synthetic/` | 50K 고객 / 8.5K 주유소 / 139K 거래 합성 데이터 생성기. |
| `data/external/kma_*.py` | 기상청 단기·과거 관측 API → S3 캐시 NDJSON. |
| `data/public/opinet.py`, `kfda_term.py` | 표준 매핑 어댑터 (오피넷 코드, KFDA 용어). |

#### Storage
| Component | 역할 |
|-----------|------|
| Amazon Neptune | 지식 그래프 (openCypher). 25 클래스, ~ 250K 엣지. |
| OpenSearch Serverless | Nori BM25 + Cohere KNN 듀얼 인덱스. RRF fusion. |
| Amazon S3 | 합성 데이터 / KMA 캐시 / Cohere 임베딩 백업. |
| Bedrock Knowledge Base | KFDA 용어집 (옵션). |

#### Processing / AI
| Component | 역할 |
|-----------|------|
| Bedrock Sonnet 4.6 | 챗 / 인사이트 / 캠페인 ROI 리포트. `global.anthropic.claude-sonnet-4-6` cross-region. |
| Bedrock Cohere embed-v4 | 1024-dim 벡터. OpenSearch KNN 입력. |
| Bedrock Cohere rerank-v3 | 검색 결과 reranking. 실패 시 RRF 순서 fallback. |
| AgentCore Memory | 단기 (세션) + 장기 (사용자 namespace). |
| AgentCore Code Interpreter | Firecracker microVM + matplotlib + NanumGothic. |

#### Query (API)
| Component | 역할 |
|-----------|------|
| FastAPI (Python 3.12, Fargate ARM64) | 25 라우터 (시나리오 A-N + objects + ontology + ops + auth). |
| `api/services/bedrock.py` | Converse / ConverseStream 래퍼. |
| `api/services/agent.py` | TOOL_SPECS 10개 + `_dispatch_tool` agentic loop. |
| `api/services/neptune.py` | openCypher driver + 파라미터 바인딩 강제. |
| `api/services/search.py` | OpenSearch BM25 + KNN + RRF + rerank. |

#### Presentation (Web)
| Component | 역할 |
|-----------|------|
| Next.js 14 App Router (Node 20, Fargate ARM64) | standalone output. 14 시나리오 + objects + meta + cally popup. |
| `web/components/LayoutShell.tsx` | pathname 분기 — `/cally` 는 사이드바 없는 minimal shell. |
| `web/components/FloatingChat.tsx` | 전역 Cally 챗봇 버튼 (Bot 아이콘 · GS navy gradient). |
| `web/components/CytoscapeView.tsx` | 객체 탐색 1-hop 그래프 (Cytoscape.js). |
| `react-simple-maps` + `d3-geo` | 시도 / 시군구 GeoJSON 지도. |

#### Edge / Auth
| Component | 역할 |
|-----------|------|
| CloudFront | 단일 도메인 (`gcc.whchoi.net`, legacy alias `gcc-ontology.whchoi.net` 도 CORS 허용 — ADR-0009). |
| Lambda@Edge | Cognito 쿠키 인증 + `X-Origin-Auth-Token` 주입. `USER_POOL_ID` 가 synth-time 에 baked-in (env var 미지원 우회), 빈 값일 땐 DEMO bypass (ADR-0017). |
| ALB | Public ALB. SG는 CloudFront managed prefix list `pl-22a6434b` 만 ingress — **port 80 only** (prefix list 60+ entry → SG rule service quota 로 443 추가 보류, ADR-0019). |
| Cognito User Pool | RS256 JWT. JWKS 캐시. |

#### Observability
| Component | 역할 |
|-----------|------|
| CloudWatch Logs | API + Web + Lambda@Edge. |
| CloudWatch Metrics | ECS task health, ALB 5xx, Bedrock throttle. |
| AWS X-Ray (옵션) | 분산 트레이스. |

### 풀 아키텍처 다이어그램

```
                          사용자 (브라우저)
                                 │
                                 ▼
                ┌──────────────────────────────┐
                │  CloudFront                  │
                │  + Lambda@Edge (auth)        │
                └──────────────┬───────────────┘
                  X-Origin-Auth-Token (SecretsManager)
                                ▼
                ┌──────────────────────────────┐
                │  ALB (private, SG: CF only)  │
                └──────┬─────────────────┬─────┘
                       │                 │
                       ▼                 ▼
       ┌───────────────────────┐  ┌─────────────────────┐
       │  ECS Fargate ARM64    │  │ ECS Fargate ARM64   │
       │  ontology-gcc-dev-web │  │ ontology-gcc-dev-api│
       │  Next.js 14 (Node 20) │  │ FastAPI (Python 3.12)│
       └───────────────────────┘  └──────┬──────────────┘
                                          │
              ┌────────────┬──────────────┼──────────────┬─────────────┐
              ▼            ▼              ▼              ▼             ▼
   ┌──────────────┐ ┌────────────┐ ┌──────────────┐ ┌──────────┐ ┌────────────┐
   │  Bedrock     │ │ AgentCore  │ │  Neptune     │ │OpenSearch│ │ Cognito    │
   │  Sonnet 4.6  │ │ Memory +   │ │  openCypher  │ │BM25 +    │ │ JWKS       │
   │  Cohere      │ │ CodeInterp │ │  25 클래스   │ │KNN + RRF │ │ verification│
   │  embed/rerank│ │ Firecracker│ │  ~250K edges │ │+ rerank  │ │            │
   └──────────────┘ └────────────┘ └──────┬───────┘ └──────────┘ └────────────┘
                                          │
                                          ▼
                              ┌─────────────────────┐
                              │ ECS one-shot task   │
                              │ data/load.py        │
                              │ (Synthetic +        │
                              │  S3 NDJSON 재적재)  │
                              └─────────────────────┘
```

### 데이터 흐름 (핵심 경로)

```
브라우저 → CloudFront → Lambda@Edge(쿠키→토큰) → ALB → ECS Web → ECS API → (Bedrock·Neptune·OpenSearch·AgentCore) → SSE 스트림 ↩
```

### 인프라 모듈 (CDK 6 스택)

| Stack | 책임 | 의존성 |
|-------|------|--------|
| `network-stack` | VPC 임포트 (retail), SG 3개 (app / neptune / os). | retail VPC CFN 출력. |
| `data-stack` | Neptune cluster, OpenSearch collection, S3 버킷. | network |
| `compute-stack` | ECS cluster, Task Def (api+web), ALB, ECR. | network, data |
| `ai-stack` | Bedrock Guardrail, KB, AgentCore Memory ARN. | data |
| `edge-stack` | CloudFront, Lambda@Edge, ACM us-east-1 (wildcard `*.whchoi.net` import via `fromCertificateArn`, ADR-0018), Cognito callback. | compute |
| `observability-stack` | Log groups, alarms, dashboards. | compute |

### 핵심 설계 결정

1. **VPC 임포트 (재이용)** — retail PoC와 동일 VPC 공유. SG만 GCC 전용 신규. (ADR-0001)
2. **Custom 도메인 deferred** — 1차 배포는 CloudFront 기본 URL. 도메인은 `-c domain=...` 로 별도 deploy. 외부 active zone의 stale CNAME 충돌 시 alias 분리 (ADR-0002 + ADR-0018).
14. **IAM scope-down** — task role 에서 NeptuneFullAccess + `bedrock:*` + `aoss:*` 제거 → cluster ARN / inference-profile + foundation-model ARN 패턴 / collection ARN 만 명시 (ADR-0014).
15. **DEMO_PUBLIC_MODE prod guard** — `-c stage=prod` 시 환경변수 미생성, fail-closed (ADR-0015).
16. **AOSS VPCE hardening — retail VPCE 재사용** — AOSS 는 *VPC 당 VPCE 1개 제한* 으로 CDK 가 *어떤 이름* 도 ConflictException. retail PoC 의 기존 `vpce-0d638a0ed56410be0` 를 *재사용* + GCC network policy 의 `SourceVPCEs` 에 추가 (수동 setup) (ADR-0016).
17. **Lambda@Edge synth-time replace + DEMO bypass** — env var 미지원 우회. 빈 USER_POOL_ID 시 DEMO bypass (ADR-0017).
18. **Wildcard cert import** — `*.whchoi.net` 발급분을 fromCertificateArn 으로 import. DNS validation 우회 (ADR-0018).
19. **Public ALB + Prefix List SG** — Private ALB 도입 시 export 충돌 cycle 발생 → Public ALB 복원 + prefix list ingress port 80 추가 (ADR-0019).
3. **Bulk loader는 one-shot ECS** — Neptune이 private subnet이라 dev EC2에서 직접 접근 불가. API 이미지를 재사용해 `data.load` 모듈 호출. (ADR-0003)
4. **Cohort tagging** — N=500 PII-마스킹 실데이터와 49.5K 합성 데이터 혼합. `data_source` 태그로 분리. (ADR-0004)
5. **KMA 캐시 전략** — 일별 NDJSON S3 캐시 + Neptune `Weather` 노드. (ADR-0005)
6. **TOOL_SPECS 단일 등록점** — 신규 도구는 `api/services/agent.py:TOOL_SPECS` + `_dispatch_tool` branch + chaining hint. (ADR-0006)
7. **Persona registry SSoT** — `api/services/personas.py` 가 5 부서 페르소나의 단일 진실 (어조·KPI·시나리오 우선순위). (ADR-0007)
8. **GuidedTour design** — 다크 테마, "Plan N" 같은 내부 jargon 제거. (ADR-0008)

### 운영

- 배포 / 도메인 추가 / 시크릿 회전 / KMA 키 갱신 → `docs/runbooks/` 참고.
- 장애 대응 → CloudWatch 알람 + `scripts/eval_wow_queries.py` 데일리.

---

## English

### System Overview

`ontology-gcc` is a GS Caltex M&M Division customer ontology PoC. On top of AWS Bedrock (Sonnet 4.6 + Cohere embed-v4 + rerank-v3) and AgentCore (Memory + Code Interpreter), five departmental personas explore a 25-class / 14-scenario knowledge graph of customers, stations, and policies via semantic search, conversational agents, and live insights. It is a multi-runtime monorepo (Python FastAPI + Next.js 14 + AWS CDK); the VPC is imported from the sister PoC `ontology-for-retail` network stack.

### Components by Layer

#### Ingestion
| Component | Role |
|-----------|------|
| `data/load.py` | CLI entry. Loads Neptune + OpenSearch concurrently. Executed as a one-shot ECS task (private subnet). |
| `data/synthetic/` | Synthetic generator: 50K customers / 8.5K stations / 139K transactions. |
| `data/external/kma_*.py` | KMA short-term + historical observation APIs → S3-cached NDJSON. |
| `data/public/opinet.py`, `kfda_term.py` | Standards mapping adapters (Opinet codes, KFDA terms). |

#### Storage
| Component | Role |
|-----------|------|
| Amazon Neptune | Knowledge graph (openCypher). 25 classes, ~250K edges. |
| OpenSearch Serverless | Nori BM25 + Cohere KNN dual index. RRF fusion. |
| Amazon S3 | Synthetic data, KMA cache, Cohere embedding backups. |
| Bedrock Knowledge Base | KFDA glossary (optional). |

#### Processing / AI
| Component | Role |
|-----------|------|
| Bedrock Sonnet 4.6 | Chat / insights / campaign ROI reports. `global.anthropic.claude-sonnet-4-6` cross-region. |
| Bedrock Cohere embed-v4 | 1024-dim vectors feeding OpenSearch KNN. |
| Bedrock Cohere rerank-v3 | Search result reranking. Falls back to RRF order on error. |
| AgentCore Memory | Short-term (session) + long-term (user namespace). |
| AgentCore Code Interpreter | Firecracker microVM + matplotlib + NanumGothic. |

#### Query (API)
| Component | Role |
|-----------|------|
| FastAPI (Python 3.12, Fargate ARM64) | 25 routers (scenarios A–N + objects + ontology + ops + auth). |
| `api/services/bedrock.py` | Converse / ConverseStream wrappers. |
| `api/services/agent.py` | 10 `TOOL_SPECS` + `_dispatch_tool` agentic loop. |
| `api/services/neptune.py` | openCypher driver with mandatory parameter binding. |
| `api/services/search.py` | OpenSearch BM25 + KNN + RRF + rerank. |

#### Presentation (Web)
| Component | Role |
|-----------|------|
| Next.js 14 App Router (Node 20, Fargate ARM64) | Standalone output. 14 scenarios + objects + meta + Cally popup. |
| `web/components/LayoutShell.tsx` | Pathname branch — `/cally` renders a sidebar-less minimal shell. |
| `web/components/FloatingChat.tsx` | Global Cally chatbot button (Bot icon, GS navy gradient). |
| `web/components/CytoscapeView.tsx` | Object explorer 1-hop graph (Cytoscape.js). |
| `react-simple-maps` + `d3-geo` | Sido / sigungu GeoJSON map. |

#### Edge / Auth
| Component | Role |
|-----------|------|
| CloudFront | Single custom domain (`gcc.whchoi.net`, legacy alias `gcc-ontology.whchoi.net` retained in CORS — ADR-0009). |
| Lambda@Edge | Cognito cookie auth + `X-Origin-Auth-Token` injection. `USER_POOL_ID` baked at synth time (Lambda@Edge does not support runtime env vars); empty pool ID → DEMO bypass (ADR-0017). |
| ALB | Public ALB. SG ingress = CloudFront managed prefix list `pl-22a6434b` **port 80 only** (60+ entries in prefix list → adding 443 exceeds the SG rule service quota, ADR-0019). |
| Cognito User Pool | RS256 JWT, cached JWKS. |

#### Observability
| Component | Role |
|-----------|------|
| CloudWatch Logs | API + Web + Lambda@Edge. |
| CloudWatch Metrics | ECS task health, ALB 5xx, Bedrock throttling. |
| AWS X-Ray (optional) | Distributed traces. |

### Full Architecture Diagram

```
                          User (browser)
                                 │
                                 ▼
                ┌──────────────────────────────┐
                │  CloudFront                  │
                │  + Lambda@Edge (auth)        │
                └──────────────┬───────────────┘
                  X-Origin-Auth-Token (SecretsManager)
                                ▼
                ┌──────────────────────────────┐
                │  ALB (private, SG: CF only)  │
                └──────┬─────────────────┬─────┘
                       │                 │
                       ▼                 ▼
       ┌───────────────────────┐  ┌─────────────────────┐
       │  ECS Fargate ARM64    │  │ ECS Fargate ARM64   │
       │  ontology-gcc-dev-web │  │ ontology-gcc-dev-api│
       │  Next.js 14 (Node 20) │  │ FastAPI (Python 3.12)│
       └───────────────────────┘  └──────┬──────────────┘
                                          │
              ┌────────────┬──────────────┼──────────────┬─────────────┐
              ▼            ▼              ▼              ▼             ▼
   ┌──────────────┐ ┌────────────┐ ┌──────────────┐ ┌──────────┐ ┌────────────┐
   │  Bedrock     │ │ AgentCore  │ │  Neptune     │ │OpenSearch│ │ Cognito    │
   │  Sonnet 4.6  │ │ Memory +   │ │  openCypher  │ │BM25 +    │ │ JWKS       │
   │  Cohere      │ │ CodeInterp │ │  25 classes  │ │KNN + RRF │ │ verification│
   │  embed/rerank│ │ Firecracker│ │  ~250K edges │ │+ rerank  │ │            │
   └──────────────┘ └────────────┘ └──────┬───────┘ └──────────┘ └────────────┘
                                          │
                                          ▼
                              ┌─────────────────────┐
                              │ ECS one-shot task   │
                              │ data/load.py        │
                              │ (Synthetic +        │
                              │  S3 NDJSON reload)  │
                              └─────────────────────┘
```

### Data Flow (Critical Path)

```
Browser → CloudFront → Lambda@Edge(cookie→token) → ALB → ECS Web → ECS API → (Bedrock·Neptune·OpenSearch·AgentCore) → SSE stream ↩
```

### Infrastructure Modules (6 CDK Stacks)

| Stack | Responsibility | Depends on |
|-------|----------------|------------|
| `network-stack` | Imports retail VPC, creates 3 SGs (app / neptune / os). | retail VPC CFN exports |
| `data-stack` | Neptune cluster, OpenSearch collection, S3 buckets. | network |
| `compute-stack` | ECS cluster, Task Defs (api+web), ALB, ECR. | network, data |
| `ai-stack` | Bedrock Guardrail, KB, AgentCore Memory ARN. | data |
| `edge-stack` | CloudFront, Lambda@Edge, ACM us-east-1 (wildcard `*.whchoi.net` imported via `fromCertificateArn`, ADR-0018), Cognito callback. | compute |
| `observability-stack` | Log groups, alarms, dashboards. | compute |

### Key Design Decisions

1. **VPC reuse via import** — Same VPC as the retail PoC; only SGs are GCC-exclusive. (ADR-0001)
2. **Custom domain deferred** — First deploy uses the CloudFront default URL; domain wired via `-c domain=...` separately. Skip alias when external active zone has stale CNAME (ADR-0002 + ADR-0018).
14. **IAM scope-down** — Task role drops NeptuneFullAccess + `bedrock:*` + `aoss:*` in favor of explicit cluster ARN / inference-profile + foundation-model ARN patterns / collection ARN (ADR-0014).
15. **DEMO_PUBLIC_MODE prod guard** — `-c stage=prod` omits the env var entirely → fail-closed (ADR-0015).
16. **AOSS VPCE hardening — reuse retail VPCE** — AOSS enforces *one VPCE per VPC*; CDK hit ConflictException regardless of name. Reuse retail PoC's existing `vpce-0d638a0ed56410be0` + add it to the GCC network policy's `SourceVPCEs` (manual setup) (ADR-0016).
17. **Lambda@Edge synth-time replace + DEMO bypass** — Works around the lack of runtime env vars. Empty USER_POOL_ID → DEMO bypass (ADR-0017).
18. **Wildcard cert import** — Reuse the existing `*.whchoi.net` cert via `fromCertificateArn` to skip DNS validation (ADR-0018).
19. **Public ALB + Prefix List SG** — A Private ALB introduced CFN export cycles; revert to Public ALB + prefix list port-80 ingress (ADR-0019).
3. **Bulk loader as one-shot ECS** — Neptune is in private subnets, so the dev EC2 cannot reach it; the API image is reused to invoke `data.load`. (ADR-0003)
4. **Cohort tagging** — Mix of N=500 PII-masked real data and 49.5K synthetic; separated by a `data_source` tag. (ADR-0004)
5. **KMA cache strategy** — Daily NDJSON on S3 + Neptune `Weather` nodes. (ADR-0005)
6. **TOOL_SPECS single registration** — New tools land in `api/services/agent.py:TOOL_SPECS` with a `_dispatch_tool` branch and chaining hints. (ADR-0006)
7. **Persona registry SSoT** — `api/services/personas.py` is the single source of truth for the five departmental personas (tone, KPI, scenario priority). (ADR-0007)
8. **GuidedTour design** — Dark theme; internal jargon like "Plan N" was removed. (ADR-0008)

### Operations

- Deploys / domain addition / secret rotation / KMA key refresh → see `docs/runbooks/`.
- Incident response → CloudWatch alarms + daily `scripts/eval_wow_queries.py`.
