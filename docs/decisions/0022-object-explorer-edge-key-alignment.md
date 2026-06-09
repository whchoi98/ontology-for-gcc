# ADR 0022 — Object Explorer 관계도 복구: 노드 pk ↔ 엣지 match-field 정렬

- Status: Accepted
- Date: 2026-06-09
- Deciders: 개발팀
- Tags: ontology, loader, neptune, bugfix
- Related: [ADR-0020](0020-schema-ttl-generated-from-pydantic-ssot.md), [Runbook 06](../runbooks/06-object-explorer-edge-reload.md)

## Context

객체 탐색(`/objects/{type}`)에서 다수 클래스의 1-hop 관계 그래프가 비어 있었다. 라이브 API
4-차원 조사(타입별 프로빙 + 로더 추적)로 확인된 사실:

- 증상은 "속성 1개"가 아니라 **`detail.subgraph.edges == 0`** (노드 1개=객체 자신만 표시). 속성은 정상.
- detail 은 `MATCH (n:{label} {{{id_prop}: $oid}})-[r]-(m)` 로 이웃을 찾는다. 즉 매칭된 *full 노드*에
  엣지가 실제로 붙어 있어야 보인다.
- 로더(`data/loader/cypher_bulk.py`)의 `_scan_pk_values` 폴백이 자연키 없는 노드에 **잘못된 합성 pk**를
  부여: `Offer.offer_id = campaign_cd`, `Coupon.coupon_id = campaign_cd` (스캔 순서상 campaign_cd 우선).
  이 때문에 distinct offer/coupon 이 campaign_cd 하나로 붕괴되고, 엣지(HAS_OFFER/ISSUES/OF/REDEEMED_AS)는
  자연키(`offer_cd`/`coupon_no`)로 MATCH/MERGE 되어 **다른 키의 노드(또는 orphan)**에 붙었다.
- 엣지 적재기 `_flush_edge_batch` 가 `MERGE (a) MERGE (b)` 로 엔드포인트를 만들어, match-field 값에 해당하는
  노드가 없으면 **orphan 스텁**(속성 1개)을 생성 → full 노드는 엣지 0. (synthetic `store_cd` → GasStation
  `site_cd` 도 동일.)
- 추가로 campaign·coupon·weather·timeslot·fuel_price 엣지군은 라이브 그래프에 **아예 미적재**였고,
  fuel_price PRICED_AT 의 target match-field(`station_opinet_no`)가 FuelPrice MERGE pk(`price_id`=합성
  composite)와 불일치했다. (persona/cluster/segment 는 Plan-5 write-back 서비스가 MATCH-MATCH-on-pk 로
  적재 — orphan 없는 gold standard.)

## Decision

노드 MERGE pk 와 그 노드를 가리키는 모든 엣지 match-field 를 **항상 동일 키로 정렬**한다.

- `NODE_MAP`: Offer pk `offer_id → offer_cd`, Coupon pk `coupon_id → coupon_no` (자연키).
- `api/routers/objects.py:_TYPE_REGISTRY`: offer/coupon `id_prop` 를 동일하게 `offer_cd`/`coupon_no` 로 정렬
  (detail anchor 가 새 pk 로 노드를 찾도록).
- PRICED_AT EdgeSpec: transform 으로 `price_id`(=`opinet-dt-grade`) 를 target 으로 생성, `target_match_field='price_id'`.
- `_flush_edge_batch`: 엔드포인트를 **MERGE → MATCH** 로 변경(`_build_edge_query`). orphan 스텁을 만들지 않고,
  미존재 쌍은 조용히 skip. relationship 만 MERGE. (Plan-5 write-back 과 동일 패턴.)
- 회귀 방지: `tests/data/test_cypher_bulk_alignment.py` 가 정렬 불변식을 강제.
- 재적재 절차는 [Runbook 06](../runbooks/06-object-explorer-edge-reload.md).

## Alternatives Considered

- **Object Explorer detail 를 orphan/대체키로도 매칭하게 수정** — 데이터 모델의 키 불일치를 쿼리로 숨기는 증상치료.
  여러 노드(full+orphan) 중복 표시. 기각.
- **MERGE-MERGE 유지 + 키만 정렬** — offer/coupon/fuel_price orphan 은 해결되나 synthetic store_cd 등
  미존재-타겟 orphan 은 계속 생성. 부분 해결이라 기각.
- **Do nothing** — 관계도가 데모의 핵심(온톨로지 시각화)인데 비어 있음. 기각.

## Consequences

### Positive

- 엣지가 detail 이 조회하는 full 노드에 정확히 붙어 관계도가 표시됨.
- orphan 스텁 박멸(엔드포인트 MATCH) — 리스트에 유령 노드 미노출.
- offer/coupon 붕괴 해소(자연키 pk) — distinct 객체 보존.
- 키 정렬 불변식이 테스트로 고정 — 신규 클래스/엣지에서 같은 버그 재발 차단.

### Negative

- **재적재 필요** (코드만으론 라이브 그래프가 안 바뀜). offer/coupon 노드 re-key + 누락 엣지군 적재 (Runbook 06).
- `time_slot` `weekend` 슬롯은 `_ts_to_slot_id` 가 요일 미반영이라 엣지 0 유지 — 의도된 공백(후속 개선 대상).
- `coupon_no` 과학표기 손상(`7.01437E+11`)은 상류 CSV(Excel float 강제) 문제로 정밀도 복구 불가 — 엣지
  표시는 정상화되나 distinct coupon 붕괴는 별도 데이터 품질 과제로 남김.

### Neutral

- MATCH-MATCH 는 노드 선적재를 전제(main() 노드 → --edges 순서). 멱등.
- `payment_method/fuel_product/channel` 은 정적 카탈로그라 관계 그래프 없음(설계상 정상).

## Implementation Notes

- Files: `data/loader/cypher_bulk.py` (NODE_MAP, `_build_edge_query`, PRICED_AT transform),
  `api/routers/objects.py` (offer/coupon id_prop), `tests/data/test_cypher_bulk_alignment.py` (신규),
  `scripts/probe_object_edges.py` (검증 도구, 신규), `docs/runbooks/06-object-explorer-edge-reload.md` (신규).
- 검증: 재적재 전후 `python3 scripts/probe_object_edges.py` 비교. 코드: `pytest tests/data/test_cypher_bulk_alignment.py`.
- Rollback: 코드 revert 가능하나 재적재된 엣지는 그래프에 남음(무해).

## References

- 진단 워크플로우: object-explorer-zero-edges-rootcause (6 에이전트, 타입별 root-cause 분류)
- gold standard: `api/services/persona_writeback.py` (MATCH-MATCH-on-pk write-back)
