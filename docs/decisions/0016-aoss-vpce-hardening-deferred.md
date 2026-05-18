# ADR 0016 — AOSS VPC Endpoint hardening (VPC 당 1 VPCE 제한 — 기존 retail VPCE 재사용)

- Status: Accepted (수동 setup, 2026-05-18 완료)
- Date: 2026-05-18
- Deciders: 개발팀

## Context

Kiro security review gate 가 high-severity 로 지적: AOSS collection 의 network policy `AllowFromPublic: true` → *공개 인터넷에서 endpoint 접근 가능* (단 IAM SigV4 인증 필요). PoC 시연용으로는 충분하지만 *production 부적합*.

Plan: VPC endpoint (`oss.CfnVpcEndpoint`) 를 만들고 network policy 의 `AllowFromPublic: false` + `SourceVPCEs: [<vpce-id>]` 로 *VPC 안에서만* collection 접근.

## Decision

**Hardening 시도** — 코드 추가 완료:

```typescript
const osVpcEndpoint = new oss.CfnVpcEndpoint(this, 'OsVpcEndpoint', {
  name: 'gcc-os-vpce',
  vpcId: props.vpc.vpcId,
  subnetIds: privateSubnets,
  securityGroupIds: [props.osSg.securityGroupId],
});

new oss.CfnSecurityPolicy(this, 'OsNetworkPolicy', {
  ...,
  policy: JSON.stringify([
    { Rules: [{ ResourceType: 'collection', ... }], AllowFromPublic: false, SourceVPCEs: [osVpcEndpoint.attrId] },
    { Rules: [{ ResourceType: 'dashboard', ... }], AllowFromPublic: true },
  ]),
});
```

**문제 발견** — CFN `AWS::OpenSearchServerless::VpcEndpoint` provider 가 *Create 직후 polling* 단계에서 race condition:

- `CreateVpcEndpoint` API 호출 → AWS 가 *pending* 상태로 생성 시작.
- CFN 의 polling thread 가 곧바로 *DescribeVpcEndpoint* 호출 → AWS API 가 *이미 존재* 응답.
- CFN 는 `AlreadyExists` error 로 *실패* + rollback.

**시도한 우회 — 모두 실패**:
- 이름 변경 (`gcc-os-vpce` → `gcc-os-vpce-v2` → `aoss-gcc-prod`) — 모두 `AlreadyExists`
- Retry / cooldown 대기 / 다른 prefix — 동일

**진짜 원인 발견** (2026-05-18): `aws opensearchserverless create-vpc-endpoint` 직접 호출 시 *`ConflictException: There is already a VpcEndpoint exist under VpcId vpc-0dfa5610180dfa628`*. **AOSS 는 VPC 당 VPCE 1개 제한**. retail PoC 가 이미 같은 VPC 에 VPCE 생성 (`vpce-0d638a0ed56410be0`, name `ontology-retail-dev-os-vpce`) — CDK 가 *어떤 이름* 으로 시도해도 *VPC scope conflict*. CFN provider 가 이를 `AlreadyExists` 로 매핑해 race condition 처럼 보였음.

## Decision

**기존 retail VPCE 재사용** — AOSS network policy 의 `SourceVPCEs` 는 *array* 라 *여러 collection 의 traffic* 가능. 단계:

1. **VPCE SG 에 gcc-os-sg 추가** (기존 retail SG 와 병존):
   ```bash
   aws opensearchserverless update-vpc-endpoint --id vpce-0d638a0ed56410be0 \
     --add-security-group-ids sg-095ce09a9e859e0f9
   ```

2. **GCC network policy 의 collection 만 VPC-only**:
   ```bash
   aws opensearchserverless update-security-policy --name gcc-os-network --type network \
     --policy-version <current-version> \
     --policy '[
       { "Rules": [{"Resource": ["collection/ontology-gcc-dev"], "ResourceType": "collection"}],
         "AllowFromPublic": false, "SourceVPCEs": ["vpce-0d638a0ed56410be0"] },
       { "Rules": [{"Resource": ["collection/ontology-gcc-dev"], "ResourceType": "dashboard"}],
         "AllowFromPublic": true }
     ]'
   ```

3. **검증**: `/api/search` → ECS task → VPCE ENI → AOSS collection → 200 OK.

## Consequences

- Collection 접근이 *VPC 안* 으로 제한 — 외부 인터넷에서 SigV4 호출해도 *network policy 가 거부*. Kiro high-severity 해소.
- Dashboard 는 `AllowFromPublic: true` 유지 — 운영자 *브라우저에서 직접 디버깅* 가능 (IAM 으로 잠겨있음).
- *수동 자원* — `cdk destroy` 시 자동 정리 안 됨. retail 의 VPCE 는 *retail teardown* 시 사라짐 → GCC 도 영향. coordinate destroy 필요.
- VPCE SG 에 *retail-app-sg* + *gcc-os-sg* 두 source 가 attached — VPCE ENI 가 두 SG 의 ingress 받음. 격리는 *AOSS network policy 의 SourceVPCEs + collection 별 data access policy* 로 별도 보장.
- 후속 (CDK 자동화): retail VPCE 를 *`Vpc.fromVpcEndpointId`* 같은 import 패턴으로 CDK 안에서 reference + network policy 만 CDK 가 관리. 현재는 *manual + CDK out-of-band*.

## Auto-Sync Rule

GCC 배포 시 retail VPCE 가 존재하는지 확인:

```bash
aws opensearchserverless list-vpc-endpoints --region ap-northeast-2 \
  --query 'vpcEndpointSummaries[?status==`ACTIVE` && contains(name, `retail`)]'
```

retail teardown 시 GCC 도 *network policy 수정* (다른 VPCE 로 swap 또는 임시 `AllowFromPublic: true`) 필요.
