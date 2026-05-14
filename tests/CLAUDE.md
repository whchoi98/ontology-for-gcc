# tests/ — pytest + integration + smoke

> 빠른 (<13s) CI 그린이 목표. 실제 AWS는 호출하지 않음 (boto3 클라이언트는 import-site mock).

## 디렉토리 지도

```
tests/
├── conftest.py        세션 스코프 env 기본값 + boto3/Neptune mock 등록
├── test_smoke.py      라우터 import smoke (시나리오당 1 케이스, 파라미터화)
├── api/               FastAPI 통합 (httpx.AsyncClient + mock)
├── data/              data.load.* 단위 테스트
├── infra/             CDK synth 결과 검증 (필요 시)
├── ontology/          매핑 파일 무결성 (중복 ID, 인코딩)
├── services/          api/services/* 단위 (Bedrock·Neptune mock)
├── hooks/             .claude/hooks 동작 검증
├── structure/         프로젝트 manifest·CLAUDE.md 필수 섹션 검증
└── fixtures/          true positive / false positive 샘플
```

## 핵심 컨벤션

- **mock은 import-site에서**: `patch("api.routers.search.search.hybrid_search", ...)` (사용 위치). `patch("api.services.search.hybrid_search", ...)` (소스) 는 모듈 캐싱 이슈로 가끔 새는 경우가 있어 비권장.
- **env 기본값은 `conftest.py`**: 운영의 fail-closed 기본값을 테스트에서 풀 때는 fixture 로만 풀고, 글로벌 mutation 금지.
- **새 라우터 = `test_smoke.py` 한 줄 + `tests/api/test_<slug>.py`**: smoke 는 import + `/healthz` 류, 통합 은 실제 페이로드 1+.
- **CDK 변경 = `infra-cdk/test/stacks.test.ts` 스냅샷**: snapshot 의도된 변경은 `npx jest -u`. 의도하지 않은 변경 = blocking.

## 실행

```bash
# pytest 전체
pytest tests -q

# 한 시나리오만
pytest tests/api/test_chat.py -v

# CDK 스냅샷
cd infra-cdk && npx jest

# 하니스 테스트 (.claude/hooks 등 검증)
bash tests/run-all.sh
```

## Sibling 프로젝트 격리 (pytest.ini)

같은 EC2/머신의 `../ontology-for-mfg`, `../ontology-for-retail` 가 동일 `tests/__init__.py` namespace package 를 공유하면 *동일 이름 모듈* (예: `test_neptune_service.py`) 끼리 sys.path 순서 충돌. ADR-0013 의 fix:

```ini
[pytest]
testpaths = tests       # GCC tests/ 만 collect
pythonpath = .          # importlib mode 아닌 default 모드에서 api/ 등 import 가능
norecursedirs = .git node_modules .next __pycache__ cdk.out .venv build dist .pytest_cache .ruff_cache .harness-eval graphify-out raw_data
```

`tests/__init__.py` 는 *유지* — 제거 시 동일 basename 충돌 (`tests/api/test_chat.py` vs `tests/api/routers/test_chat.py`) 발생. `pythonpath=.` 가 sys.path 1순위로 GCC root 를 박아 sibling 보다 우선.

## CI 게이트

`.github/workflows/ci.yml` 의 4 잡:
1. `python-ast` — `python -m compileall -q api data scripts`
2. `tsc-check` — `web` + `infra-cdk` 매트릭스
3. `cdk-synth` — dummy account 로 synth + jest snapshot
4. `pytest` — pytest 전체

전 잡 합쳐 < 60s 가 목표.
