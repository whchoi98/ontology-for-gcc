# ADR 0015 — DEMO_PUBLIC_MODE 환경변수 prod stage guard

- Status: Accepted
- Date: 2026-05-17
- Deciders: 개발팀 (Kiro security gate high-severity 대응)

## Context

`DEMO_PUBLIC_MODE=true` 는 *API middleware_auth.py* 에서 *모든 인증을 bypass* 하는 데모용 escape hatch. PoC 30-60분 데모 시 *Cognito 로그인 없이 모든 시나리오 시연* 가능.

문제: CDK code 에 `DEMO_PUBLIC_MODE: 'true'` 가 *hardcoded* → *production deploy 시에도 그대로 set* → 모든 API 가 *무인증 노출*. Kiro review gate 가 high-severity 로 지적.

## Decision

CDK context `-c stage=...` 로 *env stage* 를 분기:

```typescript
const stage = (this.node.tryGetContext('stage') ?? 'dev') as string;

apiTask.addContainer('api', {
  ...,
  environment: {
    ...,
    ONTOLOGY_ENV: stage,
    // DEMO_PUBLIC_MODE 가 production 으로 누수되면 모든 API 무인증 노출.
    // stage=prod 일 때 *환경변수 자체 생성 안 함* → fail-closed.
    ...(stage === 'prod' ? {} : { DEMO_PUBLIC_MODE: 'true' }),
  },
  ...
});
```

운영:
- `npx cdk deploy --all` → `stage='dev'` default → `DEMO_PUBLIC_MODE: 'true'` set (데모 운영).
- `npx cdk deploy --all -c stage=prod` → 환경변수 *생성 안 함* → middleware_auth.py 가 default *Cognito JWT 강제*.

## Consequences

- Production deploy 시 *DEMO escape hatch 자동 disable* — fail-closed.
- API `middleware_auth.py` 가 *환경변수 부재 = production 모드* 로 해석 (기본값 처리 안 함).
- 추가 stage (staging 등) 도 동일 패턴으로 분기 가능.
- 운영자 실수로 `-c stage=prod` 누락 시 *dev mode* 가 살아있음 → SECURITY.md 에 deploy checklist 추가 필요.
