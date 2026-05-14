# ADR 0012 — AWSV4SignerAuth 적용 (ECS Fargate Credential Rotation 대응)

- Status: Accepted
- Date: 2026-05-14
- Deciders: 개발팀 (운영 인시던트 대응)

## Context

`api/services/opensearch.py` 의 `client()` 함수가 `@lru_cache` + `get_frozen_credentials()` 패턴 사용:

```python
@lru_cache
def client() -> OpenSearch:
    creds = session().get_credentials().get_frozen_credentials()
    auth = AWS4Auth(creds.access_key, creds.secret_key, region, 'aoss',
                    session_token=creds.token)
    ...
```

문제:
- ECS Fargate task role 임시 자격증명은 *~6시간 마다 자동 rotation*
- `get_frozen_credentials()` 는 *그 순간의 스냅샷* 을 잡음
- `@lru_cache` 가 client 객체 + frozen creds 를 *영구 보존*
- Task uptime 6시간+ 후 frozen creds *expire* → OpenSearch SigV4 서명 실패 → 403 Forbidden

증상 (2026-05-11 발견):
- API task uptime 16시간 45분
- Cally 챗봇이 "검색해 드리겠습니다..." 후 *침묵*
- CloudWatch 로그: `opensearchpy.exceptions.AuthorizationException(403, 'Forbidden')`
- SSE stream 이 tool dispatch 단계에서 예외로 끊김 → 클라이언트 hang

같은 패턴이 `api/services/search.py:HybridSearchService.__init__` (legacy, spec_match 삭제로 deprecated) 와 `api/routers/ops_resources.py:index_count()` (per-call 호출이라 frozen 영향 적음) 에도 존재.

## Decision

- `opensearch-py` 2.0+ 의 `AWSV4SignerAuth` 로 교체:

```python
from opensearchpy import OpenSearch, RequestsHttpConnection, AWSV4SignerAuth

@lru_cache
def client() -> OpenSearch:
    region = settings.AWS_REGION
    auth = AWSV4SignerAuth(session().get_credentials(), region, 'aoss')
    # ...
```

- `AWSV4SignerAuth` 는 boto3 의 `Credentials` 객체를 보관하고 *매 서명마다* `.get_frozen_credentials()` 호출 → boto3 의 `RefreshableCredentials` 가 자동 갱신
- `@lru_cache` 유지 가능 — client 자체는 계속 같은 객체, 자격증명만 refresh
- `requests-aws4auth` 의존성 제거 가능 (지금은 ops_resources.py 가 여전히 사용 — 별도 cleanup)

## Consequences

- **6시간+ uptime task 의 403 영구 해결** — credential rotation 자동 대응
- **`requests-aws4auth` 의존성**: 즉시 제거하지 않음 — `ops_resources.py:index_count()` 가 여전히 import. 단 *per-call 패턴* 이라 영향 없음. 별도 cleanup PR.
- **테스트 영향 없음**: tests/services/test_opensearch.py 가 `OpenSearch` 클래스를 mock 하므로 auth 패턴 변경 무관
- **`api/services/search.py` 도 동일 fix** (spec_match 삭제 후 unused 였으나 *cleanup 전에* fix 적용 — 이미 mfg cleanup 으로 파일 자체 삭제됨)

## Alternatives Considered

- **`@lru_cache` 제거**: 매 요청마다 새 client 생성. 작동하지만 *불필요한 오버헤드* (TCP connection pooling 손실).
- **TTL-based cache**: `@lru_cache` 대신 6시간 TTL 캐시. 가능하지만 *boto3 의 RefreshableCredentials* 가 이미 자체 TTL 관리 → 중복.
- **Manual credential refresh**: 매 호출 직전 `get_credentials().get_frozen_credentials()` 직접. AWSV4SignerAuth 가 *이미* 그렇게 함.

## Related Code / Files

- `api/services/opensearch.py:11-25` — AWSV4SignerAuth 적용
- `api/services/opensearch.py:13-17` — 자세한 주석 (rotation 메커니즘 설명)
- (deleted) `api/services/search.py` — legacy, mfg cleanup 으로 삭제
- `api/routers/ops_resources.py:90-96` — 여전히 AWS4Auth 사용 (per-call, 영향 없음)

## Verification

배포 직후 (v1.0.54+) 신규 task 로그에서:
- `403`, `AuthorizationException`, `Forbidden` → 0건
- Cally 챗봇 `semantic_search` tool 정상 응답

장기 검증 (6시간+ uptime 후):
- 같은 증상 재발 없어야 정상

---
*Implemented in commit (v1.0.54 시점 미커밋, 이후 `d41bd4e fix` 에 묶여 push, 2026-05-14). 운영 인시던트 대응 사례.*
