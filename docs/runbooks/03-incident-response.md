# Runbook 03 — Incident Response

## When to run

- CloudWatch 알람 발생 (5xx, latency, throttle)
- 사용자가 *demo 사이트 응답 없음* 보고
- harness eval CI 실패 (<85% pass rate)
- Cally 챗봇 *침묵* / 응답 절단

## Pre-flight

- [ ] AWS console + CLI 접근 (ap-northeast-2)
- [ ] CloudWatch 로그 그룹 접근 권한
- [ ] ECS / ELB / Cognito 의 read 권한 충분

## Steps — 일반 incident triage

### 1. 영향 범위 파악 (1분)

```bash
# ECS 서비스 상태
aws ecs describe-services --cluster ontology-gcc-dev-cluster \
  --services ontology-gcc-dev-api ontology-gcc-dev-web \
  --region ap-northeast-2 \
  --query 'services[].{name:serviceName,desired:desiredCount,running:runningCount}' \
  --output table

# ALB target health
aws elbv2 describe-target-health \
  --target-group-arn arn:aws:elasticloadbalancing:ap-northeast-2:061525506239:targetgroup/ontolo-AlbHt-UIA5ED7AZXG8/8eaf3e2654d37aeb \
  --region ap-northeast-2 \
  --query 'TargetHealthDescriptions[].TargetHealth.State' --output text
```

### 2. 신규 task 로그 (3분)

```bash
LG="ontology-gcc-dev-compute-ApiTaskapiLogGroupB3F8CE89-T44t67fFJkEv"
STREAM=$(aws logs describe-log-streams --log-group-name "$LG" \
  --region ap-northeast-2 --order-by LastEventTime --descending --max-items 1 \
  --query 'logStreams[0].logStreamName' --output text)

aws logs get-log-events --log-group-name "$LG" --log-stream-name "$STREAM" \
  --region ap-northeast-2 --limit 500 --query 'events[].message' \
  --output text | tr '\t' '\n' \
  | grep -iE "error|exception|traceback|403|401|throttl|timeout" | tail -30
```

## Common Incident Patterns

### A. Bedrock Throttling — `ThrottlingException` / `TooManyRequestsException`

**증상**: 챗 응답 지연 또는 실패, `final {ok: false, error_type: 'ThrottlingException'}` SSE 이벤트.

**원인**: Cross-region inference profile (`global.anthropic.claude-sonnet-4-6`) 의 quota 도달.

**대응**:
1. AWS Console → Bedrock → Service Quotas 확인
2. 사용량 spike 확인 (`/aws/lambda/.../bedrock-invoke` 로그 또는 직접 카운트)
3. 단기: 재시도 (Sonnet 자체 retry 로직)
4. 장기: AWS support 에 quota 증액 요청 + 모델별 trafic 분산 검토

### B. Neptune Connection Timeout

**증상**: `/api/objects/*`, `/api/cluster/*` 등이 504. 로그: `neo4j.exceptions.ServiceUnavailable` 또는 `RequestException`.

**원인**:
- Neptune cluster reboot (rare)
- ECS task SG 가 Neptune SG 에 ingress 끊김
- Neptune cluster 가 maintenance window

**대응**:
1. Neptune cluster status: `aws neptune describe-db-clusters --region ap-northeast-2`
2. SG ingress: `gcc-neptune-sg` (`sg-068b433ae86a13af5`) 에 `gcc-app-sg` (`sg-0476c7a6b7af3111f`) port 8182 ingress 있는지 확인
3. Cluster 재시작이면 5-10분 대기 (자동 회복)
4. Loader 일시 중단 (cluster 재시작 중 connection storm 회피)

### C. OpenSearch 403 — `AuthorizationException`

**증상**: 검색 응답 실패. CloudWatch: `opensearchpy.exceptions.AuthorizationException(403, 'Forbidden')`. 보통 task uptime 6시간+ 후 발현.

**원인**: ECS Fargate task role 임시 자격증명 rotation 후 *frozen credentials* expire. (ADR-0012 참고.)

**대응**:
1. v1.0.54+ 인지 확인 — 그 미만이면 *AWSV4SignerAuth 미적용 버전*
2. 단기 회피: ECS task 강제 재시작
   ```bash
   aws ecs update-service --cluster ontology-gcc-dev-cluster \
     --service ontology-gcc-dev-api --force-new-deployment \
     --region ap-northeast-2
   ```
3. 장기: v1.0.54+ 로 재배포 (이미 fix 적용됨, 회귀 발생 시 코드 점검)

### D. Cally 챗봇 *침묵* (SSE mid-stream 끊김)

**증상**: 사용자가 질문 → "조회 중" 표시 후 응답 안 옴 → 연결 끊김.

**원인 분류**:
1. **Tool dispatch 단계 예외** → `final {ok: false, error}` 가 emit 되어야 정상 (v1.0.54+). 안 오면 `stream_phases` try/except 누락.
2. **CloudFront timeout** → 30s origin response 또는 5s keep-alive idle. 매 delta 가 reset 해야 정상.
3. **Lambda@Edge ORIGIN_RESPONSE 후크 추가** → SSE chunked transfer 깨짐. `VIEWER_REQUEST` 만 사용.

**대응**:
1. CloudWatch 로그에서 *마지막 SSE 이벤트* 추적:
   ```bash
   aws logs get-log-events --log-group-name "$LG" --log-stream-name "$STREAM" \
     --region ap-northeast-2 --limit 300 --query 'events[].message' \
     --output text | tr '\t' '\n' | grep -iE "sse|stream_phases|tool_call|tool_result" | tail -20
   ```
2. `stream_phases failed` 메시지 있으면 root cause exception 확인
3. CloudFront cachePolicy 확인 — `CACHING_DISABLED` 여야 함

### E. CloudFront 504 (origin response timeout)

**증상**: 동기식 (non-streaming) API 가 30초 후 504.

**원인**: 모델 호출이 30초 안에 *첫 byte* 못 보냄. SSE 라면 phase 이벤트가 즉시 emit 되어야 함.

**대응**:
1. 라우터가 `text/event-stream` 인지 확인 (모든 14 시나리오 streaming)
2. 동기 `summarize()` 호출 중이면 `summarize_stream()` 으로 전환 검토
3. 임시 throttle 해소까지 사용자에게 "잠시 후 재시도" 안내

### F. Cognito 인증 깨짐 (`401 invalid token`)

**증상**: 로그인 직후 401 응답. `JWTError: kid not in JWKS` 또는 `JWTError: aud mismatch`.

**원인**:
- `aud mismatch`: Cognito callback URL 이 다른 app client 로 등록됨 (ADR-0010 audience fix 후 발현)
- `kid not in JWKS`: Cognito user pool ID 가 task env 에 잘못 설정

**대응**:
1. ECS task env: `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` 정합 확인
2. Cognito callback URL 양 도메인 (`gcc.whchoi.net` + legacy `gcc-ontology.whchoi.net`) 모두 등록
3. `aws cognito-idp update-user-pool-client` 전체 re-PUT (callback URL clobber 주의 — Runbook 02)

## Verification

각 대응 후:
- `/healthz` 200 OK 지속 (ALB ping)
- CloudWatch 로그 *에러 신규 발생 없음*
- 사용자가 데모 시도 → 정상 응답

## Escalation

해결 안 되면:
- AWS Support 티켓 (Bedrock throttle, Neptune outage 등 service-side)
- 코드 회귀 의심이면 `git log --oneline -10` 으로 최근 commit 검토 → rollback (Runbook 01)
- 데모 시간 임박이면 `DEMO_PUBLIC_MODE=true` 로 인증 우회 (production 에선 절대 금지)

## Related

- ADR-0010 (Cognito audience), 0012 (AWSV4SignerAuth)
- Runbook 01 (배포 + 롤백), 04 (시크릿 회전)
- `prompts/sse-agent-design.md` (SSE 디자인 원칙)

---
*Last updated: 2026-05-14*
