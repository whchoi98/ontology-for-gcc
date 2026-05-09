"""file 9 (운전중불편요소설문, 25,961 rows; 매핑 cust 15명, 나머지 anonymous).

real cohort에 속하지 않는 cust_id 값은 anonymous 처리 — 설문 응답자 ID 풀이
실 cohort보다 훨씬 크므로(25,961 > 500), 매핑 가능한 응답만 cust_id 보존."""
from __future__ import annotations
from pathlib import Path
import glob
import os
from data.real._common import read_csv_rows, normalize_cust_id
from data.schemas import SurveyResponse


def _load_real_cohort(survey_path: str) -> set[str]:
    """survey 파일과 같은 디렉토리의 file 1 (쿠폰)을 로드해 real cust_id 집합 반환.

    file 1을 못 찾으면 빈 set 반환 — 모든 응답이 anonymous로 처리됨."""
    parent = os.path.dirname(survey_path) or '.'
    f1_paths = glob.glob(os.path.join(parent, '1*.csv'))
    if not f1_paths:
        return set()
    cohort: set[str] = set()
    try:
        for r in read_csv_rows(f1_paths[0]):
            c = normalize_cust_id(r.get('비식별고객번호', ''))
            if c:
                cohort.add(c)
    except Exception:
        return set()
    return cohort


def load(path: str) -> list[SurveyResponse]:
    real_cohort = _load_real_cohort(path)
    out = []
    for i, row in enumerate(read_csv_rows(path)):
        cust = normalize_cust_id(row.get('비식별고객번호', ''))
        # cust가 real cohort에 있을 때만 매핑 — 그 외는 anonymous (None)
        mapped_cust = cust if (cust and (not real_cohort or cust in real_cohort)) else None
        factors_raw = row.get('운전 중 불편요소', '')
        factors = [f.strip() for f in factors_raw.split(',') if f.strip()] if factors_raw else []
        out.append(SurveyResponse(
            response_id=f'srv-{i:06d}',
            cust_id=mapped_cust,
            ts='unknown',
            inconvenience_factors=factors,
        ))
    return out
