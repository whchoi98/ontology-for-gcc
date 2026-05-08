# ADR 0001 — Retail VPC Import

- Status: Accepted
- Date: 2026-05-08
- Deciders: brainstorming session

## Context

`ontology-for-gcc`는 `ontology-for-retail`이 이미 ap-northeast-2에 배포한 VPC·NAT GW·prefix-list를 그대로 import해 사용한다. 새 VPC를 만들지 않음으로써 (1) NAT GW 시간당 비용 중복 회피, (2) 동일 가용영역 패턴 재사용, (3) retail/gcc 간 향후 cross-domain 분석 시 네트워크 단순성 확보.

retail의 network 스택 이름은 `CcOnBedrock-Network` (NOT `OntologyRetailNetwork`). VPC ID는 `vpc-0dfa5610180dfa628`. **2-AZ 구조** (3-AZ 아님). CFN exports 17개 사용 가능.

## Decision

- gcc의 `network-stack`은 VPC를 *생성하지 않고*, 다음 둘 중 하나로 import:
  - **Preferred**: `Vpc.fromVpcAttributes` — `.env`의 `RETAIL_VPC_ID`/subnet IDs를 사용 (deterministic, CDK app 시작 시 read).
  - **Fallback**: `Vpc.fromLookup({tags: {Project: 'ontology-retail'}})` — retail VPC가 해당 태그 없으므로 fallback은 사실상 사용 불가. CFN export ImportValue 패턴 (`Fn.importValue('CcOnBedrock-Network:ExportsOutputRefVpc8378EB38272D6E3A')`)도 가능하지만 export 이름이 CDK-generated 해시라 brittle.
- gcc는 자체 SG (`gcc-app-sg`, `gcc-neptune-sg`, `gcc-os-sg`, `gcc-alb-sg`)만 신규 생성. retail의 SG는 ingress source로 *허용하지 않음*.
- prefix-list `com.amazonaws.global.cloudfront.origin-facing`은 retail이 생성한 게 아니라 AWS 관리 — 그대로 사용.
- **2-AZ 제약**: spec은 3-AZ로 가정했으나 실제 retail VPC는 2-AZ. Neptune subnet group 최소 요구사항 (2 AZ)은 충족. 시나리오 H (지도)·E (클러스터링) 등은 영향 없음.

## Consequences

- retail 스택을 destroy하면 gcc는 VPC 의존성을 잃음 — destroy 전 gcc 먼저 destroy 필요. 운영 runbook(02-add-custom-domain.md 또는 새 03-teardown.md)에 명시.
- retail이 VPC CIDR을 변경하면 gcc도 영향. 변경 시 retail 팀 사전 통지 + ADR 갱신.
- east-west 보안: retail SG ↔ gcc SG는 이론상 같은 VPC 내 통신 가능하므로 SG 내 explicit allow가 없는 한 차단됨을 IaC로 보장.
- HA: 2-AZ로 99.99% SLA는 충족 (Neptune 멀티AZ writer + reader). 3-AZ 대비 가용영역 1개 손실 시 영향 약간 큼 (PoC 수준 OK).

## Alternatives Considered

1. 신규 VPC + VPC Peering — 비용 증가, NAT GW 중복, retail-gcc cross 분석 복잡.
2. Transit Gateway hub — PoC 규모에 과함.
3. 완전 Shared VPC (AWS RAM) — 권한 모델 복잡, retail 변경 위험.

## Reference Values (as of 2026-05-08)

- AWS Account: `061525506239`
- Region: `ap-northeast-2`
- VPC ID: `vpc-0dfa5610180dfa628`
- AZs: `ap-northeast-2a`, `ap-northeast-2b`
- Public subnets (AZ-aligned): `subnet-08486a1e618b1991e` (2a), `subnet-0c161777c4031c320` (2b)
- Private subnets (AZ-aligned): `subnet-07b1e65682847dce9` (2a), `subnet-095297380cd45e1eb` (2b)
- Isolated subnets (AZ-aligned, Neptune): `subnet-022000a208af56aae` (2a), `subnet-01b8fb3c462210113` (2b)
- retail network 스택: `CcOnBedrock-Network` (CFN exports `CcOnBedrock-Network:Exports*`, 17개)

값 source: `.env` (gitignored). spec/예제는 `.env.example`에만 placeholder로 보존.

## Operational Notes

- gcc 배포 시 `cdk synth` 단계에서 `.env`의 5개 RETAIL_VPC_* 값이 모두 비어있지 않은지 검증 (CDK app entrypoint에서 fail-fast).
- subnet ID list 순서는 `RETAIL_VPC_AZS` 인덱스와 정렬되어야 함: `public[i]`/`private[i]`/`isolated[i]`가 모두 `RETAIL_VPC_AZS[i]`의 동일 AZ에 위치.
- retail이 subnet을 추가/제거하면 ADR 갱신 + `.env` 동기화 필요.
