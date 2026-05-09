# ADR 0007 — PERSONA_REGISTRY as SSOT for 5 부서 페르소나

- Status: Accepted
- Date: 2026-05-09

## Context

5 부서 (마케팅 / 고객전략 / 데이터·AI / CRM·회원사업 / 리테일영업)가 동일 데이터를
다른 KPI 렌즈로 봐야 함 (spec §3.2 매트릭스). 이 매핑이 백엔드 (라우터·system prompt·도구
가중치)와 프론트 (사이드바·홈 카드·PersonaSwitch) 양쪽에 일관 적용되어야 함.

별도 정의가 백엔드와 프론트에 흩어지면 KPI나 시나리오 우선순위가 한 쪽에서만 바뀌어
정합성이 깨지는 drift가 발생함.

## Decision

- `api/services/persona.py:PERSONA_REGISTRY: dict[PersonaId, dict]` 단일 진실원.
- 각 entry: `{name_kr, kpi_focus, tone, scenario_priority, default_cohort}`.
- 모든 라우터가 `request.persona_id`를 받아 `persona.get(persona_id)`로 lookup.
  누락/오인 시 `'marketing'`로 안전 fallback.
- 프론트의 `PersonaSwitch.tsx`는 `GET /api/personas` 엔드포인트를 호출해 SSOT를 따라감.
- system prompt 합성도 `persona.system_prompt(persona_id, scenario_code)` 한 함수로.

## Consequences

- 페르소나 추가·삭제·KPI 변경이 코드 한 곳만 수정.
- 시나리오 라우터가 모두 같은 패턴: `select_cohort(persona_id, code) → load_data → format_with_tone`.
- 프론트 하드코드 위험 제거. 백엔드 변경 즉시 UI 반영.
- 페르소나가 PoC 단계에 머무는 한 코드 상수로 충분 — DB 모델 도입은 보류.

## Alternatives Considered

1. **프론트·백엔드에 각자 5명 명시** — drift 위험 (KPI·우선순위 불일치).
2. **DB(Neptune)에 Persona 노드 + 관계로** — 동적 변경 가능하나 PoC 단계엔 과함.
   향후 페르소나 수가 늘거나 권한과 연동될 때 재검토.
3. **YAML 외부 파일** — IaC/배포 파이프라인 추가 부담; 코드 상수가 단순.

## References

- spec §3.2 (페르소나 × 시나리오 매트릭스)
- spec §2.1 (PERSONA_REGISTRY 컴포넌트 노트)
- Plan 3 Phase 3.1 Task 3.1.3
