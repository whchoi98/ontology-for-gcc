# ADR 0008 — Guided Tour Design

- Status: Accepted
- Date: 2026-05-09

## Context

5 페르소나 × 14 시나리오 = 70 조합. 데모 시작 시 마케터·실무자가 *어디서 시작해야 할지* 모르면
PoC 가치 전달이 약해진다. retail이 GuidedTour로 해결한 패턴을 GCC에도 적용한다.

## Decision

- `GuidedTourGcc` (default export from `web/components/GuidedTour.tsx`)가 페르소나 변경 시
  *권장 시나리오 시작점 3개*를 카드로 노출.
- 각 카드 = 시나리오 코드·이름·*"왜 이 페르소나에 적합한가"* 한 문장 + 시나리오 페이지로 deep link.
- 추천 순서는 spec §3.2 매트릭스 (🔥) 기반 — `PERSONA_REGISTRY[pid].scenario_priority` 첫 3개.
- 홈 페이지에 항상 노출. 페르소나 전환 시 즉시 갱신.
- 기존 `GuidedTour` named export(60-min global modal)는 layout.tsx 통합이 살아있으므로 유지하고,
  새 카드 컴포넌트는 default export로 추가하여 기존 사용을 깨지 않는다.

## Consequences

- 데모 진입 시간 단축 — 사용자가 *생각하지 않고도* 적합한 시나리오로 이동.
- 새 시나리오 추가 시 PERSONA_REGISTRY만 갱신하면 GuidedTour 자동 반영.
- `/api/personas` 의존 — DEMO_PUBLIC_MODE 또는 인증 통과 시에만 카드가 채워짐.
