# ADR 0002 — Domain Deferred Deployment

- Status: Accepted
- Date: 2026-05-08

## Context

사용자가 도메인 (`gcc-ontology.whchoi.net`)·ACM 인증서·Route53 wiring을 첫 배포 후 별도 절차로 수행한다고 명시. CDK 첫 배포는 CloudFront 기본 도메인(`*.cloudfront.net`)으로 동작해야 함.

## Decision

- `EdgeStack`은 `domainName?: string` 옵셔널 prop을 받음 (`-c domain=...`).
- domainName 없으면: CloudFront alias·ACM·Route53 record 생성 *없음*. Cognito callback URL은 CloudFront 기본 도메인으로 등록.
- domainName 있으면: ACM(us-east-1)·alias·R53 record 생성. Cognito callback은 추가 PUT(`scripts/cognito-update-callbacks.sh`)으로 *기존 + 신규* 머지.

## Consequences

- 첫 배포가 단순 (`cdk deploy --all`) — 도메인 무관 작동.
- 도메인 추가는 후작업 — `cdk deploy ontology-gcc-dev-edge -c domain=gcc-ontology.whchoi.net && bash scripts/cognito-update-callbacks.sh gcc-ontology.whchoi.net`.
- Cognito callback의 PUT 위험성 — 안전 머지 스크립트 필수 (Task 1.10).

## Alternatives Considered

1. CDK가 항상 도메인 생성 → ACM·R53 권한 첫 배포 시 필수, 운영 환경 관리 부담.
2. 도메인을 `cdk.context.json`에 항상 채워두기 → 컨텍스트 캐시 의존 PoC 부적합.
