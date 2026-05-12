# API Reference — Ontology GCC

> FastAPI 백엔드 (`api/main.py`)가 노출하는 모든 REST / SSE 엔드포인트.
> Base URL — 로컬: `http://localhost:8000` · 데모: `https://gcc-ontology.whchoi.net`

모든 엔드포인트는 다음 미들웨어를 통과합니다:
- **Origin Auth** (`REQUIRE_ORIGIN_AUTH=true`): CloudFront → ALB 사이의 `X-Origin-Auth-Token` 헤더 검증.
- **Cognito JWT** (`DEMO_PUBLIC_MODE=false`): `Authorization: Bearer ...` 또는 쿠키.
- **Bedrock Guardrails**: 챗 입력 scrub + 인사이트 답변 output filter.

SSE 응답 공통 이벤트 스키마: `{"type": "phase|delta|log|final|result", "data": {...}}`.

## 0. 운영 (`api/routers/ops.py`)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/healthz` | ALB 헬스체크. 의존성 lazy check. `200 {"ok": true}`. |
| GET | `/api/ops/meta` | 배포 메타 (image tag, git SHA, region). |
| GET | `/api/ops/resources` | Neptune·OpenSearch·Bedrock endpoint 마스킹된 상태. |

## 1. 시나리오 A — 검색 (`search.py`)

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/search` | 하이브리드 검색: OpenSearch BM25 + Cohere KNN + RRF fusion + Cohere rerank-v3. |

Body:
```json
{ "query": "VIP Black 룩어라이크", "k": 20, "rerank_k": 10 }
```

## 2. 시나리오 B — 챗봇 (`chat.py`, SSE)

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/chat` | 페르소나별 Sonnet 4.6 + 10 GCC 도구. SSE 스트림. |

Body:
```json
{
  "message": "디젤 헤비유저와 휘발유 충성 고객 차이?",
  "persona_id": "strategy",
  "session_id": "sess-...",
  "history": [{"role":"user","content":[{"text":"..."}]}]
}
```

도구 (`api/services/agent.py:TOOL_SPECS`): `semantic_search`, `nearest_stations`, `fuel_grade_lookup`, `weather_join`, `compliance_check`, `compute_persona_match`, `cluster_summary`, `lookalike_expand`, `campaign_roi_sim`, `outlier_scan`.

## 3. 시나리오 C — 인사이트 (`insights.py`, SSE)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/insights` | 페르소나별 KPI 카드 N개 + 한 줄 인사이트 (Bedrock summarize). |
| GET | `/api/insights/stream` | SSE 토큰 단위 스트림 (max 4096 tokens). |

## 4. 시나리오 D — 페르소나 매칭 (`persona_match.py`)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/persona-match/{cust_id}` | 단일 고객 → 5 부서 페르소나 score 매트릭스 + best fit. |
| POST | `/api/persona-match/batch` | 다수 고객 일괄. |

## 5. 시나리오 E — 클러스터링 (`cluster.py`)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/cluster/summary` | 6 클러스터 centroid + 인원 분포 + LLM 라벨. |
| GET | `/api/cluster/{cluster_id}/members?limit=50` | 클러스터별 상위 회원 표본. |

특이사항: KMeans 6 cluster + StandardScaler (6 features). LLM 라벨링은 Sonnet 4.6.

## 6. 시나리오 F — 룩어라이크 (`lookalike.py`)

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/lookalike/expand` | 시드 N명 → 임베딩 cosine top-K. |

## 7. 시나리오 G — 캠페인 ROI (`campaign_roi.py`)

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/campaign-roi/simulate` | 쿠폰 금액 × 기간 × 타겟 → 예상 ROAS / 전환률 / SMS 비용. Sonnet 4.6 리포트 (max 4096 토큰). |

## 8. 시나리오 H — 권역 경쟁 지도 (`network_map.py`)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/network-map/region/{sido}` | 시도 / 시군구 GSC vs 경쟁사 점유 매트릭스. |
| GET | `/api/network-map/station/{station_id}/competitors` | 단일 주유소 반경 N km 경쟁 |

## 9. 시나리오 I — 컴플라이언스 (`compliance.py`)

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/compliance/check` | 캠페인 적격성 — 마케팅 동의 / 약관 / KFDA 용어 매핑 검증. |

## 10. 시나리오 J — 외부 신호 (`external_signal.py`)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/external-signal/weather/correlate` | KMA 기상 × 주유 패턴 상관. `nl_query` 옵션으로 Sonnet 인사이트 첨부. |
| GET | `/api/external-signal/news` | 외부 뉴스 / 여론 신호 (스텁). |

## 11. 시나리오 K — 이상 탐지 (`outlier.py`)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/outlier/scan?dimension=time|amount|grade` | 차원별 이상 거래 top-N. |

## 12. 시나리오 L — 결제·멤버십 (`payment.py`)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/payment/matrix` | 결제수단 × 멤버십 등급 매트릭스. |
| GET | `/api/payment/transition` | 등급 상승 후보 / 이탈 위험. |

## 13. 시나리오 M — 고객 여정 (`journey.py`)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/journey/{cust_id}` | 단일 고객 시계열 이벤트 (주유 + 결제 + 캠페인 노출 + 약관 동의). |

## 14. 시나리오 N — 날씨 × 연료 (`external_signal.py` + `weather`)

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/weather/correlate` | 강수·온도와 셀프 vs 풀서비스 / 92RON vs 95RON 전환률 (1275 rows full). |

## 15. 객체 탐색 (`objects.py`)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/objects/{type}` | 클래스별 인스턴스 리스트 (limit / order_by 지원). |
| GET | `/api/objects/{type}/{id}` | 단일 노드 + 1-hop 이웃 (2-query split: anchor + neighbors). |

지원 `type`: `customer`, `station`, `region`, `term`, `cluster`, `persona`, `segment`, `membership`, `card`, `payment`, `campaign`, `coupon`, `offer`, `couponuse`, `sms`, `consent`, `fuel`, `transaction`, `weather`, … (25 클래스).

## 16. 온톨로지 메타 (`ontology.py`, `personas.py`)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/ontology/classes` | 25 클래스 + 한국어/영문 라벨. |
| GET | `/api/ontology/relations` | 엣지 타입 목록 (HAS_PERSONA, BELONGS_TO, IN_SEGMENT, …). |
| GET | `/api/personas` | 5 부서 페르소나 정의 (시나리오 우선순위 + 어조 메타). |

## 17. 인증 (`auth.py`)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/auth/me` | 현재 세션 사용자 (Cognito 토큰 디코드). |
| POST | `/api/auth/logout` | 쿠키 invalidate. |

## Error model

```json
{
  "error": {
    "code": "BedrockThrottled",
    "message": "ConverseStream rate limit exceeded — retry with backoff",
    "request_id": "..."
  }
}
```

대표 코드: `BedrockThrottled`, `NeptuneTimeout`, `OpenSearchUnauthorized`, `GuardrailBlocked`, `ValidationError`, `OriginAuthMissing`, `CognitoExpired`.
