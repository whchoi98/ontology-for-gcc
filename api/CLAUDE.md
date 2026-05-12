# api/ — FastAPI 백엔드

> Python 3.12 + FastAPI + Pydantic v2. Fargate ARM64. 25 라우터.

## 모듈 역할

- **HTTP/SSE 어댑터**: 14 시나리오 (A-N) + 객체 탐색 + 온톨로지 메타 + ops + auth.
- **AWS 통합 단일 표면**: Bedrock / Neptune / OpenSearch / AgentCore Memory + Code Interpreter / Cognito.
- **에이전트 오케스트레이션**: `services/agent.py` 가 10 도구 TOOL_SPECS + `_dispatch_tool` agentic loop.

## 디렉토리 지도

```
api/
├── main.py            FastAPI app + 25 router include + middleware 등록
├── config.py          Pydantic Settings (env-driven, fail-closed 기본값)
├── aws_clients.py     boto3 session @lru_cache 팩토리
├── middleware_auth.py Cognito JWT + X-Origin-Auth-Token 검증
├── routers/           시나리오·도메인별 엔드포인트 (각 파일 = 한 도메인)
└── services/          Bedrock·Neptune·OpenSearch·AgentCore 래퍼 + agent loop
```

## 핵심 컨벤션 (CLAUDE.md 루트와 함께 읽을 것)

- **상대 임포트**: `from api.services import neptune`. 순환 의존성 발생 시 함수 본문 안에서 lazy import (`from api.routers import network_map as _nm`).
- **Cypher 파라미터**: 무조건 keyword `parameters={...}` 전달. 사용자 입력 f-string interpolation 절대 금지.
- **boto3 세션**: `from api.aws_clients import session as boto_session` 후 `boto_session().client(...)`. 직접 `boto3.client` 호출 금지.
- **SSE 이벤트 형식**: `{"type": "phase|delta|log|final|result", "data": {...}}`. 새 라우터도 동일 형식 유지.
- **f-string 따옴표**: `f"...{d[\"k\"]}..."` 같은 escaped 따옴표 금지 (SyntaxError). 로컬 변수로 추출.
- **TOOL_SPECS 단일 등록**: 신규 도구는 `services/agent.py:TOOL_SPECS` + `_dispatch_tool` branch + chaining hint. 다른 위치에 도구 등록 금지.

## 주요 설계 결정

- 모든 챗·인사이트 Converse 콜은 **Sonnet 4.6** (`BEDROCK_CHAT_MODEL_ID=global.anthropic.claude-sonnet-4-6`). Haiku Lite로 silent downgrade 금지.
- 리랭커는 **Cohere rerank-v3** cross-region inference profile. 실패 시 RRF 순서로 graceful degrade.
- Neptune은 private subnet — 로컬에서 직접 못 닿음. 통합 테스트는 `tests/conftest.py` 의 boto3/Neptune 클라이언트 mocking (import-site patch) 으로 처리.

## 테스트

- `tests/test_smoke.py` — 라우터 import smoke (시나리오당 1 케이스).
- `tests/api/` — Pydantic 모델, `/healthz`, `httpx.AsyncClient` 통합.
- 새 라우터 추가 시 `tests/test_smoke.py` 파라미터에 한 줄 + `tests/api/test_<scenario>.py` 통합 케이스 1+ 추가.

## 새 시나리오 추가 (Auto-Sync Rules 발췌)

1. `api/routers/<slug>.py` 작성.
2. `api/main.py` 에 `include_router` 등록.
3. `api/services/` 에 도메인 헬퍼 추가 (필요 시).
4. `tests/test_smoke.py` 파라미터 한 줄 + `tests/api/test_<slug>.py`.
5. 프론트 페이지·사이드바·api-client 동기화 (루트 CLAUDE.md Auto-Sync Rules 참조).
6. `docs/api-reference.md` 에 엔드포인트 1+ 추가.
7. CHANGELOG.md EN+KR 한 줄.
