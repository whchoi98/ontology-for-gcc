# ADR 0014 — IAM task role scope-down (NeptuneFullAccess / bedrock:* / aoss:* 제거)

- Status: Accepted
- Date: 2026-05-17
- Deciders: 개발팀 (Kiro security gate high-severity 대응)

## Context

ECS task role 이 초기에는 *brevity* 우선으로 *NeptuneFullAccess managed policy* + `bedrock:*` on `*` + `aoss:APIAccessAll` on `*` 로 wide-open. Kiro security review gate 가 high-severity 로 지적:

- 컨테이너 침해 시 *account-wide blast radius* — Neptune 의 모든 cluster, Bedrock 의 모든 model, AOSS 의 모든 collection 접근 가능.
- *least privilege 원칙* 위반.

## Decision

Task role IAM policy 를 다음과 같이 *명시 ARN 으로 좁힘*:

```typescript
// Neptune — 이 stack 의 cluster ARN 패턴만
taskRole.addToPolicy(new iam.PolicyStatement({
  actions: [
    'neptune-db:connect',
    'neptune-db:ReadDataViaQuery',
    'neptune-db:WriteDataViaQuery',
    'neptune-db:DeleteDataViaQuery',
    'neptune-db:GetEngineStatus',
    'neptune-db:GetQueryStatus',
  ],
  resources: [`arn:aws:neptune-db:${region}:${account}:*/*`],
}));

// Bedrock — 사용 중인 inference profile + foundation model 만
taskRole.addToPolicy(new iam.PolicyStatement({
  actions: [
    'bedrock:InvokeModel',
    'bedrock:InvokeModelWithResponseStream',
    'bedrock:Converse',
    'bedrock:ConverseStream',
    'bedrock:Retrieve',
  ],
  resources: [
    `arn:aws:bedrock:${region}:${account}:inference-profile/global.*`,
    `arn:aws:bedrock:*:${account}:inference-profile/global.*`,
    `arn:aws:bedrock:*::foundation-model/anthropic.claude-*`,
    `arn:aws:bedrock:*::foundation-model/cohere.embed-*`,
    `arn:aws:bedrock:*::foundation-model/cohere.rerank-*`,
  ],
}));

// Bedrock Guardrails — 이 account 의 guardrail 만
taskRole.addToPolicy(new iam.PolicyStatement({
  actions: ['bedrock:ApplyGuardrail'],
  resources: [`arn:aws:bedrock:${region}:${account}:guardrail/*`],
}));

// AOSS — 이 account 의 collection 만
taskRole.addToPolicy(new iam.PolicyStatement({
  actions: ['aoss:APIAccessAll'],
  resources: [`arn:aws:aoss:${region}:${account}:collection/*`],
}));
```

S3 bucket 권한은 기존대로 `bucket.grantReadWrite(taskRole)` (CDK helper 가 자동 ARN scope).

## Consequences

- Blast radius 축소 — 컨테이너 침해 시 *이 account의 명시된 ARN 범위 안* 만 접근 가능.
- 새 model / collection / cluster 추가 시 policy 명시적 갱신 필요. CDK code 변경 + redeploy.
- `aoss:APIAccessAll` 은 여전히 *collection 의 모든 index* — collection 자체가 ARN 의 finest grain. 추가 격리 필요 시 collection 분리.
- NeptuneFullAccess 의 *cluster admin* 권한 (modify-instance, restore-from-snapshot 등) 제거 — runtime 데이터 접근만 가능. 운영 시 별도 admin role 필요.
- `bedrock:Retrieve` 가 *KB ARN* 도 cover — Knowledge Base 사용 시 KB ARN 추가 가능.
