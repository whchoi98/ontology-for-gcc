# Runbook 05 — 데이터 재적재 (Neptune + AOSS)

## When to run

- 합성 데이터 generator (`data/synthetic/*`) 갱신 후 신규 분포 반영
- Cohort 분류 정책 변경 (ADR-0004)
- ML write-back (cluster_pipeline, persona_writeback) 재실행
- KMA 기상 데이터 누락 일자 채우기
- Neptune index 손상 복구

⚠ **재적재는 idempotent** (`MERGE` 패턴) 이지만 *시간 30-60분* 소요. 데모 시간 회피.

## Pre-flight

- [ ] S3 bucket `gcc-ontology-dev-data` 접근 권한
- [ ] ECS task role 의 Neptune `connect` + OpenSearch `aoss:APIAccessAll`
- [ ] 현재 Neptune 데이터 카운트 baseline 기록

## Steps

### 1. 현재 데이터 baseline 캡처

```bash
# Neptune 노드/엣지 카운트
aws neptune-data execute-open-cypher-query \
  --open-cypher-query 'MATCH (n) RETURN labels(n)[0] AS label, count(*) AS cnt ORDER BY cnt DESC' \
  --region ap-northeast-2

# AOSS 문서 수
curl -X POST "$OPENSEARCH_ENDPOINT/$INDEX/_count" \
  --aws-sigv4 'aws:amz:ap-northeast-2:aoss'
```

기대 baseline (full load 후):
- Customer 50K, FuelTransaction 139K, Station 8.5K, Weather 21,675 (1275일 × 17 시도)
- BELONGS_TO 4.5K, HAS_PERSONA 49.5K
- AOSS `gcc-search` ~5K 문서

### 2. 합성 데이터 생성 (선택, 새 분포 적용 시)

ECS one-shot task — API 이미지 재사용:

```bash
SUBNETS="subnet-095297380cd45e1eb,subnet-07b1e65682847dce9"   # private
SG="sg-0476c7a6b7af3111f"                                      # gcc-app-sg

aws ecs run-task --cluster ontology-gcc-dev-cluster \
  --task-definition ontology-gcc-dev-api \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SG],assignPublicIp=DISABLED}" \
  --region ap-northeast-2 \
  --overrides '{"containerOverrides":[{
    "name":"api",
    "command":["python","-m","data.load","--neptune","--opensearch"]
  }]}'
```

소요: ~20-30분 (50K 고객 + 139K 거래 + 8.5K 주유소 적재).

### 3. KMA 기상 재처리 (선택, parser 버그 fix 또는 누락 일자 채우기)

S3 raw cache 만으로 재파싱 (KMA API 재호출 없이):

```bash
aws ecs run-task --cluster ontology-gcc-dev-cluster \
  --task-definition ontology-gcc-dev-api \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SG]}" \
  --region ap-northeast-2 \
  --overrides '{"containerOverrides":[{
    "name":"api",
    "command":["python","-m","data.external.run_etl","--reprocess"]
  }]}'
```

또는 *신규 일자 채우기*:

```bash
aws ecs run-task ... --overrides '{"containerOverrides":[{
  "name":"api",
  "command":["python","-m","data.external.run_etl","--start","20260501","--days","7"]
}]}'
```

### 4. ML write-back (cluster + persona)

cluster_pipeline:

```bash
aws ecs run-task --cluster ontology-gcc-dev-cluster \
  --task-definition ontology-gcc-dev-api \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SG]}" \
  --region ap-northeast-2 \
  --overrides '{"containerOverrides":[{
    "name":"api",
    "command":["python","-c","from api.services.cluster_pipeline import write_back_clusters; write_back_clusters()"]
  }]}'
```

persona_writeback (hash mod 5 분포):

```bash
aws ecs run-task ... --overrides '{"containerOverrides":[{
  "name":"api",
  "command":["python","-c","from api.services.persona_writeback import write_back_personas; write_back_personas()"]
}]}'
```

### 5. AOSS reindex (선택)

문서 인덱스만 갱신 시:

```bash
aws ecs run-task ... --overrides '{"containerOverrides":[{
  "name":"api",
  "command":["python","-m","data.load_search","--full-reindex"]
}]}'
```

⚠ AOSS 는 *eventual consistency* — 인덱싱 후 30초 정도 검색 결과가 stale 할 수 있음.

## Verification

### 6a. 적재 완료 확인

```bash
# 다시 카운트
aws neptune-data execute-open-cypher-query \
  --open-cypher-query 'MATCH (n) RETURN labels(n)[0] AS label, count(*) AS cnt ORDER BY cnt DESC'
```

baseline 과 비교 — 의도된 증감만 있어야 정상.

### 6b. wow-query eval 재실행

```bash
python3 scripts/eval_wow_queries.py
# Exit 0 + ≥85% pass rate
```

### 6c. 시나리오 spot-check

- 시나리오 E (클러스터): 6 cluster 모두 분리 + 인원 분포 균형
- 시나리오 D (페르소나 매칭): 5 부서 ≈ 10K 씩
- 시나리오 N (날씨): KMA 1275일 데이터 매시업

## Rollback

S3 NDJSON 의 *이전 버전* 으로 복구 가능 (S3 versioning 활성 시):

```bash
# 특정 NDJSON 파일의 이전 version 으로
aws s3api list-object-versions \
  --bucket gcc-ontology-dev-data \
  --prefix nodes/customer/all.ndjson \
  --region ap-northeast-2

aws s3api copy-object \
  --copy-source "gcc-ontology-dev-data/nodes/customer/all.ndjson?versionId=<prev-id>" \
  --bucket gcc-ontology-dev-data \
  --key nodes/customer/all.ndjson

# 그 다음 재적재 (노드 Bulk Load + 엣지 MERGE)
aws ecs run-task ... --overrides '{"containerOverrides":[{
  "name":"api",
  "command":["python","-m","data.load","--neptune","--edges"]
}]}'
```

## Common Failures

| 증상 | 원인 | 해결 |
|------|------|------|
| `MERGE` 후 cluster 0개 | Cypher 내 string concat 거부 (`'cl-' + toString(...)`) | Python 에서 `f'cl-{int(a["cluster"]) + 1}'` 사전 계산 |
| BELONGS_TO 4.5K 미생성 | StandardScaler 누락 → 한 cluster 에 몰림 | `cluster_pipeline.py` 의 `StandardScaler.fit_transform` 확인 |
| 강수량 모두 0 | KMA PCP 한국어 문자열 → `float()` 실패 | `_parse_pcp` 헬퍼 확인 + reprocess_from_cache |
| AOSS 색인 직후 검색 stale | Serverless eventual consistency | 30초 대기 |
| ECS one-shot task 즉시 fail | private subnet SG 누락 | `gcc-app-sg` (sg-0476c7a6b7af3111f) 명시 |

## Related

- ADR-0003 (bulk loader IAM), 0004 (cohort tagging), 0005 (KMA cache), 0012 (AWSV4SignerAuth)
- `docs/data-pipeline.md` (raw_data + KMA → Neptune/AOSS 전체 흐름)
- `data/load.py`, `data/loader/{cypher_bulk,bulk_neptune,opensearch_index}.py`, `data/external/run_etl.py`
- 엣지만 재적재 (Object Explorer 관계도) → `docs/runbooks/06-object-explorer-edge-reload.md`

---
*Last updated: 2026-05-14*
