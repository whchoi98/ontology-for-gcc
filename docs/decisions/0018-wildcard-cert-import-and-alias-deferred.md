# ADR 0018 — Wildcard cert (`*.whchoi.net`) import + 도메인 alias 분리 deploy

- Status: Accepted
- Date: 2026-05-18
- Deciders: 개발팀 (외부 active zone 충돌 회피)

## Context

Edge stack 이 처음엔 *새 ACM cert 발급* (`new acm.Certificate(this, 'Cert', { domainName: 'gcc.whchoi.net', validation: fromDns() })`). 두 가지 문제:

1. **DNS validation 대기** — ACM 가 *validation record 등록 후 propagation* 까지 PENDING. *수동 record 추가* 필요. 그동안 CFN 가 *stack CREATE_IN_PROGRESS* 로 lock — *60분 timeout*.

2. **`whchoi.net` zone 이 다른 account** — 외부 view 의 NS records (`ns-18.awsdns-02.com`, ...) 와 우리 account 의 Route53 zone NS records (`ns-286.awsdns-35.com`, ...) 가 다름. 우리 account 에 validation CNAME 추가해도 *실제 DNS 에 propagate 안 됨* → ACM 영원히 PENDING.

3. **CloudFront alias 충돌** — `gcc.whchoi.net` 의 *외부 active DNS record* 가 옛 CloudFront (`d2vtgoziwcvh15.cloudfront.net`) 를 가리킴. 새 CF distribution alias 등록 시 *hijacking 방지 검사* 로 `Invalid request` 거부.

## Decision

**1) Cert import** — `*.whchoi.net` wildcard cert 가 이미 us-east-1 에 ISSUED 되어 있음. edge-stack.ts 에서 `Certificate.fromCertificateArn` 으로 *읽기 전용 import*:

```typescript
let cert: acm.ICertificate | undefined;
if (props.domainName) {
  cert = acm.Certificate.fromCertificateArn(
    this,
    'Cert',
    'arn:aws:acm:us-east-1:061525506239:certificate/7d53182a-2a2a-4225-a319-4f94030561b7',
  );
}
```

- DNS validation 우회.
- `*.whchoi.net` 이 *모든 1-level subdomain* (gcc, awsops, dev, ...) 자동 cover.

**2) Domain alias 분리 deploy** — 외부 active zone 의 stale CNAME 충돌 회피:

- **1차 deploy** — `-c domain=` 옵션 *생략* → CloudFront default URL (`d<hash>.cloudfront.net`) 만 생성. cert/alias 안 첨부.
- **사용자 수동 처리** — 외부 active zone (다른 account/registrar) 에서 `gcc.whchoi.net` CNAME 을 새 CF default URL 로 변경.
- **2차 deploy** — DNS propagate 후 `npx cdk deploy ontology-gcc-dev-edge -c domain=gcc.whchoi.net` → alias + wildcard cert wire.

## Consequences

- Edge stack first deploy 가 *DNS validation 대기 없음* → 5-10분 (CloudFront 배포 only).
- 외부 zone 변경 시 *우리 account 의 CDK 와 무관* — 별도 운영 (registrar 또는 다른 account 의 Route53).
- Cert 갱신 시 *외부 zone owner 에게 의존* — `*.whchoi.net` cert 가 expire 되면 wildcard cert 보유 account 가 갱신.
- 단점: ARN hardcoded. Cert ARN 변경 시 *코드 변경 + redeploy*.
- 단점: 외부 zone 의 NS records 변경되면 *cert validation 도 영향* — 별도 sync 필요.
- Subdomain 추가 (예: `data.whchoi.net`) 도 *동일 wildcard cert* 재사용.
