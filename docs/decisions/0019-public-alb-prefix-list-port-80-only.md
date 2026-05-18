# ADR 0019 — Public ALB + Prefix List SG (port 80 만)

- Status: Accepted
- Date: 2026-05-18
- Deciders: 개발팀 (Private ALB 시도 실패 후 원복 + SG service quota 제약)

## Context

Kiro security review gate 가 *Public ALB* 를 high-severity 로 지적 — 인터넷에서 ALB DNS 직접 호출 가능 (단 origin auth token 검증으로 부분 완화).

**시도 1 — Private ALB + CloudFront VPC Origin** (CDK 2.161+ L2 construct `origins.VpcOrigin.withApplicationLoadBalancer()`):
- ALB `internetFacing: false`, PRIVATE_WITH_EGRESS subnet
- CloudFront ENI 가 우리 VPC 안에 생성됨 → 인터넷 노출 0
- *cross-stack SG export 변경* 시 CFN dependency cycle (`network → compute/AlbSg`) 발생
- 4 종 우회 시도 (logical ID rename, stack rename `compute-v2`, escape hatch env var, network 만 redeploy) 모두 같은 cycle 또는 다른 export 충돌
- ECR `RETAIN` repos 와 AOSS VPCE name reservation cooldown 까지 누적 → 수 시간 deploy 실패
- 사용자 결정: **원복 + Prefix List SG 보강**

**시도 2 — Public ALB + Prefix List SG (port 80 + 443)**:
- SG ingress = `com.amazonaws.global.cloudfront.origin-facing` (`pl-22a6434b`, ap-northeast-2) port 80 + 443
- AWS managed prefix list 가 *60+ IP range entry* → port 80 + 443 두 ingress 가 *SG rule service quota (default 60)* 초과
- `ServiceLimitExceeded` deploy 실패

## Decision

**Public ALB + Prefix List SG port 80 만**:

```typescript
this.albSg = new ec2.SecurityGroup(this, 'AlbSg', {
  vpc: this.vpc,
  securityGroupName: 'gcc-alb-sg',
  description: 'GCC ALB - ingress only from CloudFront managed prefix list',
  allowAllOutbound: true,
});

// CF→ALB 는 HTTP_ONLY origin policy → 80 만 필요.
this.albSg.addIngressRule(
  ec2.Peer.prefixList('pl-22a6434b'),
  ec2.Port.tcp(80),
  'CloudFront origin-facing prefix list (HTTP)',
);
```

- ALB `internetFacing: true`, PUBLIC subnet
- Listener: port 80 만
- HTTPS 종단은 *CloudFront* 가 처리 (viewer↔CF), CF→ALB 는 HTTP

## Consequences

- ALB 가 *공개 인터넷에서 도달 가능 하지만 SG ingress 가 CloudFront prefix list 만 허용* → 비 CloudFront 클라이언트는 connection refused.
- HTTPS 종단점은 *CloudFront* 만. ALB direct HTTPS 미지원 (port 443 ingress 없음).
- SG rule limit 증가 (60 → 120 등) 요청 가능 — quota request 후 443 ingress 추가 가능. 현재 PoC scope 에서 불필요.
- Public ALB 의 *route table 노출* 도 있지만 SG 가 inbound deny — 실효적 *완전 격리* 와 *동등 수준*.
- Private ALB + VPC Origin 패턴은 *retail/mfg 와 일관성* 면에서 매력적이지만 *CFN cross-stack export 의 fragility* 가 더 큰 cost. 향후 CDK 의 *VPC Origin handling 개선* 시 재시도.
- 옛 SG `gcc-alb-sg` (sg-0bb30895772007880) 는 *수동 삭제* 후 새 SG `sg-0aeeefd52ce6cedb0` 생성됨 — deploy 절차의 *idempotency 의존성* 노출.
