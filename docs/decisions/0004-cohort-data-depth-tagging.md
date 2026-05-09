# ADR 0004 — Customer.data_depth Cohort Tagging

- Status: Accepted
- Date: 2026-05-08

## Context

raw_data 정밀 점검 결과 cohort가 파일별로 다름:
- 쿠폰 cohort 500명, 매출 cohort 33명 (c1∩c3=16, c3-c1=17)
- 합성 lookalike 5만 명 추가 예정

시나리오별 적합한 cohort가 다름:
- K(outlier), M(여정): deep-history 16명만이 실 패턴
- D, E, F: lookalike 포함 5만 전원 가능
- G(ROI): CampaignAggregation 기반은 deep-history만, 시뮬은 5만

## Decision

Customer 노드에 `data_depth: Literal['deep-history', 'coupon-only', 'sales-only', 'lookalike-syn']` 속성 추가.

- `deep-history` (16): c1 ∩ c3 ∩ c4 — 쿠폰+매출+약관 모두
- `coupon-only` (484): c1 - c3 — 쿠폰+약관만, 매출 결측
- `sales-only` (17): c3 - c1 — 매출에만 존재
- `lookalike-syn` (~50K): 합성 확장, deep-history 33명 매출 패턴 seed

`api/services/cohort.py:select(persona_id, scenario_code) → list[data_depth]`이 시나리오별 cohort 풀을 반환.

## Consequences

- 모든 시나리오 라우터가 cohort 필터를 명시적으로 적용 — *어느 cohort에서 산출된 인사이트인지* 데모 시 표시 가능 (Goal 6).
- 합성 데이터 비현실 우려를 *cohort 분리*로 격리 — deep-history 인사이트는 100% 실 패턴.
- WebUI는 페르소나·시나리오 전환 시 cohort 토글 표시.

## Alternatives Considered

1. 분리된 그래프 (real / synthetic 두 Neptune cluster) — 운영·교차 쿼리 복잡.
2. 태그 없이 단일 그래프 — 출처 추적 불가, Goal 6 위배.
