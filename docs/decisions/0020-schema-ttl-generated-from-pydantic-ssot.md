# ADR 0020 — schema.ttl 을 data/schemas.py 에서 생성 (retail/mfg → GCC 도메인 전환)

- Status: Accepted
- Date: 2026-06-09
- Deciders: 개발팀
- Tags: ontology, codegen, drift-prevention

## Context

온톨로지가 세 곳에 중복 표현돼 있었다:

1. `data/schemas.py` — Pydantic `ALL_CLASSES` (25) + `ALL_RELATIONS` (31). 모든 generator·loader·`api/services/ontology_meta.py` 가 import 하고 `assert len(ALL_CLASSES)==25` / `>=30` 가 걸린 **사실상의 SSoT**.
2. `ontology/classes/*.yaml` + `ontology/relations/edges.yaml` — 사람용 카탈로그 (이미 GCC 로 정합).
3. `ontology/schema.ttl` — Neptune 에 `ontology/upload.py` 가 SPARQL UPDATE 로 업로드하는 OWL/RDF.

문제: `schema.ttl` 만 retail/mfg 참조 PoC 의 잔재 (22 클래스 — `Product`, `Module`, `Supplier`, `EightDReport`, `CarbonScope` …) 로 남아 있었다. openCypher property-graph 적재는 TTL 을 강제하지 않아 데모는 안 깨졌지만, **schema.ttl 을 읽는 경로 (Neptune SPARQL, KB 인덱싱, 온톨로지 메타) 는 엉뚱한 도메인을 진실로 선언**하고 있었다. 또한 손으로 유지하는 세 번째 표현은 클래스 추가 시 드리프트 원천이었다.

## Decision

`ontology/schema.ttl` 을 손으로 유지하지 않고 **`data/schemas.py` (SSoT) 에서 결정적으로 생성**한다. `ontology/generate_schema_ttl.py` 가 Pydantic introspection 으로 25 `owl:Class` + 필드별 `owl:DatatypeProperty` (xsd 매핑) 를, `ALL_RELATIONS` 로 31 `owl:ObjectProperty` (domain/range) 를 렌더한다. 출력은 SSoT 의 순수 함수 (타임스탬프·난수 없음) 라 재생성이 byte-identical 이며, `--check` freshness 게이트와 `tests/ontology/test_schema_ttl.py::test_schema_is_fresh` 가 SSoT 변경 후 재생성 누락을 CI 에서 차단한다.

## Alternatives Considered

- **schema.ttl 을 손으로 GCC 25 클래스로 재작성** — 세 번째 수기 표현이 그대로 남아 다음 클래스 추가 때 또 드리프트. 기각.
- **YAML 카탈로그 (`ontology/classes/*.yaml`) 에서 생성** — YAML 은 "사람용 카탈로그" 라 라이브 시스템이 쓰는 `data/schemas.py` 와 다시 어긋날 수 있음. 생성 입력은 라이브 SSoT 여야 함. 기각.
- **schema.ttl 폐기 (openCypher 만 사용)** — SPARQL·KB 인덱싱 경로가 informative 스키마를 참조하므로 완전 폐기는 기능 축소. 기각.
- **Do nothing** — 잘못된 제조 스키마가 계속 Neptune 에 업로드됨. 기각.

## Consequences

### Positive

- schema.ttl ≡ data/schemas.py 가 테스트로 보장 — 드리프트 구조적 불가능.
- 제조 잔재 (22 mfg 클래스) 제거, GCC 25 클래스로 정합.
- DatatypeProperty 146 개 추가로 SPARQL/KB 에 필드 수준 스키마 제공 (이전 TTL 에는 없었음).
- 재사용 edge 라벨 (`OF` ×2, `AT_TIME` ×2) 을 `gcc:{source}_{edge}_{target}` 고유 IRI 로 분리 — OWL domain/range 충돌 방지.

### Negative

- generator 가 `data.schemas` import 에 의존 (pydantic 필요) — 단 `ontology_meta.py` 가 이미 동일 의존.
- 클래스/관계 변경 시 `python -m ontology.generate_schema_ttl` 재실행 필수 (미실행 시 CI red).

### Neutral

- `ci.yml` 의 `compileall` 대상에 `ontology/` 추가 (generator AST 검증).
- TTL 의 `gcc:` 네임스페이스 IRI 는 레거시와 동일 유지 — 기존 SPARQL prefix 호환.

## Implementation Notes

- Files touched: `ontology/generate_schema_ttl.py` (신규), `ontology/schema.ttl` (재생성), `tests/ontology/test_schema_ttl.py` (드리프트-proof 로 강화), `.github/workflows/ci.yml` (compileall 에 ontology 추가).
- 재생성: `python -m ontology.generate_schema_ttl`. 검증: `python -m ontology.generate_schema_ttl --check`.
- Rollback: generator 삭제 + `git checkout` 으로 이전 schema.ttl 복원. 단 이전 버전은 mfg 도메인이므로 권장하지 않음.

## References

- SSoT: `data/schemas.py` (`ALL_CLASSES`, `ALL_RELATIONS`)
- 관련: ADR-0013 (mfg 템플릿 디커플링), ADR-0007 (persona registry SSoT 패턴)
