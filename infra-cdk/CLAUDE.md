# infra-cdk/ — AWS CDK v2 인프라

> TypeScript. 6 스택. VPC는 `ontology-for-retail` 에서 임포트.

## 모듈 역할

- **인프라 IaC**: ECS (api+web), ALB, CloudFront + Lambda@Edge, Neptune, OpenSearch, Cognito, S3, Bedrock Guardrail.
- **이미지 빌드는 별도**: 이미지 자체는 `docker build` 가 만들고, CDK는 ECR repo + Task Def + Service만 관리.
- **6 스택 분리**: blast radius 격리 + 변경 빈도가 다른 자원군을 분리.

## 디렉토리 지도

```
infra-cdk/
├── bin/                  CDK 앱 엔트리 (모든 스택 인스턴스)
├── lib/
│   ├── network-stack.ts     VPC 임포트 (retail) + SG 3개
│   ├── data-stack.ts        Neptune cluster, OpenSearch collection, S3 버킷
│   ├── compute-stack.ts     ECS cluster, Task Def (api+web), ALB, ECR
│   ├── ai-stack.ts          Bedrock Guardrail, KB, AgentCore Memory ARN
│   ├── edge-stack.ts        CloudFront, Lambda@Edge, ACM us-east-1, Cognito
│   └── observability-stack.ts  Log groups, alarms, dashboards
└── test/
    ├── stacks.test.ts          Jest snapshot (스택당 1 케이스)
    └── __snapshots__/          Template.fromStack 출력 스냅샷
```

## 핵심 컨벤션

- **VPC 임포트**: `Vpc.fromVpcAttributes` (CFN export 존재 시) 또는 `Vpc.fromLookup` (태그 fallback). GCC 전용 VPC 생성 금지.
- **SG 분리**: `gcc-alb-sg` (CloudFront prefix list ingress) / `gcc-app-sg` (ECS, from albSg) / `gcc-neptune-sg` / `gcc-os-sg`. 각 SG에 source SG 또는 prefix list 만 허용.
- **이미지 태그**: `:latest` + SHA pin 둘 다 푸시. Task Def는 SHA pin을 사용 (deterministic rollout).
- **CloudFront origin auth**: Secrets Manager 키를 사용한 `X-Origin-Auth-Token`. ALB SG ingress = `com.amazonaws.global.cloudfront.origin-facing` (pl-22a6434b, ap-northeast-2) **port 80 만** — prefix list entry 60+ 라 80+443 추가 시 SG rule service quota 초과 (ADR-0019).
- **ECR repo import**: `Repository.fromRepositoryName` 으로 import — `removalPolicy: RETAIN` 으로 옛 destroy 시 살아남은 repo 와 충돌 회피 (`AlreadyExists`). CDK 가 lifecycle 관리 안 함 → RETAIN 자연 유지.
- **Lambda@Edge — synth-time string replace**: `process.env.COGNITO_USER_POOL_ID` 를 *synth time* 에 `lambda-edge-auth/index.js` 에 string replace 후 임시 디렉토리에 write → `fromAsset` 으로 deploy. 빈 값이면 *DEMO bypass* (모든 request pass-through). 운영 시 `.env` 채우고 edge redeploy (ADR-0017).
- **ACM cert — fromCertificateArn**: 와일드카드 `*.whchoi.net` cert (us-east-1 ARN `arn:aws:acm:us-east-1:061525506239:certificate/7d53182a-...`) 를 import. `domainName` prop 있을 때만 cert 첨부 + alias 설정. DNS validation 우회 (ADR-0018).
- **AOSS network policy**: CDK 는 `AllowFromPublic: true` 를 emit; 운영 hardening 은 **수동 적용** (collection → `AllowFromPublic: false` + `SourceVPCEs: [vpce-0d638a0ed56410be0]` retail VPCE 재사용, dashboard 만 public 유지). AOSS 의 *VPC 당 VPCE 1개* 제한 때문 (ADR-0016). `cdk destroy` 가 이 수동 변경을 되돌리지 않음.
- **IAM scope-down**: task role 은 `neptune-db:*` actions on cluster ARN, `bedrock:*` on inference-profile + foundation-model ARN 패턴, `aoss:APIAccessAll` on collection ARN. NeptuneFullAccess / `*` 사용 금지 (ADR-0014).
- **DEMO_PUBLIC_MODE prod guard**: `-c stage=prod` 시 환경변수 자체 생성 안 함 → fail-closed (ADR-0015).
- **ARM64 강제**: Task Def 의 `cpuArchitecture: 'ARM64'`. CDK 가 검증해 줌.

## 빌드 / 테스트 / 배포

```bash
# 합성만 (배포 X)
npx cdk synth

# 의존성 순서대로 배포 (cdk.json 의 requireApproval: "never" 가 자동 승인)
npx cdk deploy --all -c domain=gcc.whchoi.net

# Production (DEMO_PUBLIC_MODE 미생성)
npx cdk deploy --all -c domain=gcc.whchoi.net -c stage=prod

# 의도적 변경 후 snapshot 업데이트
npx jest -u
```

## 도메인 추가 (수동, 1회 — *외부 active zone 에 stale CNAME 충돌 없는 경우*)

```bash
npx cdk deploy ontology-gcc-dev-edge -c domain=gcc.whchoi.net
# Cognito callback URL 전체 re-PUT (update-user-pool-client 가 config clobber) — Runbook 02 참조
aws cognito-idp update-user-pool-client --user-pool-id <POOL_ID> --client-id <CLIENT_ID> \
  --callback-urls https://gcc.whchoi.net/auth/callback https://gcc-ontology.whchoi.net/auth/callback ...
```

**외부 zone (다른 account) 의 gcc.whchoi.net CNAME 이 옛 CloudFront 를 가리키는 경우**: CloudFront 가 *hijacking 방지 검사* 로 alias 등록 거부. 해결 — `-c domain=` 생략하고 default URL 만 deploy 후 사용자가 외부 zone CNAME 을 새 CF 로 변경, 그 다음 `-c domain=` 으로 재배포 (ADR-0018).

CDK가 도메인을 첫 deploy에 자동으로 wire하지 않음 (CFN dependency 충돌 회피). `-c domain=` 컨텍스트로 별도 deploy.

## 새 스택 추가 시

1. `lib/<scope>-stack.ts` 작성 (Construct + Props 인터페이스).
2. `bin/` 진입점에 인스턴스화 + cross-stack ref 명시.
3. `test/stacks.test.ts` 에 snapshot 케이스 추가.
4. `npx jest -u` 로 snapshot 생성.
5. `docs/decisions/` 에 ADR (이유 + 트레이드오프).
