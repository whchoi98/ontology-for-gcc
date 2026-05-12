---
description: Build, push, and deploy API and Web container images
---

Deterministic deploy flow that avoids `:latest` cache traps. Both images are ARM64.

**Prerequisites**: `AWS_ACCOUNT_ID` env var must be set (the commands below use it
literally). The simplest way is to derive it from the active AWS identity:

```bash
export AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
```

1. **Determine the SHA tag**:
   ```bash
   TAG="$(git rev-parse --short HEAD)-$(date +%s)"
   ```

2. **ECR login**:
   ```bash
   aws ecr get-login-password --region ap-northeast-2 \
     | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com
   ```

3. **Build both images** (ARM64):
   ```bash
   docker build --platform linux/arm64 -f api/Dockerfile \
     -t $AWS_ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com/ontology-gcc-dev-api:$TAG \
     -t $AWS_ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com/ontology-gcc-dev-api:latest .

   docker build --platform linux/arm64 -f web/Dockerfile \
     -t $AWS_ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com/ontology-gcc-dev-web:$TAG \
     -t $AWS_ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com/ontology-gcc-dev-web:latest .
   ```

4. **Push** (both SHA tag and `:latest`):
   ```bash
   docker push $AWS_ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com/ontology-gcc-dev-api:$TAG
   docker push $AWS_ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com/ontology-gcc-dev-api:latest
   docker push $AWS_ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com/ontology-gcc-dev-web:$TAG
   docker push $AWS_ACCOUNT_ID.dkr.ecr.ap-northeast-2.amazonaws.com/ontology-gcc-dev-web:latest
   ```

5. **Register SHA-pinned task definitions** (avoids ECR `:latest` cache).

   Repeat the block below with `SERVICE=api`, then `SERVICE=web` (or run both
   in parallel — see step 5e).

   ```bash
   SERVICE=api
   CLUSTER=ontology-gcc-dev-cluster
   REGION=ap-northeast-2
   IMAGE="$AWS_ACCOUNT_ID.dkr.ecr.${REGION}.amazonaws.com/ontology-gcc-dev-${SERVICE}:${TAG}"

   TD_ARN="$(aws ecs describe-services \
     --cluster "$CLUSTER" --services "ontology-gcc-dev-${SERVICE}" \
     --region "$REGION" \
     --query 'services[0].taskDefinition' --output text)"

   # del(): register-task-definition rejects these read-only fields if echoed back.
   aws ecs describe-task-definition \
     --task-definition "$TD_ARN" \
     --region "$REGION" \
     --query 'taskDefinition' \
   | jq --arg img "$IMAGE" --arg name "$SERVICE" '
       .containerDefinitions = (.containerDefinitions | map(
         if .name == $name then .image = $img else . end
       ))
       | del(.taskDefinitionArn, .revision, .status, .requiresAttributes,
             .compatibilities, .registeredAt, .registeredBy)
     ' > /tmp/td-${SERVICE}-${TAG}.json

   NEW_TD_ARN="$(aws ecs register-task-definition \
     --cli-input-json file:///tmp/td-${SERVICE}-${TAG}.json \
     --region "$REGION" \
     --query 'taskDefinition.taskDefinitionArn' --output text)"

   aws ecs update-service \
     --cluster "$CLUSTER" \
     --service "ontology-gcc-dev-${SERVICE}" \
     --task-definition "$NEW_TD_ARN" \
     --force-new-deployment \
     --region "$REGION" \
     --query 'service.deployments[*].{state:rolloutState,desired:desiredCount,running:runningCount}' \
     --output table
   ```

   **5e. (Optional) Parallel api + web**: both services are independent — wrap
   the above block in a function and background it:

   ```bash
   register_and_update() { SERVICE="$1"; <위 블록 본문>; }
   register_and_update api &
   register_and_update web &
   wait
   ```

6. **Wait for rollout** to reach `COMPLETED` for both services. The loop
   captures `describe-services` once per iteration (ECS API is throttled) and
   waits api + web concurrently:

   ```bash
   wait_rollout() {
     local svc="$1"
     while :; do
       out=$(aws ecs describe-services \
         --cluster "$CLUSTER" --services "ontology-gcc-dev-${svc}" \
         --region "$REGION" \
         --query 'services[0].deployments[?status==`PRIMARY`].{state:rolloutState,running:runningCount}' \
         --output text)
       echo "[$svc] $out"
       echo "$out" | grep -q COMPLETED && break
       sleep 15
     done
   }
   wait_rollout api &
   wait_rollout web &
   wait
   echo "==> Both services COMPLETED"
   ```

7. **Verify** with the smoke checks from `/test-all`.

If any task fails ELB health check, inspect CloudWatch logs at `/aws/ecs/ontology-gcc-dev/{api,web}` for the failing task ID — common causes are syntax errors in newly added routers or missing env vars.
