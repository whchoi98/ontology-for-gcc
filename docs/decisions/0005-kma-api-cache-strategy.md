# ADR 0005 — KMA API Cache Strategy (D12)

- Status: Accepted
- Date: 2026-05-08

## Context

기상청 단기예보·동네예보 API는 data.go.kr 인증키 + rate limit (계정당 일 10,000 호출, 최대 동시 1 req/s). 17 시도 × 4회/일 = 68 호출/일은 안전 범위.

## Decision

1. 인증키는 AWS Secrets Manager: `ontology-gcc-dev/kma-api-key`
2. 일 1회 ETL — `data/external/run_etl.py`
3. S3 캐시: `s3://ontology-gcc-dev-synthetic-data/weather/<YYYYMMDD>/<sido>.json`
4. 캐시 hit 시 API 호출 skip — 일별 멱등
5. ECS 태스크 스케줄러는 Plan 5 polish에서 추가 (지금은 manual run)

## Consequences

- API 키 노출 위험 차단 (Secrets Manager + IAM)
- 시나리오 N(날씨×주유)이 데모 시 호출 시간 0초 (S3 cache hit)
- API rate 한도 안전 — 일 50~70 호출만

## Alternatives Considered

1. 호출마다 매번 API — 데모 latency·rate 위험
2. 합성 weather (KOSIS 통계) — D12 요구 불일치
