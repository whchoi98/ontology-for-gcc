# data/ — Synthetic 데이터 생성 + 로더

> Neptune + OpenSearch + Bedrock KB 동시 적재. API 이미지를 재사용해 ECS one-shot 으로 실행.

## 모듈 역할

- **데이터 생성**: 50K 고객 / 8.5K 주유소 / 139K 거래 / 50K 멤버 / 4.5K 클러스터 멤버십 / 49.5K 페르소나 매핑.
- **데이터 적재**: Neptune (openCypher batched MERGE) + OpenSearch (bulk index) + Cohere 임베딩 사전 계산.
- **외부 신호**: KMA 기상청 단기·과거 관측 → S3 NDJSON 캐시 → Neptune Weather 노드.

## 디렉토리 지도

```
data/
├── load.py                CLI 진입점 (--neptune --opensearch --from-s3 --kma)
├── schemas.py             Pydantic 노드/엣지 스키마 SSoT (25 클래스 + 31 관계)
├── synthetic/             합성 generator (cohort/persona/cluster/...)
├── real/                  N=500 PII-마스킹 실데이터 어댑터 (opinet_codes.yaml 소비)
├── external/              KMA 등 외부 API 어댑터
├── loader/                live Neptune/OpenSearch 로더 — cypher_bulk·bulk_neptune·opensearch_index
└── output/                생성된 JSON/NDJSON (S3 sync 대상)
```

## 핵심 컨벤션

- **Neptune MERGE 패턴**:
  ```cypher
  UNWIND $rows AS r
  MERGE (n:Customer {id: r.id})
    ON CREATE SET n += r.props
    ON MATCH  SET n += r.props
  ```
  500 행 단위 배치. `parameters={"rows": [...]}` 키워드 전달.
- **Cypher 안에서 문자열 조합 금지**: `'cl-' + toString(r.cluster + 1)` 같은 식 Neptune openCypher가 거부 케이스 있음 → Python에서 `f'cl-{int(a["cluster"]) + 1}'` 로 사전 계산 후 전달.
- **에지 MERGE는 양쪽 노드 키 보장 후**: 부모 노드가 없으면 MERGE 가 새 stub 노드를 만들 수 있음 — 적재 순서 강제.
- **S3 캐시**: KMA / Cohere 임베딩은 S3 NDJSON 라이트 후 재실행 시 `--from-s3` 로 재처리.

## 적재 실행

```bash
# 로컬 / VPN으로 못 닿음 → ECS one-shot
aws ecs run-task \
  --cluster ontology-gcc-dev-cluster \
  --task-definition ontology-gcc-dev-api \
  --overrides '{"containerOverrides":[{
    "name":"api",
    "command":["python","-m","data.load","--neptune","--opensearch","--from-s3"]
  }]}'
```

같은 API 이미지를 사용 — Dockerfile 이 단일. 컨테이너 명령만 override.

## 데이터 신뢰성 패턴

- **고객별 cohort 태그** (ADR-0004): `data_source ∈ {real, synthetic}`. 실데이터(N=500)는 raw_data 추출 후 비식별처리.
- **persona 분포** : hash mod 5 라운드로빈 (VIP→crm, 100+ tx→marketing 우선). 약 10K 씩 균일 분포.
- **cluster 균형** : KMeans 6 + StandardScaler. amt(원) 단위 스케일링 안 하면 한 cluster에 몰림.

## 새 클래스 추가 (Auto-Sync Rules 발췌)

1. `data/schemas.py` 에 Pydantic 모델 (+ `ALL_CLASSES`/`ALL_RELATIONS` 등록) → `python -m ontology.generate_schema_ttl` 로 `schema.ttl` 재생성.
2. `data/synthetic/` 또는 `data/real/` 에 generator/adapter.
3. `data/loader/cypher_bulk.py` (+ `bulk_neptune.py`) 의 노드 / 엣지 적재 단계에 추가.
4. `api/routers/objects.py` 의 `_TYPE_REGISTRY` + `api/routers/ontology.py` `_CLASSES`.
5. `web/components/Sidebar.tsx` 객체 탐색 + `web/app/objects/[type]/page.tsx` `TYPE_META`.
