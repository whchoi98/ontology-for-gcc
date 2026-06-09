# scripts/ — 운영 / 평가 / 시드 헬퍼

> 한 번 실행하거나 cron 으로 도는 유틸. 항상 repo 루트에서 `bash scripts/<name>.sh` 또는 `python scripts/<name>.py` 호출.

## 디렉토리 지도

```
scripts/
├── setup.sh                       신규 개발자 1회 환경 셋업
├── install-hooks.sh               git commit-msg 훅 설치 (Co-Authored-By Claude strip)
├── eval_wow_queries.py            14 wow query 정답률 평가 (CI 게이트 ≥ 85%)
├── gen_class_catalog.py           ontology/mappings → 클래스 카탈로그 재생성
├── gen_scenario_boilerplate.py    새 시나리오 라우터·페이지·테스트 스캐폴딩
├── label_codegraph_communities.py 코드 지식 그래프 community Sonnet 라벨링
├── label_communities.py           고객 그래프 community 라벨링
├── refresh_codegraph.sh           graphify 재실행 + community 라벨 in-place 패치
├── run_harness_eval.sh            .claude/ 하니스 12-차원 평가 실행
├── setup-kma-secret.sh            KMA API 키 Secrets Manager 등록
└── probe_object_edges.py          Object Explorer 엣지 커버리지 진단 (offer/coupon/gas_station orphan 점검, ADR-0022)
```

## 핵심 컨벤션

- **bash 스크립트**: `set -euo pipefail` 필수. 색깔 출력은 `printf '\033[1;36m...\033[0m\n'`.
- **인자 검증**: `--help` 지원. 비파괴 동작이 기본. 파괴 동작은 `--force` 명시.
- **멱등성**: 같은 입력 → 같은 결과. commit-msg 훅 재설치 같은 케이스는 diff 후 no-op.
- **Python 스크립트**: `if __name__ == "__main__":` + `argparse`. boto3 호출은 `from api.aws_clients import session as boto_session` 재사용.

## 새 스크립트 추가 시

1. 동사로 시작하는 파일명 (`gen_*`, `refresh_*`, `setup_*`, `eval_*`).
2. 사용법 헤더 코멘트 (`# 사용법: ...`).
3. `--help` 지원.
4. `scripts/CLAUDE.md` 디렉토리 지도에 한 줄 추가.
