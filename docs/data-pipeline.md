# 데이터 파이프라인 — raw_data + KMA → Neptune / AOSS

> raw_data (N=500 비식별 cohort) 와 KMA 기상청 데이터가 어떻게 정제·확장·적재되어
> Amazon Neptune (지식 그래프) 와 Amazon OpenSearch Serverless (AOSS) 에
> 들어가는지에 대한 운영자·기여자용 가이드.

## 0. 한 페이지 요약

```
 raw_data/*.csv (cp949)              KMA API (17 sido × N day)
   │                                   │
   ▼ data/real/*.py                    ▼ data/external/kma_weather.py
   normalize + cohort 분류              S3 raw cache → parsed NDJSON
   │                                   │
   ▼ data/synthetic/* (룩어라이크 50K + seeds 시나리오)
   │                                   │
   ▼ Pydantic schemas → NDJSON ───────┘
   │
   ├── S3 nodes/*.ndjson ──┐               ┌── data/loader/cypher_bulk.py
   │                       │               │   (openCypher MERGE UNWIND 배치)
   └── ECS one-shot task ──┴───────────────┤   → Neptune (25 클래스, ~3.2M 엣지)
       (api 이미지 재사용)                  │
                                           └── data/loader/opensearch_index.py
                                               (Nori BM25 + Cohere embed-v4 KNN)
                                               → AOSS gcc-search
```

- **소스**: `raw_data/` 9 CSV (PII 비식별, git-ignored) + KMA 17 시도 × N일
- **중간 표현**: S3 NDJSON (Neptune·AOSS·ML write-back 의 공통 ground truth)
- **그래프**: 25 클래스 / 31 관계 타입 / ~3.2M 엣지 (Customer / GasStation / FuelTransaction / Campaign / WeatherObservation …)
- **검색**: 듀얼 인덱스 (BM25 + KNN) + RRF fusion + Cohere rerank-v3
- **실행**: 로컬에서 못 닿는 private Neptune 때문에 ECS one-shot 태스크가 API 이미지 재사용

---

## 1. raw_data 정제

### 1.1 소스 자산

`raw_data/` (PII 비식별이지만 비공개 → `.gitignore` line 2):

| 파일 | 인코딩 | 내용 |
|------|--------|------|
| `file 1` 류 (8개) | cp949 | 매출/멤버십/주유소/약관/쿠폰/광고/소비지수/설문 |
| `2.캠페인마스터.csv` | utf-8 | 캠페인 메타 130 rows (M&M본부 발신 SMS 캠페인) |

join key 는 모든 파일에 등장하는 *비식별고객번호* (file 1 의 `id` 컬럼).

### 1.2 공통 어댑터 (`data/real/_common.py`)

```python
ENCODING = 'cp949'   # raw_data 9개 중 file 2(utf-8) 외 모두 cp949

def read_csv_rows(path, enc=ENCODING) -> Iterator[dict[str, str]]: ...
def normalize_cust_id(raw: str) -> str: ...
def normalize_dt(raw: str | None) -> str | None: ...      # YYYYMMDD 통일
def merge_dt_time(dt, hhmmss) -> str | None: ...          # YYYYMMDDHHMMSS
```

모든 파일별 어댑터가 이 헬퍼를 거쳐 *cp949 디코딩 → 트림 → 날짜 normalize → Pydantic
스키마(`data/schemas.py`) 인스턴스* 로 변환됩니다.

### 1.3 파일별 어댑터 (`data/real/`)

| 어댑터 | 출력 스키마 | 비고 |
|--------|-------------|------|
| `opinet_price.py` | `FuelPrice` | 주유소 가격 (오피넷 표준 코드) |
| `opinet_station.py` | `GasStation`, `Region` | 주유소 마스터 (시도·시군구·운영형태) |
| `campaign_master.py` | `Campaign` | utf-8, 130 rows |
| `consumption_index.py` | `ConsumptionIndex` | 카드 소비지수 외부 신호 |
| `coupon_fact.py` | `Campaign`, `Offer`, `Coupon`, `CouponUse` | 쿠폰 발급/사용 fact (Coupon pk=coupon_no, Offer pk=offer_cd — ADR-0022) |
| `airbridge.py` | `AppEvent` | 앱 행동 이벤트 (Energy+/보너스카드앱) |
| `survey.py` | `SurveyResponse` (라벨 `Survey`) | 설문 응답 (익명 ~25,946건 포함) |
| `term_agreement.py` | `Term`, `TermAgreement` | 약관 동의 |

### 1.4 Cohort 분류 (ADR-0004)

`data/load.py` line 85 부근:

```python
deep_history  = [...]   # 전체 데이터 있음 (매출 + 쿠폰 + 회원 + ...)
coupon_only   = [...]   # 쿠폰 fact만
sales_only    = [...]   # 매출만
```

각 고객은 `data_source = real|synthetic` 태그를 보존 — 분석 단계에서 합성/실 분리 추적.

### 1.5 합성 확장 (`data/synthetic/`)

실 N=500 cohort 만으로는 14 시나리오 통계가 의미 없으므로 룩어라이크 확장:

```python
# data/load.py
real_customers = []
for cid in deep_history:
    real_customers.append(customer.enrich_customer_attributes(cid, 'deep-history'))
for cid in coupon_only:
    real_customers.append(customer.enrich_customer_attributes(cid, 'coupon-only'))
for cid in sales_only:
    real_customers.append(customer.enrich_customer_attributes(cid, 'sales-only'))

look_customers, look_txs = lookalike.expand_to_lookalike(
    txs, target_count=args.lookalike_target,
)
pm_m_txs  = seeds.inject_pm_m_92ron_pattern(...)             # 250건
d2p_txs   = seeds.inject_diesel_to_premium_transition(...)   # 250건

all_customers = real_customers + look_customers              # 약 50K
```

**seed 주입**의 의미: 시나리오 J (외부 신호 PM+M 혼유 의심), K (디젤→고급휘발유 전환 outlier)
같은 wow 케이스가 데이터에 *실제로 존재해야* 데모에서 검출 가능.

---

## 2. KMA 기상청 정제

### 2.1 수집 (`data/external/kma_weather.py`)

```python
class KMAClient:
    def __init__(self, api_key=None): ...
    def fetch_short_forecast(self, sido: str, base_date: str, base_time='0500'): ...
    def fetch_historical(self, sido: str, date: str): ...
```

API 키는 Secrets Manager 에 저장 (`scripts/setup-kma-secret.sh`). 17 시도 × N일 루프.

### 2.2 2단계 S3 캐시 (ADR-0005) — `data/external/run_etl.py`

```python
def run(start_date: str, days=30, base_time='0500') -> int:
    s3 = boto3.client('s3')
    for date_s in date_range(start_date, days):
        for sido in SIDO_LIST:
            cache_key = f'weather/{date_s}/{sido}.json'
            try:
                s3.head_object(Bucket=S3_BUCKET, Key=cache_key)
                continue           # cache hit → skip API 호출
            except ClientError:
                pass

            raw = client.fetch_short_forecast(sido, date_s, base_time)
            s3.put_object(Bucket=S3_BUCKET, Key=cache_key,
                          Body=json.dumps(raw).encode())

            obs = items_to_observations(sido, raw['items'])
            ndjson = '\n'.join(o.model_dump_json() for o in obs)
            s3.put_object(Bucket=S3_BUCKET,
                          Key=f'nodes/weather/{date_s}-{sido}.ndjson',
                          Body=ndjson.encode())
```

**두 캐시의 역할 분리**:

| 경로 | 형태 | 용도 |
|------|------|------|
| `weather/{date}/{sido}.json` | KMA raw JSON | 재처리 소스 (parser 버그 fix 시 재사용) |
| `nodes/weather/{date}-{sido}.ndjson` | 파싱된 `WeatherObservation` | Neptune 적재 직접 입력 |

### 2.3 핵심 정제 — `_parse_pcp()` (강수량 파서)

**문제**: KMA의 PCP (강수량) / SNO (적설량) 카테고리는 *한국어 문자열* 반환.
초기 구현은 `float(val)` 직접 호출 → ValueError → except로 빠져 모든 강수 데이터 누락
→ 시나리오 N "날씨 × 연료" 가 항상 강수=0.

**Fix** (`data/external/kma_weather.py`):

```python
def _parse_pcp(val: str | None) -> float | None:
    """KMA PCP/SNO 한국어 문자열 → float mm."""
    if val is None:
        return None
    s = str(val).strip()
    if s in ('강수없음', '0'):
        return 0.0
    if s == '1mm 미만':
        return 0.5
    if s.endswith('mm 이상'):              # '50mm 이상' → 60.0
        return float(s.replace('mm 이상', '')) + 10
    if '~' in s:                            # '30~50mm' → 40.0 midpoint
        lo, hi = s.replace('mm', '').split('~')
        return (float(lo) + float(hi)) / 2
    try:
        return float(s.replace('mm', '').strip())
    except ValueError:
        return None
```

### 2.4 재처리 모드 (`reprocess_from_cache`)

parser 버그 수정 후 KMA API 호출 없이 S3 raw cache 만으로 NDJSON 재생성:

```python
def reprocess_from_cache() -> int:
    s3 = boto3.client('s3')
    for page in paginator.paginate(Bucket=S3_BUCKET, Prefix='weather/'):
        for obj in page.get('Contents', []):
            raw = s3.get_object(Bucket=S3_BUCKET, Key=obj['Key'])['Body'].read()
            # ... new parser ...
            s3.put_object(Bucket=S3_BUCKET, Key=out_key, Body=ndjson.encode())
```

> 실제로 PCP 버그 발견 후 이 모드 한 번으로 1275일치 강수 데이터를 재처리 → Neptune
> 재적재까지 합쳐 30분 이내 fix 완료. API 비용 0.

---

## 3. Neptune 적재 (`data/loader/cypher_bulk.py`)

> ⚠ 과거의 `data/load_graph.py` (NODE_FILES 매니페스트) 는 mfg 잔재로 **제거됨** (ADR-0021).
> live 적재는 `data/loader/cypher_bulk.py` 이며 `data/load.py` (`--neptune` / `--edges`) 가 호출한다.

### 3.1 S3 prefix → (라벨, pk_field) 매핑

```python
# data/loader/cypher_bulk.py: NODE_MAP — (s3 prefix, Neptune 라벨, MERGE pk_field)
NODE_MAP = [
    ('nodes/customer/',             'Customer',            'cust_id'),
    ('nodes/transaction/',          'FuelTransaction',     'tx_id'),
    ('nodes/gas_station/',          'GasStation',          'opinet_no'),
    ('nodes/region/',               'Region',              'region_cd'),
    ('nodes/campaign/',             'Campaign',            'campaign_cd'),
    ('nodes/offer/',                'Offer',               'offer_cd'),    # ADR-0022 (was offer_id)
    ('nodes/coupon/',               'Coupon',              'coupon_no'),   # ADR-0022 (was coupon_id)
    ('nodes/coupon_use/',           'CouponUse',           'use_id'),
    ('nodes/fuel_price/',           'FuelPrice',           'price_id'),    # 합성 opinet-dt-grade
    ('nodes/weather/',              'WeatherObservation',  'weather_id'),  # 합성 sido-dt-hour
    ('nodes/campaign_sms/',         'CampaignSMS',         'sms_id'),
    ('nodes/campaign_aggregation/', 'CampaignAggregation', 'agg_id'),
    # … 총 25 클래스 (member/persona/cluster/segment/term/term_agreement/app_event/survey/timeslot/fuel_product …)
]
```

**pk 정렬 불변식 (ADR-0022)**: 각 라벨의 `pk_field` 는 그 노드를 가리키는 모든 엣지의 match-field
와 동일해야 한다. 어긋나면 엣지가 *다른 키의 orphan 스텁* 에 붙어 Object Explorer 관계도가 빈다.
`tests/data/test_cypher_bulk_alignment.py` 가 이 불변식을 강제.

### 3.2 노드 MERGE (idempotent)

```python
# data/loader/cypher_bulk.py:_flush_batch — pk_field 기준 UNWIND MERGE
query = f"UNWIND $rows AS r MERGE (n:{label} {{{pk_field}: r.{pk_field}}}) SET n += r"
```

배치 UNWIND 패턴 (라벨별 `pk_field`):

```cypher
UNWIND $rows AS r
MERGE (n:Customer {cust_id: r.cust_id})
SET n += r
```

- 500행 단위
- 재실행 안전 (no-op on match)
- `parameters={"rows": [...]}` 키워드 전달 — *f-string 으로 user input interpolate 금지*

### 3.3 엣지 MERGE (`EDGE_MAP` + `_build_edge_query`)

```cypher
UNWIND $pairs AS p
MERGE (a:Customer        {cust_id: p.s})
MERGE (b:FuelTransaction {tx_id:   p.t})
MERGE (a)-[:REFUELED]->(b)
```

- 31 관계 타입 (`EDGE_MAP`). `data/load.py --edges` 가 `load_all_edges()` 로 일괄 적재 (멱등, uncapped).
- **MERGE-MERGE 엔드포인트** — MATCH-MATCH 는 양쪽 큰 라벨 엣지(REFUELED/PRICED_AT/TO)에서 t4g.medium OOM (ADR-0022).
- 노드 선적재 전제. match-field 값에 노드가 없으면 *orphan 스텁* 생성 — pk 정렬(NODE_MAP)로
  systemic 케이스 제거, 합성 store_cd 같은 잔여 orphan 은 리스트 필터로 숨김 (ADR-0022, Runbook 06).

**Cypher 내 문자열 조합 금지 사례**: Neptune openCypher는
```cypher
MATCH (c:Cluster {id: 'cl-' + toString(r.cluster + 1)})  -- 거부
```
를 거부. Python에서 사전 계산:
```python
row['cluster_id'] = f'cl-{int(a["cluster"]) + 1}'
```

### 3.4 ML 기반 엣지 — 별도 ECS one-shot

| 엣지 | 출처 | 처리 |
|------|------|------|
| `BELONGS_TO` (Customer → Cluster) | `api/services/cluster_pipeline.py` | KMeans 6 + **StandardScaler** (6 feature: tx, amt, prem_ratio, vip 0/1, grade 1-3, sido 1-8). amt가 millions 단위라 미스케일 시 cluster 1개로 몰림. |
| `HAS_PERSONA` (Customer → Persona) | `api/services/persona_writeback.py` | hash mod 5 분포 + VIP→crm, 100+ tx→marketing 우선. 약 10K씩 균등. |
| `IN_SEGMENT` (Customer → Segment) | `api/services/persona_writeback.py:write_back_segments_from_clusters` | cluster→segment 파생. 시나리오 D/E 노출 |

ECS run-task 호출 (API 이미지 재사용, command override):

```bash
aws ecs run-task --cluster ontology-gcc-dev-cluster \
  --task-definition ontology-gcc-dev-api \
  --overrides '{"containerOverrides":[{
    "name":"api",
    "command":["python","-m","data.load","--neptune","--edges"]
  }]}'
```

---

## 4. AOSS 적재 (`data/load_search.py` + `data/loader/opensearch_index.py`)

### 4.1 인덱스 매핑

```python
def build_index_mapping(*, embedding_dim: int = 1024) -> dict:
    return {
        "settings": {"index": {"knn": True}},
        "mappings": {
            "properties": {
                "id":         {"type": "keyword"},
                "label":      {"type": "keyword"},
                "name":       {"type": "text", "analyzer": "nori"},
                "category":   {"type": "keyword"},
                "text":       {"type": "text", "analyzer": "nori"},
                "standards":  {"type": "keyword"},
                "embedding":  {"type": "knn_vector",
                               "dimension": embedding_dim,
                               "method": {"name": "hnsw", "space_type": "cosinesimil"}},
            }
        }
    }
```

핵심:
- `index.knn = true` 활성화 (없으면 KNN 쿼리가 403)
- `nori` 한국어 형태소 분석기 — `name` + `text` 양쪽
- `embedding` 1024차원 Cohere embed-v4
- `space_type = cosinesimil` — Cohere 임베딩이 cosine으로 학습됨

### 4.2 문서 형태

```python
def document_for_component(comp: dict) -> dict:
    return {
        "id":        comp["id"],
        "label":     comp["label"],
        "name":      comp.get("name_kr") or comp["id"],
        "category":  comp.get("category", ""),
        "text":      " ".join([...]),  # BM25 색인 대상
        "standards": comp.get("standards", []),
        # embedding은 2-패스로 채움
    }
```

### 4.3 2-패스 색인

**Pass 1 — BM25 only (빠른 초기 시드)**:
```python
for doc in docs:
    client.index(index=INDEX_NAME, body=doc)   # embedding 없음
```

**Pass 2 — embedding 채우기 (KNN 활성)**:
```python
for doc in docs:
    doc['embedding'] = bedrock_embed(doc['text'])   # Cohere embed-v4
    client.index(index=INDEX_NAME, body=doc)
```

API 비용 분산 + 첫 데모는 BM25 만으로도 동작.

### 4.4 AOSS 특수 제약

- **doc ID 지정 불가**: `client.index(index=..., id=...)` 가 거부. 본문 안에 `id` 필드 박아 넣고, BM25/KNN hit 의 `_source.id` 로 fusion key 사용.
- **`refresh=true` 미지원**: 색인 직후 검색 시 stale → eventual consistency. 대량 색인 후 30초 대기 권장.
- **인증**: `AWSV4SignerAuth` (opensearch-py 2.0+) — refreshable creds 로 ECS Fargate 6h credential rotation 자동 대응. `AWS4Auth` + `get_frozen_credentials()` 패턴은 16시간 uptime 후 403 (실제 발생, v1.0.54에서 fix).

---

## 5. 운영 — Neptune 재적재

private subnet 의 Neptune은 dev EC2 / 로컬에서 직접 못 닿음. 두 가지 방법:

### 5.1 ECS one-shot (권장)

```bash
aws ecs run-task --cluster ontology-gcc-dev-cluster \
  --task-definition ontology-gcc-dev-api \
  --region ap-northeast-2 \
  --network-configuration 'awsvpcConfiguration={subnets=["..."],securityGroups=["..."]}' \
  --overrides '{"containerOverrides":[{
    "name":"api",
    "command":["python","-m","data.load","--neptune","--opensearch","--weather","--edges"]
  }]}'
```

API 이미지를 재사용 — 별도 loader 이미지 빌드 불필요.

### 5.2 KMA 부분 재처리

parser 만 fix 한 경우:

```bash
aws ecs run-task ... --overrides '{"containerOverrides":[{
  "name":"api",
  "command":["python","-m","data.external.run_etl","--reprocess"]
}]}'
```

cached raw JSON 만 다시 파싱 → 새 NDJSON 작성 → Neptune Weather 노드 MERGE.

---

## 6. 인덱스 / 그래프 무결성 검증

### 6.1 빠른 sanity check

```bash
# Neptune 노드 개수
aws neptune-data execute-open-cypher-query \
  --open-cypher-query 'MATCH (n) RETURN labels(n)[0] AS label, count(*) AS cnt ORDER BY cnt DESC'

# AOSS 문서 개수
curl -X POST "$OPENSEARCH_ENDPOINT/$INDEX/_count" \
  -H 'Content-Type: application/json' --aws-sigv4 'aws:amz:ap-northeast-2:aoss'
```

기대 수치 (full edge load 후 — 실측 Neptune 카운트, `_count_edges_by_type`):
- 노드: Customer 50K, FuelTransaction ~556K, WeatherObservation 1,275, Coupon ~1.1K (coupon_no de-collapse)
- 엣지 ~3.19M 총합: PRICED_AT 1.27M · AT 557K · REFUELED 556K · AT_TIME 428K · USED_APP 122K ·
  IS_MEMBER 50.5K · HAS_PERSONA 49.5K · SENT_SMS 34K · TO 34K · BELONGS_TO/IN_SEGMENT 4K · AGGREGATED_AS 137
- AOSS `gcc-search` index ~5K (검색 대상 도메인 노드)
- 검증: `python3 scripts/probe_object_edges.py` — 정적 카탈로그(payment/fuel_product/channel) 외 전 타입 관계도 표시

### 6.2 wow-query eval (CI 게이트)

```bash
python scripts/eval_wow_queries.py --cf-domain gcc.whchoi.net
# Exits 1 if pass rate < 85%
```

30 쿼리 (시나리오 A search + B chat) 가 80%+ 패스해야 데이터 무결성 OK.

---

## 7. 관련 ADR

| ADR | 결정 |
|-----|------|
| 0001 | retail VPC 임포트 (Neptune subnet 재사용) |
| 0003 | bulk loader IAM prep (ECS one-shot 태스크가 Neptune·OpenSearch·Bedrock·S3 접근) |
| 0004 | cohort data depth tagging (real / synthetic 추적) |
| 0005 | KMA API 2단계 캐시 + reprocess 모드 |
| 0006 | TOOL_SPECS 단일 등록점 (semantic_search·weather_join 등이 이 데이터를 사용) |
| 0020 | schema.ttl 을 data/schemas.py 에서 생성 (`ontology/generate_schema_ttl.py`) |
| 0021 | pre-pivot mfg 잔재 18 파일 제거 (load_graph.py·data/public 등) |
| 0022 | Object Explorer 엣지 키 정렬 (NODE_MAP pk ↔ edge match-field) + 엣지 재적재 (Runbook 06) |

---

## 8. 자주 막히는 부분 (Gotchas)

1. **cp949 BOM 없음** — `open(f, encoding='cp949')` 으로 직접. utf-8-sig 시도하지 말 것.
2. **비식별고객번호 trailing space** — `strip()` 안 하면 join 실패. `_common.py:normalize_cust_id` 가 처리.
3. **KMA 날짜 포맷** — `YYYYMMDD` (대시 없음). `normalize_dt` 가 `-` 제거 후 `[:8]`.
4. **Neptune openCypher 의 string concat 제한** — `MATCH (c:Cluster {id: 'cl-' + ...})` 는 거부됨. Python 사전 계산 필수.
5. **AOSS 색인 직후 검색 stale** — 30초 대기 또는 `_refresh` (Serverless에선 직접 못 함, 시간만이 해결).
6. **AWSV4SignerAuth 누락** — `AWS4Auth` + `get_frozen_credentials()` 패턴이 ECS Fargate 6h credential rotation 후 403. opensearch.py + ops_resources.py + spec_match.py 가 사용하는 search.py 에서 모두 `AWSV4SignerAuth` 로 갱신됨.
7. **PCP/SNO 한국어 문자열** — `_parse_pcp` 거치지 않으면 강수 항상 0.
8. **NDJSON 의 None 값** — Pydantic `model_dump_json(exclude_none=True)` 권장 — Neptune `SET n += {k: null}` 이 의도와 다르게 동작.

---

*Last updated: 2026-06-09. 새 외부 소스 추가 시: `data/external/` 어댑터 + `data/schemas.py` 스키마 + `data/loader/cypher_bulk.py` NODE_MAP/EDGE_MAP + 이 문서 §1-3 갱신. 엣지 재적재는 Runbook 06.*
