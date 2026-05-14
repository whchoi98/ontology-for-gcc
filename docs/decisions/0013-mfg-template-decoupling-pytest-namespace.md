# ADR 0013 — mfg PoC Template Decoupling + pytest Namespace 격리

- Status: Accepted
- Date: 2026-05-14
- Deciders: 개발팀 (코드 품질 cleanup)

## Context

GCC PoC 는 sibling 프로젝트 `ontology-for-mfg` 의 패턴을 카피해 출발. 결과:

1. **mfg 도메인 잔재 코드 다수** — 라우터 (`eight_d`, `esg_cbam`, `pdm`, `price`, `scm_lane`, `spec_match`, `substitute`, `supplier_rfm` 8개), 서비스 (`rfm_scorer`, `carbon_calc`, `eight_d_writer`, `compliance_engine`, `lane_router`, `search.py` legacy, `embedding`, `kb`, `memory`, `reranker` 10개), `data/synthetic/` 의 mfg generators (boms / esg / incidents / lanes / manufacturers / plants / products / suppliers 9개), `tests/data/` 의 mfg test 17개.

2. **이 잔재 라우터들은 main.py 에서 import 안 됨** — `try/except` 로 graceful skip 되어 *조용히 실패*. 사용자는 *어떤 라우터가 작동 안 하는지* 인지 불가. `tests/test_smoke.py` 가 silent failure 를 잡았지만 이전에는 main 만 검증.

3. **pytest namespace 충돌** — sibling 프로젝트의 `tests/__init__.py` 와 GCC 의 `tests/__init__.py` 가 같은 `tests` namespace package 로 인식. `tests/api/services/test_neptune_service.py` 같은 동일 경로 모듈을 import 시 *sys.path 순서* 에 따라 mfg 또는 GCC 중 하나 잘못 import → ImportError.

4. **README + 문서의 retail 잔재** — `Mapping CSVs (INCI, FoodOn, GS1↔KFDA)`, `250 products, 2,480 reviews, 219 FoodOn aliases` 같은 *완전 다른 도메인* 콘텐츠가 README 4 곳에 잔존.

## Decision

전면 cleanup 한 사이클로 진행:

- **삭제 (62 파일)**:
  - API 라우터 8 (mfg 도메인)
  - API 서비스 10 (mfg 의존 또는 unused)
  - data/synthetic 9 (mfg generators)
  - tests/data 17 (mfg test)
  - tests/api 4 + tests/api/services 4 (mfg pattern mock target)
  - 비호환 test_geo.py 1 (mfg 7-region scheme)
  - 합계 53 + plans 3 archive 이동 + tests/api/services 4 추가 = 64

- **Plans archive 이동** (3 파일):
  - `docs/superpowers/plans/2026-05-05-ontology-mfg-{application,foundation,validation}.md` → `_legacy/`

- **`pytest.ini` 신규** (sibling 격리):
```ini
[pytest]
testpaths = tests
pythonpath = .
norecursedirs = .git node_modules .next __pycache__ cdk.out .venv build dist .pytest_cache .ruff_cache .harness-eval graphify-out raw_data
```

- **`tests/test_smoke.py` 갱신**: `LEGACY_ROUTERS_NEEDING_MIGRATION` xfail 섹션 제거. `ACTIVE_ROUTERS` 만 유지 (20개 GCC 라우터).

- **README 4 곳 정정**: 영문/한국어 양쪽 mfg 잔재 endpoint 라벨을 GCC 시나리오로 교체.

- **mfg foundation/application/validation 문서 archive**: 패턴 학습 참고 자료로 보존, 활성 디렉토리에서 제거.

## Consequences

- **API 이미지 크기 슬림화**: 라우터 8 + 서비스 10 + synthetic 9 = 27 파일 + 의존 import 제거. v1.0.58 부터 이미지 reflect.
- **pytest 109 passed, 0 failed** (cleanup + 4 objects_extra fix 합산). 이전 sibling namespace 충돌로 39 errors → 0.
- **mfg 도메인 *재구현 시* archive 참조 가능**: `docs/superpowers/plans/_legacy/` 에 mfg foundation/application/validation 보존.
- **`ontology-for-mfg` 와 GCC 가 같은 EC2/디렉토리에 공존 시** pytest 안전.
- **개발자 인지 부담 감소**: 새 기여자가 *GCC 도메인 코드만* 봄.

## Alternatives Considered

- **점진적 cleanup**: 라우터 → 서비스 → tests 순차 PR. 작업량 동일하지만 *중간 상태가 깨짐* — pytest 가 일관성 없는 상태에서 더 큰 confusion. 한 사이클 cleanup 이 안전.
- **mfg 잔재 *유지* + tag 만 변경**: legacy/inactive 같은 tag. 코드 표면 *그대로* 라 새 기여자 confusion 지속. 거부.
- **pytest 격리 = `--import-mode=importlib`**: 시도했으나 `_SixMetaPathImporter` 의존 모듈과 충돌. `__init__.py` 유지 + `pythonpath=.` 가 더 안정.

## Related Code / Files

- 삭제: 62 파일 (위 카테고리 참조)
- `pytest.ini` (신규)
- `tests/test_smoke.py` (LEGACY 섹션 제거)
- `README.md` 4 곳 (mfg 잔재 endpoint 라벨)
- `docs/superpowers/plans/_legacy/` (3 mfg plans archive)

## Verification

- `pytest tests` — 109 passed, 0 failed
- `python -m compileall -q api data scripts` — OK
- `cd web && npx tsc --noEmit` — OK
- `bash tests/run-all.sh` — 62/62 assertions
- API v1.0.58 build/push/rollout — COMPLETED 2/2

---
*Implemented in commits `f041bfb chore: mfg 잔재 cleanup` + `c55bafe test: objects_extra 4-failure fix` (2026-05-14). 53 + 11 = 64 파일 변경, +15 / -2882 lines.*
