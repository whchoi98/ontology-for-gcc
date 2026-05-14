# Runbook 01 — Production 배포 (API + Web)

## When to run

- 새 commit 을 production (ECS 서비스) 에 반영해야 할 때
- API 또는 Web 의 코드/설정 변경 후

대상: dev 환경 (`ontology-gcc-dev-{api,web}`). prod 환경은 별도 cluster 가 추가되면 동일 절차 + cluster 이름 교체.

## Pre-flight

- [ ] `pytest tests -q` 그린 (109 passed 이상)
- [ ] `cd web && npx tsc --noEmit` exit 0
- [ ] `python -m compileall -q api data scripts` exit 0
- [ ] `bash tests/run-all.sh` 62/62 assertions
- [ ] AWS account `061525506239` 의 ECR push 권한 (whchoi98 IAM user 또는 SSO)
- [ ] Docker daemon reachable (`docker info`)
- [ ] `git status` clean (또는 의도된 uncommitted only)

## Steps

### 1. 버전 태그 결정

```bash
# 시맨틱 버전 (web/components/Sidebar.tsx 의 default 도 같이 갱신)
TAG=v1.0.XX
```

### 2. API 이미지 빌드 + 푸시 (변경 있을 때만)

```bash
ECR_API=061525506239.dkr.ecr.ap-northeast-2.amazonaws.com/ontology-gcc-dev-api

docker build --platform linux/arm64 -f api/Dockerfile \
  -t $ECR_API:$TAG -t $ECR_API:latest .

aws ecr get-login-password --region ap-northeast-2 \
  | docker login --username AWS \
                 --password-stdin 061525506239.dkr.ecr.ap-northeast-2.amazonaws.com

docker push $ECR_API:$TAG
docker push $ECR_API:latest
```

### 3. Web 이미지 빌드 + 푸시 (변경 있을 때만)

```bash
ECR_WEB=061525506239.dkr.ecr.ap-northeast-2.amazonaws.com/ontology-gcc-dev-web

docker build --platform linux/arm64 -f web/Dockerfile \
  --build-arg NEXT_PUBLIC_APP_VERSION=$TAG \
  -t $ECR_WEB:$TAG -t $ECR_WEB:latest .

docker push $ECR_WEB:$TAG
docker push $ECR_WEB:latest
```

> **ARM64 강제**: `--platform linux/arm64` 누락 시 x86 이미지가 ECS Fargate ARM64
> task 에 거부됨. Apple Silicon Mac 도 native, EC2 (Graviton) 빌드는 자연 ARM64.

### 4. ECS 서비스 강제 롤아웃 (병렬)

```bash
CLUSTER=ontology-gcc-dev-cluster

# api + web 둘 다 갱신했으면 둘 다 force-new-deployment
aws ecs update-service --cluster $CLUSTER --service ontology-gcc-dev-api \
  --force-new-deployment --region ap-northeast-2 \
  --query 'service.deployments[?status==`PRIMARY`].rolloutState' --output text

aws ecs update-service --cluster $CLUSTER --service ontology-gcc-dev-web \
  --force-new-deployment --region ap-northeast-2 \
  --query 'service.deployments[?status==`PRIMARY`].rolloutState' --output text
```

응답: `IN_PROGRESS` 가 정상.

### 5. 롤아웃 완료 대기

```bash
for SVC in ontology-gcc-dev-api ontology-gcc-dev-web; do
  echo "waiting for $SVC..."
  until aws ecs describe-services --cluster $CLUSTER --services $SVC \
    --region ap-northeast-2 \
    --query 'services[0].deployments[?status==`PRIMARY`].rolloutState' \
    --output text | grep -q COMPLETED; do
    sleep 15
  done
  echo "$SVC: COMPLETED"
done
```

전형 소요: api ~3분, web ~3-4분 (ARM64 task 시작 + ALB healthy 확정).

## Verification

### 6a. ECS 상태

```bash
aws ecs describe-services --cluster $CLUSTER \
  --services ontology-gcc-dev-api ontology-gcc-dev-web \
  --region ap-northeast-2 \
  --query 'services[].{name:serviceName,running:runningCount,desired:desiredCount,state:deployments[?status==`PRIMARY`].rolloutState|[0]}' \
  --output table
```

기대: `running=2 desired=2 state=COMPLETED` 양쪽 서비스.

### 6b. 신규 task 의 startup + 에러 확인

```bash
LG="ontology-gcc-dev-compute-ApiTaskapiLogGroupB3F8CE89-T44t67fFJkEv"
STREAM=$(aws logs describe-log-streams --log-group-name "$LG" \
  --region ap-northeast-2 --order-by LastEventTime --descending --max-items 1 \
  --query 'logStreams[0].logStreamName' --output text)

# startup 메시지
aws logs get-log-events --log-group-name "$LG" --log-stream-name "$STREAM" \
  --region ap-northeast-2 --limit 50 --start-from-head \
  --query 'events[].message' --output text | tr '\t' '\n' \
  | grep -iE "uvicorn|startup|error|traceback" | head -10

# 403 / 401 / JWT / AuthorizationException 재발 검사 (없어야 정상)
aws logs get-log-events --log-group-name "$LG" --log-stream-name "$STREAM" \
  --region ap-northeast-2 --limit 200 --query 'events[].message' \
  --output text | tr '\t' '\n' \
  | grep -iE "403|401|Authorization|Forbidden|JWTError|Traceback" | head -10
```

기대: `Application startup complete` + `Uvicorn running` 메시지, 에러 0건.

### 6c. ALB target health

```bash
aws elbv2 describe-target-health \
  --target-group-arn arn:aws:elasticloadbalancing:ap-northeast-2:061525506239:targetgroup/ontolo-AlbHt-UIA5ED7AZXG8/8eaf3e2654d37aeb \
  --region ap-northeast-2 \
  --query 'TargetHealthDescriptions[].{target:Target.Id,state:TargetHealth.State}' \
  --output table
```

기대: 두 task 모두 `state=healthy`.

### 6d. CloudFront 도메인 smoke

브라우저에서 https://gcc.whchoi.net 접속 → 로그인 ([demo@whchoi.net](mailto:demo@whchoi.net) / `!234Qwer`) → 홈 화면 + 사이드바 버전 표시 → Cally 챗봇 동작 확인.

### 6e. wow-query eval (선택, 5분)

```bash
python3 scripts/eval_wow_queries.py
# Exit 0 + ≥85% pass rate 가 정상. <85% 면 회귀 의심.
```

## Rollback

이전 SHA 태그로 ECS service 강제 갱신:

```bash
# 이전 버전 tag 찾기
aws ecr describe-images --repository-name ontology-gcc-dev-api --region ap-northeast-2 \
  --query 'sort_by(imageDetails,& imagePushedAt)[-3:].{tag:imageTags[0],pushed:imagePushedAt}' \
  --output text

# 예: v1.0.60 으로 롤백
PREV=v1.0.60
ECR_API=061525506239.dkr.ecr.ap-northeast-2.amazonaws.com/ontology-gcc-dev-api
docker pull $ECR_API:$PREV
docker tag $ECR_API:$PREV $ECR_API:latest
docker push $ECR_API:latest

aws ecs update-service --cluster ontology-gcc-dev-cluster \
  --service ontology-gcc-dev-api --force-new-deployment \
  --region ap-northeast-2
```

또는 *SHA-pinned task definition* 등록 (deploy.md step 5 참고 — `cli-input-json` + jq image swap).

## Common Failures

| 증상 | 원인 | 해결 |
|------|------|------|
| `exec format error` (ECS task 즉시 crash) | x86 이미지 push (ARM64 missing) | `--platform linux/arm64` 재빌드 |
| `403 ECR push denied` | IAM 계정 잘못 (whchoi98 vs assumed-role) | `aws sts get-caller-identity` 확인, ECR 권한 있는 profile 로 |
| ALB health check 실패 (state=unhealthy) | 컨테이너가 8000 포트 안 띄움 | CloudWatch 로그에서 `bind` 또는 `Address already in use` |
| `Application startup` 후 즉시 `JWTError` | Cognito 환경변수 누락 | task def env `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` 확인 |
| `AuthorizationException 403` (OpenSearch) | task uptime 6h+ + `AWS4Auth(frozen)` (legacy) | `AWSV4SignerAuth` 적용 확인 (ADR-0012) |

## Related

- ADR-0001 (retail VPC 임포트), 0003 (bulk loader IAM), 0009 (도메인 정정), 0012 (AWSV4SignerAuth)
- Runbook 02 (도메인 추가), 03 (incident response), 05 (데이터 재적재)
- `.claude/commands/deploy.md` (slash 명령 — SHA-pinned task def 패턴)

---
*Last updated: 2026-05-14*
