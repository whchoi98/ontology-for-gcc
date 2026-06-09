# ADR 0021 — pre-pivot 제조(mfg) 잔재 18개 파일 제거

- Status: Accepted
- Date: 2026-06-09
- Deciders: 개발팀
- Tags: cleanup, ontology, tech-debt
- Related: [ADR-0013](0013-mfg-template-decoupling-pytest-namespace.md), [ADR-0020](0020-schema-ttl-generated-from-pydantic-ssot.md)

## Context

`ontology-gcc` 는 `ontology-for-retail` / `ontology-for-mfg` 참조 PoC 에서 출발해, 제조·반도체 도메인 코드가 다수 잔존했다. ADR-0020 의 schema.ttl 도메인 전환 작업 중 4-차원 감사(잔재 분류 / 소비자 영향 / 문서 드리프트 / 적대적 검증)로 다음이 드러났다:

- `data/public/*.py` 8개 + `data/synthetic/{telemetry,maintenance,customers}.py` 3개는 `data/schemas.py` 에서 사라진 `Standard`/`Substance`/`Regulation`/`Telemetry`/`MaintenanceEvent`/`CustomerAccount` 를 import → **런타임 ImportError 로 깨진 모듈**. `compileall` 은 구문만 보므로 CI 가 green 으로 위장돼 왔다.
- `data/public/geo.py` 는 `Region` (존재) 을 import 하지만 KOSTAT 기반 GCC `Region` 과 필드가 다른 SCM-국가 변형 — 호출 시 깨짐.
- `ontology/adapters/{cbam_to_kets,jedec_to_ks,reach_to_kreach}.py` 는 탄소·반도체·화학 표준 매핑으로 GCC 와 무관하며 오직 자신의 테스트만 참조.
- `data/load_graph.py` 는 mfg-era Neptune 로더 (NODE_FILES 에 Manufacturer/Product/Supplier/Telemetry…). 라이브 로더 `data/load.py` 는 이를 쓰지 않고 `data/loader/cypher_bulk`·`bulk_neptune`·`opensearch_index` 를 사용.
- `api/routers/ops.py` (라이브 stub) 의 데모 콘텐츠가 제조 도메인 (Component/Supplier/AEC-Q100/8D, persona Engineer·Quality·Buyer·SCM·Plant).

라이브 경로(`data/load.py`, `api/**`)에서 import 되는 잔재는 0건임을 grep 으로 교차검증했다.

## Decision

제조 잔재 18개 파일을 삭제하고, 라이브 `ops.py` 데모 콘텐츠를 GCC 도메인으로 교체한다.

- **삭제 (18)**: `data/public/` 전체(9) + `data/synthetic/{telemetry,maintenance,customers}.py`(3) + `ontology/adapters/` 전체(3) + `tests/ontology/test_adapters.py`(1) + `data/load_graph.py` + `tests/data/test_load_graph.py`(2).
- **교체**: `api/routers/ops.py` 의 5개 `_*_data()` stub 을 GCC(Customer/FuelTransaction/GasStation 적재, 고객 PII·경쟁사·마케팅동의 가드레일, 5 부서 페르소나, 시나리오 A-N 평가, 실제 10 에이전트 도구 트레이스)로 재작성.

## Alternatives Considered

- **보존 + 문서화만** — 깨진 import 가 계속 CI 를 위장 통과하고, ops.py 데모가 GCC 시연에서 반도체 콘텐츠를 노출. 기각.
- **깨진 파일(Group A)만 삭제** — adapters/load_graph/ops.py 잔재가 남아 도메인 혼란 지속. 부분 정리라 기각.
- **schemas.py 에 mfg 클래스 복원** — GCC 25 클래스 SSoT 를 오염. 기각.

## Consequences

### Positive

- 깨진 import 모듈 제거 — `compileall` 의 위장-green 해소.
- GCC 데모 표면 일관성 (ops 페이지에 더 이상 제조 mock 없음).
- 코드베이스가 25 클래스 GCC 도메인으로 수렴.

### Negative

- 테스트 표면 축소: `test_adapters.py`·`test_load_graph.py` 제거로 pytest 115 → 109 (제거분은 잔재 전용 테스트).

### Neutral

- `data/load_search.py` 는 이번 범위 밖 (감사 미검증) — 별도 확인 대상으로 남김.

## Implementation Notes

- 삭제: `git rm` (18 파일). 빈 `data/public/`·`ontology/adapters/` 디렉토리 + 고아 `__pycache__` 정리.
- 수정: `api/routers/ops.py`, `ontology/CLAUDE.md`, `data/CLAUDE.md`, 루트 `CLAUDE.md` (디렉토리 맵·새 클래스 추가 절차).
- 검증: `pytest tests -q` (109 passed), `compileall api data ontology scripts` OK.
- Rollback: `git revert` — 단 복원되는 파일은 깨진 mfg 모듈이라 권장하지 않음.

## References

- 감사 워크플로우: ontology-ttl-pivot-audit (4 에이전트, leftover/consumer/docs/verify 차원)
- SSoT: `data/schemas.py`
