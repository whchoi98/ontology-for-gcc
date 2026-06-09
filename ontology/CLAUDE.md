# ontology/ — 온톨로지 정의·표준 매핑

> GCC 고객 온톨로지의 **사람용 카탈로그**(YAML) + 외부 표준 코드 + Neptune 업로드용 OWL/RDF.
> 단일 진실원(SSoT)은 `data/schemas.py` 이며, 이 디렉토리의 `schema.ttl` 은 거기서 **생성**된다.

## 모듈 역할

- **클래스/관계 카탈로그**: `classes/*.yaml` (25 클래스), `relations/edges.yaml` (31 관계) — `data/schemas.py` 와 정합되는 사람용 표현.
- **표준 코드 사전**: `standards/opinet_codes.yaml` (오피넷 유종·브랜드·시도 코드). 소비자는 `data/real/opinet_price.py`·`opinet_station.py`·`transaction.py` 와 `api/services/ontology_meta.py`.
- **raw→온톨로지 매핑**: `mappings/raw_to_ontology.csv` — raw_data xlsx 컬럼 → GCC 클래스/필드 매핑 (변환 노트 포함).
- **Neptune 업로드 스키마**: `schema.ttl` (OWL/RDF) — `upload.py` 가 SPARQL UPDATE 로 적재. openCypher 적재는 강제하지 않는 informative 스키마.

## 디렉토리 지도

```
ontology/
├── classes/                25 per-class YAML (Customer, FuelTransaction, GasStation, …)
├── relations/
│   └── edges.yaml          31 엣지 (source/edge/target)
├── standards/
│   └── opinet_codes.yaml   오피넷 표준: gass_trdm 브랜드 / fuel_grade / sido / self·yn 플래그
├── mappings/
│   └── raw_to_ontology.csv raw_data 컬럼 → 온톨로지 속성 매핑
├── generate_schema_ttl.py  schema.ttl 생성기 (data/schemas.py → OWL/RDF)
├── schema.ttl              ★ 생성물 — 손으로 편집 금지
└── upload.py               schema.ttl → Neptune SPARQL UPDATE 업로더
```

## schema.ttl 은 생성물 (★ 중요)

`schema.ttl` 은 **`data/schemas.py` (`ALL_CLASSES` + `ALL_RELATIONS`) 에서 결정적으로 생성**된다. 손으로 편집하지 말 것 — 세 번째 수기 표현이 생기면 드리프트한다 (ADR-0020, retail/mfg → GCC 도메인 전환).

```bash
python -m ontology.generate_schema_ttl          # ontology/schema.ttl 재생성
python -m ontology.generate_schema_ttl --check   # on-disk 가 SSoT 와 어긋나면 exit 1
```

출력은 SSoT 의 순수 함수(타임스탬프·난수 없음)라 재생성이 byte-identical. `tests/ontology/test_schema_ttl.py::test_schema_is_fresh` 가 CI 에서 재생성 누락을 차단한다. 클래스/관계 변경 절차: `data/schemas.py` 수정 → `generate_schema_ttl` 재실행 → 커밋.

## 핵심 컨벤션

- **불변 식별자 유지**: opinet 코드는 한 번 부여되면 재사용·재할당 금지. retire 시 값 삭제가 아니라 상태 표기.
- **YAML 카탈로그 ≡ schemas.py**: `classes/*.yaml`·`relations/edges.yaml` 은 `data/schemas.py` 와 클래스명·관계 튜플이 일치해야 함. 새 클래스/관계는 schemas.py 가 먼저.
- **새 표준/매핑 정책 변경 = 새 ADR**: 코드 카탈로그(opinet 등) 분류 체계가 바뀌면 `docs/decisions/` 에 ADR 1개.

## 페르소나 SSoT

5 부서 페르소나 우선순위의 SSoT 는 **`api/services/persona.py:PERSONA_REGISTRY`** 다 (ADR-0007). 프론트는 `GET /api/personas` 로 따라간다. (이 디렉토리에 `persona_priority.yaml` 은 없음 — 과거 문서 오류.)

## 잔재 정리 (pre-pivot mfg) — 완료 (ADR-0021)

`ontology-for-retail`/`ontology-for-mfg` 참조 PoC 에서 넘어온 제조·반도체 도메인 잔재 18개 파일은 ADR-0021 로 제거됨 (`ontology/adapters/`, `data/public/`, `data/synthetic/{telemetry,maintenance,customers}.py`, `data/load_graph.py` 및 전용 테스트). 새 mfg 도메인 파일을 다시 들이지 말 것.
