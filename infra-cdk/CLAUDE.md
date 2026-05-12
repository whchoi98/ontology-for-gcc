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
- **SG 분리**: `gcc-app-sg` (ECS) / `gcc-neptune-sg` / `gcc-os-sg`. 각 SG에 source SG 또는 prefix list 만 허용.
- **이미지 태그**: `:latest` + SHA pin 둘 다 푸시. Task Def는 SHA pin을 사용 (deterministic rollout).
- **CloudFront origin auth**: Secrets Manager 키를 사용한 `X-Origin-Auth-Token`. ALB SG는 `com.amazonaws.global.cloudfront.origin-facing` prefix list 만 ingress.
- **ARM64 강제**: Task Def 의 `cpuArchitecture: 'ARM64'`. CDK 가 검증해 줌.

## 빌드 / 테스트 / 배포

```bash
# 합성만 (배포 X)
npx cdk synth

# 의존성 순서대로 배포
npx cdk deploy --all

# 의도적 변경 후 snapshot 업데이트
npx jest -u
```

## 도메인 추가 (수동, 1회)

```bash
npx cdk deploy gcc-edge -c domain=gcc-ontology.whchoi.net
bash scripts/cognito-update-callbacks.sh
```

CDK가 도메인을 첫 deploy에 자동으로 wire하지 않음 (CFN dependency 충돌 회피). `-c domain=` 컨텍스트로 별도 deploy.

## 새 스택 추가 시

1. `lib/<scope>-stack.ts` 작성 (Construct + Props 인터페이스).
2. `bin/` 진입점에 인스턴스화 + cross-stack ref 명시.
3. `test/stacks.test.ts` 에 snapshot 케이스 추가.
4. `npx jest -u` 로 snapshot 생성.
5. `docs/decisions/` 에 ADR (이유 + 트레이드오프).
