# ADR 0010 — Cognito JWT Audience Verification 활성

- Status: Accepted
- Date: 2026-05-14
- Deciders: Kiro review gate (high-severity) + 개발팀

## Context

`api/middleware_auth.py:78` 와 `api/routers/auth.py:118` 의 `jwt.decode()` 호출이 *audience 검증 비활성* (`verify_aud: False`).

AWS Cognito 의 *multi-tenant* 구조:
- 하나의 *user pool* 안에 여러 *app client* 등록 가능
- 모든 app client 가 *같은 JWKS 공개키* 공유
- JWT 의 `aud` 클레임이 *발급된 app client_id* 를 담음

`verify_aud: False` 면 같은 user pool 의 *다른 app client* (예: 별개 SPA, 모바일 앱, 테스트 client) 가 발급한 토큰을 GCC API 가 *그대로 인증*. 권한 경계 무너짐.

**위험도**: `DEMO_PUBLIC_MODE=true` 가 *대부분의 요청을 우회* 시키므로 데모 환경에서는 발현 안 됨. 단 production 전환 시 즉시 발현되는 critical 결함.

## Decision

- `jwt.decode()` 호출에 `audience=CLIENT_ID` 명시 + `options` 에서 `verify_aud: False` 제거.
- `verify_at_hash: False` 만 유지 — ID token 의 `at_hash` 클레임이 *항상 존재하지 않음* (authorization code flow vs implicit flow 차이).
- `api/middleware_auth.py` 의 `CognitoBearerAuth` 클래스에 `self.client_id` 인스턴스 변수 추가 (`COGNITO_CLIENT_ID` 환경변수 + auth.py 와 동일한 hardcoded default).

## Consequences

- **Production 전환 시 즉시 효과**: `DEMO_PUBLIC_MODE=false` 로 설정하면 audience 검증이 *발동*. 같은 user pool 의 다른 client 토큰은 401 반환.
- **`COGNITO_CLIENT_ID` 환경변수 필수**: ECS task def 에 명시 권장 (현재는 hardcoded default 로 작동하지만 ENV override 가 우선).
- **테스트 영향 없음**: `tests/conftest.py` 의 auth bypass fixture 가 `CognitoBearerAuth.dispatch` 를 직접 mock 하므로 audience 검증 path 진입 안 함.
- **기존 토큰**: PoC 데모 사용자의 토큰은 *같은 CLIENT_ID* 로 발급되었으므로 영향 없음.

## Alternatives Considered

- **`verify_aud: False` 유지 + middleware 에서 별도 `aud` 검사**: 가능하지만 *python-jose 의 내장 검증* 을 우회하는 사용자 코드는 *놓치는 케이스* 가능성 높음. 라이브러리 검증이 더 안전.
- **multi-audience 허용 (`audience=[id_a, id_b]`)**: Cognito 의 ID token 은 *단일 audience* 만 가지므로 의미 없음.

## Related Code / Files

- `api/middleware_auth.py:78-82` — jwt.decode audience 명시
- `api/middleware_auth.py:23` — self.client_id 추가
- `api/routers/auth.py:118-122` — jwt.decode audience 명시

## Verification

배포 직후 신규 task 로그에서:
- `AuthorizationException`, `401`, `JWTError` 검색 → 0건
- `/healthz` 200 OK 응답 지속

향후 production 전환 (`DEMO_PUBLIC_MODE=false`) 시:
- 같은 user pool 의 *다른 client* 토큰 시도 → 401 반환되어야 정상
- GCC 의 정상 client 토큰 → 200

---
*Implemented in commit `d41bd4e fix: 도메인 정정 + Cognito audience 검증 + Chrome popup UA 분기` (2026-05-14). Detected by Kiro review gate (high-severity).*
