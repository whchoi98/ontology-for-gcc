# Runbook 04 — Secret Rotation (KMA / Opinet / Origin Auth)

## When to run

- API 키 의심스러운 노출 (예: 우연한 git push, log 노출)
- 정기 회전 (분기별 권장)
- 외부 vendor 의 정책 변경 (KMA / 오피넷 키 만료)

## Pre-flight

- [ ] AWS Secrets Manager 의 write 권한 (`secretsmanager:PutSecretValue`)
- [ ] 새 API 키 (KMA / 오피넷 등) 발급 완료
- [ ] ECS 서비스 재시작 가능한 시간대 (1-2분 다운타임 허용)

## Secret 목록

| Secret 이름 | 용도 | 갱신 시 영향 |
|------------|------|-------------|
| `gcc/kma-api-key` | KMA 기상청 API 키 | KMA ETL 작업 (run_etl.py) — 다음 cron run 부터 |
| `gcc/opinet-api-key` | 오피넷 가격 API 키 | 옵셔널, 가격 ETL 실행 시 |
| `gcc/cf-origin-auth-token` | CloudFront → ALB origin 인증 | API 서비스 즉시 재시작 필요 |

## Steps

### 1. KMA API 키 회전

```bash
# 새 키를 Secrets Manager 에 업데이트
NEW_KEY="xxxxxxxxxxxxxxxxxxx"
aws secretsmanager put-secret-value \
  --secret-id gcc/kma-api-key \
  --secret-string "$NEW_KEY" \
  --region ap-northeast-2

# 다음 cron run (또는 즉시 트리거) 부터 새 키 사용 — API 서비스 재시작 불필요
# 즉시 검증:
aws ecs run-task --cluster ontology-gcc-dev-cluster \
  --task-definition ontology-gcc-dev-api \
  --region ap-northeast-2 \
  --overrides '{"containerOverrides":[{
    "name":"api",
    "command":["python","-m","data.external.kma_weather","--smoke"]
  }]}'
```

### 2. CloudFront Origin Auth Token 회전

```bash
# 새 token (32+ 자 random)
NEW_TOKEN=$(openssl rand -hex 32)

# Secrets Manager 갱신
aws secretsmanager put-secret-value \
  --secret-id gcc/cf-origin-auth-token \
  --secret-string "$NEW_TOKEN" \
  --region ap-northeast-2

# Lambda@Edge 가 새 token 사용하려면 publish:
# us-east-1 에서 Lambda@Edge function 의 새 version + CloudFront alias 갱신
aws lambda publish-version --function-name gcc-edge-auth --region us-east-1

# CloudFront distribution 의 lambda function version 갱신
# (CDK 사용: cd infra-cdk && npx cdk deploy gcc-edge)

# ECS API 서비스 재시작 (새 token 으로 origin auth 검증)
aws ecs update-service --cluster ontology-gcc-dev-cluster \
  --service ontology-gcc-dev-api --force-new-deployment \
  --region ap-northeast-2
```

⚠ **다운타임 주의**: CloudFront → ALB 사이 token 갱신 중 *1-2분* origin auth 401 발생 가능. 데모 시간 회피.

### 3. Cognito Client Secret 회전

```bash
# 새 client secret 생성
aws cognito-idp update-user-pool-client \
  --user-pool-id <pool-id> \
  --client-id 422o42g8odcmv21860cu2jta4 \
  --generate-secret \
  --region ap-northeast-2

# ECS task env COGNITO_CLIENT_SECRET 갱신 (CDK 또는 직접)
# 서비스 강제 재시작
aws ecs update-service --cluster ontology-gcc-dev-cluster \
  --service ontology-gcc-dev-api --force-new-deployment
```

⚠ Cognito client secret 회전은 *모든 활성 세션 무효화*. 데모 직전 금지.

## Verification

### KMA 회전 후
- 다음 cron 또는 수동 트리거 후 `/aws/ecs/.../api` 로그에서 `KMA fetch OK` 확인
- 시나리오 N (날씨 × 연료) 페이지에서 데이터 행 표시

### CloudFront Origin Auth 회전 후
- `/healthz` 200 OK 회복 (1-2분 후)
- CloudFront 로 진입한 요청이 ALB 거쳐 ECS task 도달 (CW 로그)

### Cognito 회전 후
- 로그아웃 → 재로그인 → 신규 토큰 발급 → API 정상 응답

## Rollback

이전 secret 값으로 복귀:

```bash
# Secrets Manager 의 이전 version 으로 rollback
aws secretsmanager describe-secret --secret-id gcc/kma-api-key \
  --region ap-northeast-2 --query 'VersionIdsToStages'

# 이전 version 을 AWSCURRENT 로
aws secretsmanager update-secret-version-stage \
  --secret-id gcc/kma-api-key \
  --version-stage AWSCURRENT \
  --move-to-version-id <previous-version-id> \
  --region ap-northeast-2
```

## Related

- ADR-0003 (bulk loader IAM), 0005 (KMA cache strategy)
- Runbook 03 (incident response — auth 깨짐 케이스)
- `scripts/setup-kma-secret.sh` (초기 KMA 키 등록)

---
*Last updated: 2026-05-14*
