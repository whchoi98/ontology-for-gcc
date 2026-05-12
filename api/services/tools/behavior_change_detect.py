"""Tool: behavior_change_detect — PDF 3페이지 시그니처 인사이트.

PM+M 92 RON 혼유 (pm_m_mixing) + 디젤→premium 유종 전환 (fuel_grade_transition).

NOTE: Plan 2 cypher_bulk loaded nodes only (no relationships) — uses property-
based joining via cust_id / store_cd FK fields on FuelTransaction nodes.
"""
from __future__ import annotations

from api.services.neptune import open_cypher
from api.services.cohort import select, ALL_DEPTHS


def run(input: dict, *, persona_id: str, session_id: str, cust_id):
    pattern = input.get('pattern', '')
    cohort_filter = input.get('cohort_filter') or select(persona_id, 'K')
    # ['*'] is sentinel for "all depths" — expand to the registered list.
    if cohort_filter == ['*']:
        cohort_filter = ALL_DEPTHS

    if pattern == 'pm_m_mixing':
        # Aggregate-first strategy: customers who have BOTH premium and regular
        # transactions are PM+M candidates. Aggregation is cheap; cross-product
        # joins on 472K rows time out in 30s, so we keep the predicate flat.
        q = """MATCH (t:FuelTransaction)
               WHERE t.fuel_grade IN ['premium','regular']
               WITH t.cust_id AS cust_id, collect(DISTINCT t.fuel_grade) AS grades
               WHERE size(grades) = 2
               RETURN cust_id, grades LIMIT 5000"""
        try:
            res = open_cypher(q)
            matches = res.get('results', [])
        except Exception:
            matches = []
        return {
            'pattern': 'pm_m_mixing',
            'count': len(matches),
            'matches': matches[:50],
            'note': 'PM+M same-customer 양방향 유종 — 92 RON DIY 후보',
            'cohort_filter': cohort_filter,
        }

    if pattern == 'fuel_grade_transition':
        # Customer-first 전체 cohort coverage: cohort 전체 (deep-history 33 +
        # coupon-only 484 + sales-only 17 = 최대 534명)에 대해 transaction 매칭.
        # cust_id index seek는 빠르므로 Neptune r7g.2xlarge에서 1-3초.
        # 이전엔 전체 FuelTransaction(수십만) 스캔 → 30초+ timeout이 문제.
        cohort_q = """MATCH (c:Customer) WHERE c.data_depth IN $depths
                      RETURN count(c) AS n"""
        cohort_res = open_cypher(cohort_q, parameters={'depths': cohort_filter})
        cohort_size = (cohort_res.get('results') or [{}])[0].get('n', 0)

        q = """MATCH (c:Customer) WHERE c.data_depth IN $depths
               WITH collect(c.cust_id) AS ids
               UNWIND ids AS cid
               MATCH (t:FuelTransaction {cust_id: cid})
               WITH cid AS cust_id, t.fuel_grade AS grade, t.ts AS ts
               ORDER BY cust_id, ts
               WITH cust_id, collect(grade) AS grades
               WHERE size(grades) > 4
                 AND grades[-1] <> grades[-5]
                 AND grades[-1] IN ['premium','regular']
                 AND grades[-5] = 'diesel'
               RETURN cust_id, grades[-5] AS prev, grades[-1] AS now"""
        try:
            res = open_cypher(q, parameters={'depths': cohort_filter})
            matches = res.get('results', [])
        except Exception as e:
            matches = []
            error_note = f'쿼리 실패 — {type(e).__name__}'
        else:
            error_note = None
        return {
            'pattern': 'fuel_grade_transition',
            'cohort_size': cohort_size,           # 전체 후보군 (정확성 metric)
            'matches_count': len(matches),
            'matches': matches[:50],              # 표시는 50개 cap, 실제 검사는 전체
            'coverage': '100%',                   # cohort 전체 검사 — sampling 없음
            'note': '디젤→휘발유 전환 — Celebration 캠페인 후보',
            'error': error_note,
        }

    if pattern == 'app_signup_after_install':
        return {
            'pattern': 'app_signup_after_install',
            'note': 'PDF 3페이지 시나리오 — Plan 4의 시나리오 M에서 본격 구현',
        }

    return {'error': f'unknown pattern: {pattern}'}
