# Runbook 06 — Object Explorer 관계도 복구 (엣지 재적재)

> 객체 탐색에서 일부 클래스의 1-hop 관계 그래프가 비어 있을 때 (ADR-0022).
> 근본원인: ① offer/coupon 노드가 잘못된 합성 pk(=campaign_cd)로 MERGE되어 엣지가
> 다른 키의 orphan에 붙음, ② campaign·coupon·weather·timeslot·fuel_price 엣지군이
> 라이브 그래프에 아예 미적재. 코드 수정(ADR-0022)은 이미 머지됨 — 이 runbook은
> **재적재**만 다룬다. Runbook 05(일반 재적재)의 pre-flight를 먼저 충족할 것.

## When to run

- `scripts/probe_object_edges.py` 가 정적 카탈로그(payment_method/fuel_product/channel)
  외의 타입에서 `NO EDGES` 를 보고할 때.
- ADR-0022 로더 수정(`data/loader/cypher_bulk.py`)이 포함된 이미지 배포 직후.

⚠ private subnet — 로컬/VPN에서 Neptune 직접 접근 불가. 모든 단계는 **ECS one-shot task**
(`ontology-gcc-dev-api` task-def, API 이미지 재사용, command override).
⚠ PRICED_AT 는 ~1.27M 엣지 — 수십 분 소요. 데모 시간 회피.

## Pre-flight

- [ ] ADR-0022 코드가 포함된 새 API 이미지 빌드·푸시·배포 완료 (`docs/runbooks/01`).
- [ ] baseline 기록: `python3 scripts/probe_object_edges.py --sample 10 > /tmp/before.txt`
- [ ] `NEPTUNE_ENDPOINT`, `SYNTHETIC_DATA_BUCKET` 가 task-def env 에 설정됨.

공통 ECS 실행 헬퍼 (command 만 바꿔 재사용):

```bash
run() { aws ecs run-task --cluster ontology-gcc-dev-cluster \
  --task-definition ontology-gcc-dev-api \
  --overrides "{\"containerOverrides\":[{\"name\":\"api\",\"command\":$1}]}"; }
```

## Step 1 — offer/coupon 노드 재키잉 (re-key)

기존 Offer/Coupon 노드는 `offer_id`/`coupon_id`(=campaign_cd)로 MERGE되어 붕괴된 상태.
새 pk(`offer_cd`/`coupon_no`)로 깨끗하게 다시 적재하려면 먼저 삭제한다 (각 137/83개, 소량).

```bash
# 1a. 잘못 키잉된 Offer/Coupon 노드 제거 (엣지 포함 DETACH DELETE)
run '["python","-c","from data.loader.cypher_bulk import _post_cypher; _post_cypher(\"MATCH (n:Offer) DETACH DELETE n\",{}); _post_cypher(\"MATCH (n:Coupon) DETACH DELETE n\",{}); print(\"deleted Offer+Coupon\")"]'

# 1b. 올바른 pk(offer_cd / coupon_no)로 노드 재적재
run '["python","-c","import boto3; from data.loader.cypher_bulk import load_label; s3=boto3.client(\"s3\"); load_label(s3,\"nodes/offer/\",\"Offer\",\"offer_cd\"); load_label(s3,\"nodes/coupon/\",\"Coupon\",\"coupon_no\")"]'
```

## Step 2 — 누락 엣지군 적재

코드 수정으로 엔드포인트가 MATCH-MATCH(=orphan 미생성, 노드 pk 정렬)이므로, 누락된
엣지 타입만 필터로 적재한다. PRICED_AT 제외 버전을 먼저 돌려 빠르게 검증 후 PRICED_AT.

```bash
# 2a. 마케팅·쿠폰·날씨·시간대 엣지 (가벼움)
run '["python","-c","from data.loader.cypher_bulk import load_all_edges; load_all_edges(edge_filter={\"HAS_OFFER\",\"ISSUES\",\"OF_COUPON\",\"REDEEMED_AS\",\"SENT_SMS\",\"TO\",\"AGGREGATED_AS\",\"TARGETS_PERSONA\",\"USED\",\"OBSERVED_WEATHER\",\"AT_TIME\",\"AT_TIME_WEATHER\"})"]'

# 2b. PRICED_AT (무거움 ~1.27M; 별도 실행)
run '["python","-c","from data.loader.cypher_bulk import load_all_edges; load_all_edges(edge_filter={\"PRICED_AT\"})"]'
```

## Step 3 — (선택) coverage 보강 — app_event / fuel_transaction

라이브 적재가 USED_APP(50K cap)·REFUELED/AT(150K cap)로 제한돼 최신 노드가 엣지 없이
노출됨. `data.load --edges` 진입점은 **무제한**(`load_all_edges()` no-limit)이므로 전량 재적재로
커버리지를 메운다 (REFUELED 556K 등 — 수십 분).

```bash
run '["python","-m","data.load","--edges"]'   # 31개 엣지군 전량 (uncapped, 멱등)
```

## Step 4 — 검증

```bash
# Neptune 엣지 타입별 카운트
run '["python","-c","from data.loader.cypher_bulk import _count_edges_by_type; print(_count_edges_by_type())"]'

# API 레벨 — 재적재 후 NO EDGES 가 정적 카탈로그 3종만 남아야 함
python3 scripts/probe_object_edges.py --sample 10 > /tmp/after.txt
diff /tmp/before.txt /tmp/after.txt
```

✅ 성공 기준: `coupon, offer, campaign, campaign_sms, campaign_aggregation, coupon_use,
fuel_price, weather_observation, time_slot` 가 `ok`. `app_event` 는 Step 3 후 `ok`.
`payment_method / fuel_product / channel` 은 정적 카탈로그라 `NO EDGES` 유지(정상).

## Rollback / 주의

- Step 1 의 DETACH DELETE 는 Offer/Coupon 노드 한정. 다른 라벨 영향 없음.
- 재적재는 멱등(MERGE) — 중복 실행 안전. 단 Step 1a 삭제는 Step 1b 재적재와 항상 쌍으로.
- `time_slot` 의 `weekend` 슬롯은 `_ts_to_slot_id` 가 요일을 보지 않아 엣지 0 유지 — 의도된
  공백 (별도 개선: 요일 기반 weekend 버킷팅, ADR-0022 §Negative).
- `coupon_no` 의 과학표기 손상(`7.01437E+11`)은 상류 CSV 문제로 정밀도 복구 불가 — 엣지
  표시는 정상화되나 distinct coupon 붕괴는 남음 (별도 데이터 품질 과제).
```
