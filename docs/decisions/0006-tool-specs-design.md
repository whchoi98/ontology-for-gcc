# ADR 0006 — TOOL_SPECS 10 도구 설계

- Status: Accepted
- Date: 2026-05-08

## Context

PDF Scenario 1의 마케터 ↔ AI Agent dialog가 자연스럽게 흐르려면 Bedrock Converse가 다음 능력을 도구로 호출 가능해야 함:

- 그래프 탐색 (1-hop subgraph, 고객 lookup, nearest stations)
- ML 액션 (cluster predict, lookalike expand, behavior change)
- 시뮬레이션 (campaign ROI)
- 회상 (memory recall, kb lookup)
- 의미 검색 (semantic search → 시나리오 A 재사용)

## Decision

10 도구 단일 등록점 `TOOL_SPECS` (JSON Schema list). `dispatch(name, input_dict, *, persona_id, session_id, cust_id) → output_dict` 분기. 모든 도구 호출은 `_TRACE_BUF` (ring buffer 200) 에 기록 → 운영 콘솔에서 timeline 시각화.

10 도구 구성:

1. `memory_recall` — AgentCore Memory long-term namespace 회상
2. `neptune_subgraph` — 1/2-hop 그래프 탐색 (cohort 자동 적용)
3. `semantic_search` — 시나리오 A 파이프라인 재사용
4. `kb_lookup` — Bedrock Knowledge Base
5. `customer_lookup` — 단일 고객 노드 + 행동 요약
6. `cluster_predict` — 클러스터 분포 (시나리오 E 연계)
7. `nearest_stations` — haversine k-NN GSC + 경쟁사
8. `campaign_simulator` — CampaignAggregation 사전계산 KPI 기반
9. `lookalike_expand` — 임베딩 유사도 상위 X% (시나리오 F 연계)
10. `behavior_change_detect` — PDF 3페이지 PM+M·디젤→premium 시그니처

## Consequences

- 도구 추가는 (1) `TOOL_SPECS` entry + (2) `tools/<name>.py` 구현 + (3) `dispatch` 분기 한 줄.
- `system_prompt` 에 도구 chaining 힌트 명시 (e.g. "semantic_search 후 customer_lookup으로 디테일 확장").
- `_TRACE_BUF` ring buffer (200) — 운영 트레이스 endpoint에서 최근 호출 dump.

## Alternatives

1. 단일 거대 도구 — 추론 품질 저하.
2. 도구 없이 SQL only — 그래프 사용 불가.
