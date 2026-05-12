# ontology/ — 표준 매핑·온톨로지 정의

> CSV / JSON 형태로 외부 표준과 GSC 내부 코드를 매핑.

## 모듈 역할

- **표준 어댑터의 데이터**: `data/public/*.py` 로더가 읽는 정적 사전.
- **버전 관리 표면**: 표준 코드는 한국 정부·산업 표준이라 시간에 따라 갱신 — 변경을 git diff 로 추적.
- **CLAUDE.md 루트 시나리오 매핑 source**: 25 클래스 / 14 시나리오 매트릭스의 라벨·한국어 표기는 여기서 옵.

## 디렉토리 지도

```
ontology/
├── mappings/
│   ├── opinet_codes.csv          유종·주유소 ID 매핑 (오피넷)
│   ├── kfda_terms.json           식약처 용어집 (시나리오 I 컴플라이언스)
│   ├── gsc_internal_codes.csv    GSC 멤버십·결제수단·약관 내부 코드
│   ├── sido_geojson_v2.json      KOSTAT 행정구역 GeoJSON
│   └── persona_priority.yaml     5 부서 × 14 시나리오 우선순위 매트릭스
└── classes/
    └── (선택) per-class YAML — 클래스별 한국어/영문 라벨, properties, 예시.
```

## 핵심 컨벤션

- **불변 식별자 유지**: opinet 코드 / KFDA 용어 ID 는 한 번 부여되면 절대 재사용·재할당 금지. 코드가 retire 되면 `status: deprecated` 컬럼.
- **csv 인코딩**: UTF-8 with BOM (Excel 호환). CRLF.
- **새 매핑 = 새 ADR**: 매핑 정책이 변경되면 (예: KFDA 용어 분류 체계 갱신) `docs/decisions/` 에 ADR 1개.

## 사용 예

```python
# data/public/opinet.py
import csv, pathlib
def load_opinet():
    with open(pathlib.Path(__file__).parents[2] / "ontology/mappings/opinet_codes.csv") as f:
        yield from csv.DictReader(f)
```

## 5 부서 페르소나 × 14 시나리오 우선순위

`ontology/mappings/persona_priority.yaml` 가 SSoT. 변경 시 `api/services/personas.py` 도 동기화 (ADR-0007).
