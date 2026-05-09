# Runbook 02 — Add Custom Domain (gcc-ontology.whchoi.net)

> Plan 5 Task 5.5.2 — domain wiring 검증 + 롤백 절차.

## 사전조건

- 6-stack CDK가 도메인 없이 1차 배포 완료 (`d2vtgoziwcvh15.cloudfront.net` 동작).
- Cognito UserPool / UserPoolClient 살아있음.
- DNS 관리자가 `gcc-ontology.whchoi.net` ACM DNS validation 레코드 추가 가능.

## 절차

### 1) CDK context에 domainName 추가 후 redeploy

```bash
cd infra-cdk
npx cdk deploy ontology-gcc-dev-edge \
  --context domainName=gcc-ontology.whchoi.net \
  --require-approval never
```

ACM 인증서가 PENDING 상태로 생성됩니다. CloudFront output에 표시되는 DNS validation
레코드(`_ABC...whchoi.net CNAME _XYZ...acm-validations.aws`)를 도메인에 추가하세요.

### 2) Cognito callback URL 안전 머지 (PUT)

CDK가 Cognito UserPoolClient의 callbackUrls를 *덮어쓰지* 않도록 — 기존 cloudfront URL을
유지한 채 신규 도메인만 추가합니다.

```bash
USER_POOL_ID=ap-northeast-2_XXXXX
CLIENT_ID=XXXXXXXXXXXX
EXISTING=$(aws cognito-idp describe-user-pool-client \
  --user-pool-id "$USER_POOL_ID" --client-id "$CLIENT_ID" \
  --query 'UserPoolClient.CallbackURLs' --output json)
NEW=$(echo "$EXISTING" | jq '. + ["https://gcc-ontology.whchoi.net/auth/callback"] | unique')
aws cognito-idp update-user-pool-client \
  --user-pool-id "$USER_POOL_ID" --client-id "$CLIENT_ID" \
  --callback-urls "$NEW"
```

## 검증 절차

```bash
# 1) ACM 발급 검증 (DNS 유효화 완료 후 ISSUED)
CERT_ARN=$(aws cloudformation describe-stacks --stack-name ontology-gcc-dev-edge \
  --region us-east-1 \
  --query "Stacks[0].Outputs[?OutputKey=='CertArn'].OutputValue" --output text)
aws acm describe-certificate --region us-east-1 \
  --certificate-arn "$CERT_ARN" \
  --query 'Certificate.Status'
# Expected: "ISSUED"

# 2) Cognito callback 머지 결과 확인
USER_POOL_ID=ap-northeast-2_XXXXX
CLIENT_ID=XXXXXXXXXXXX
aws cognito-idp describe-user-pool-client --user-pool-id "$USER_POOL_ID" \
  --client-id "$CLIENT_ID" \
  --query 'UserPoolClient.CallbackURLs'
# Expected: 두 항목 — cloudfront URL + 신규 도메인 URL

# 3) https://gcc-ontology.whchoi.net/healthz 200 OK
curl -I https://gcc-ontology.whchoi.net/healthz
# Expected: HTTP/2 200

# 4) 데모 사용자 로그인 → /search 진입
echo "수동: 브라우저에서 admin@whchoi.net 로그인 후 /search 도달 확인"
```

## 롤백 절차

도메인 wiring을 제거하려면 (예: ACM DNS validation 실패, DNS provider 이슈 등):

```bash
# 1) CDK context 없이 재배포 — domainName이 빠져 ACM/도메인이 detach
cd infra-cdk
npx cdk deploy ontology-gcc-dev-edge --require-approval never

# 2) Cognito callback에서 도메인 URL 제거 (원본 보존)
USER_POOL_ID=ap-northeast-2_XXXXX
CLIENT_ID=XXXXXXXXXXXX
EXISTING=$(aws cognito-idp describe-user-pool-client \
  --user-pool-id "$USER_POOL_ID" --client-id "$CLIENT_ID" \
  --query 'UserPoolClient.CallbackURLs' --output json)
FILTERED=$(echo "$EXISTING" | jq 'map(select(. | contains("gcc-ontology.whchoi.net") | not))')
aws cognito-idp update-user-pool-client \
  --user-pool-id "$USER_POOL_ID" --client-id "$CLIENT_ID" \
  --callback-urls "$FILTERED"

# 3) ACM 인증서는 자동 삭제되지 않으므로 수동 정리 (필요 시)
aws acm delete-certificate --certificate-arn "$CERT_ARN" --region us-east-1
```

## 일반적 실패 모드

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 502 Bad Gateway | CloudFront → ALB 보안그룹 차단 | network-stack의 east-west SG 확인 |
| 401 무한 루프 | Lambda@Edge JWT 검증 실패 | `gcc_id_token` 쿠키 페이로드 직접 디코드 |
| ACM PENDING | DNS validation 미반영 | DNS TTL 5분 + CNAME 정확히 복사 |
| 로그인 후 redirect_mismatch | Cognito callback 누락 | Step 2 (callback 머지) 재실행 |

## 참고 ADRs

- ADR 0002 — Domain Deferred Deployment (1차 배포에서 도메인 분리한 이유)
- ADR 0001 — Retail VPC Import (네트워크 의존성)
- ADR 0008 — Guided Tour Design (도메인 변경 시 OAuth callback URL 영향)
