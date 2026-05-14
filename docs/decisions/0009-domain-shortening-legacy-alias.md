# ADR 0009 — 도메인 단축 (gcc-ontology → gcc) + Legacy Alias

- Status: Accepted
- Date: 2026-05-14
- Deciders: M&M본부 데모 피드백 + 개발팀

## Context

PoC 초기 도메인은 `gcc-ontology.whchoi.net` 로 명명. M&M본부 데모 후 사용자 피드백:
- 도메인이 *입력하기 길다*
- *프로젝트 이름* 보다 *서비스 식별자* 가 더 자연스러움
- 마케팅 자료·이메일 공유 시 *짧은 형식 선호*

운영 도메인을 `gcc.whchoi.net` 으로 단축. 단 코드/문서 곳곳에 기존 도메인 잔재 (`api/main.py` CORS, `api/routers/auth.py` APP_BASE_URL default, `.env.example`).

## Decision

- **신규 도메인**: `gcc.whchoi.net` 로 단축. CloudFront alias + Cognito callback + ACM cert 모두 갱신.
- **Legacy alias 보존**: `gcc-ontology.whchoi.net` 도 `api/main.py` 의 CORS `allow_origins` 에 *유지*. 기존 북마크·자료에서 접근 가능.
- **`APP_BASE_URL` default 갱신**: `api/routers/auth.py` 의 fallback 을 신규 도메인으로. ECS task def 에 `APP_BASE_URL` env 가 없으면 default 사용.
- **`.env.example` PUBLIC_DOMAIN 갱신**: 새 환경 셋업 시 신규 도메인.
- **문서 일괄 갱신**: README · CLAUDE.md · architecture.md · api-reference.md · onboarding.md · data-pipeline.md 의 도메인 참조 모두 신규로.

## Consequences

- **Cognito callback URL** 둘 다 등록 (legacy + 신규) 해야 함. 운영 절차로 `scripts/cognito-update-callbacks.sh` 가 양쪽 PUT.
- **API task role IAM 변경 없음** — 라우팅 변경만이므로 권한 영향 0.
- **DNS 전환 기간 동안 CORS 가 *두 origin* 허용** — production 안정 후 legacy 제거 검토.
- **외부 공유 자료**: 기존 자료의 `gcc-ontology.whchoi.net` 링크는 *legacy alias* 로 계속 동작. 신규 자료는 `gcc.whchoi.net` 사용.

## Alternatives Considered

- **하드 컷오버 (legacy alias 0)**: 외부 자료/북마크 깨짐. 거부.
- **Redirect 301 from legacy → 신규**: 가능하지만 CORS 와 분리 처리 필요. 현재 *듀얼 origin allow* 가 더 단순.

## Related Code / Files

- `api/main.py:14-20` — CORS allow_origins
- `api/routers/auth.py:19` — APP_BASE_URL default
- `.env.example:31` — PUBLIC_DOMAIN
- `infra-cdk/lib/edge-stack.ts` — CloudFront aliases (수동 deploy 시 양쪽 등록)
- `scripts/cognito-update-callbacks.sh` — Cognito callback URL PUT

## Verification

```bash
# CORS 양쪽 origin 응답 확인
curl -H 'Origin: https://gcc.whchoi.net' -I https://gcc.whchoi.net/api/personas | grep -i access-control
curl -H 'Origin: https://gcc-ontology.whchoi.net' -I https://gcc.whchoi.net/api/personas | grep -i access-control
```

---
*Implemented in commit `d41bd4e fix: 도메인 정정 + Cognito audience 검증 + Chrome popup UA 분기` (2026-05-14).*
