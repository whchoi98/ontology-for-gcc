# ADR 0003 — Neptune Bulk Loader IAM Prep

- Status: Accepted (Plan 1 사전, Plan 2에서 사용)
- Date: 2026-05-08

## Context

GCC 합성 데이터 규모는 ~100만 노드 + ~350만 엣지. 직접 openCypher MERGE는 30~45분, Neptune Bulk Loader (S3 → Neptune)는 5~8분 — 7~8배 빠름. Plan 2 진입 전 IAM·VPC endpoint를 미리 가설해 둔다.

## Decision

`data-stack`이 다음을 사전 생성:

1. IAM Role `gcc-neptune-bulk-loader-role` — Neptune cluster의 `IamRoles` 속성으로 attach.
   - `AssumeRolePolicyDocument`: `rds.amazonaws.com` (Neptune trust).
   - `Policies`: `s3:GetObject`·`s3:ListBucket` on `synthetic-data` bucket.
2. ~~VPC endpoint (S3 Gateway)~~ — **Deferred** (Plan 1 dry-run): `Vpc.fromVpcAttributes` does not expose `routeTableIds`, so the gateway endpoint cannot be installed from `gcc-data-stack`. Will be added out-of-band on retail's network stack before Plan 2 Bulk Loader run, or replaced with NAT egress (slower but functional).
3. CFN Output: `BulkLoaderRoleArn` — Plan 2 loader가 `aws s3 cp ...` 후 Neptune Loader API 호출 시 사용.

## Consequences

- Plan 1 첫 배포에 IAM·endpoint가 함께 올라감 → Plan 2가 코드만 추가하면 됨.
- VPC endpoint는 retail VPC에 추가됨 (route table 수정). retail 운영 영향 미미하나 ADR 0001에 따라 retail 팀 통지 필요.
