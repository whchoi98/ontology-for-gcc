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
        # Property-based join: same cust_id + same store_cd + same date,
        # one premium tx and one regular tx — 92 RON DIY mix signature.
        q = """MATCH (t1:FuelTransaction)
               WHERE t1.fuel_grade = 'premium'
               WITH t1, substring(toString(t1.ts), 0, 10) AS d1
               MATCH (t2:FuelTransaction)
               WHERE t2.fuel_grade = 'regular'
                 AND t2.cust_id = t1.cust_id
                 AND t2.store_cd = t1.store_cd
                 AND substring(toString(t2.ts), 0, 10) = d1
               OPTIONAL MATCH (c:Customer {cust_id: t1.cust_id})
               WHERE c.data_depth IN $depths
               RETURN t1.cust_id AS cust_id,
                      c.data_depth AS depth,
                      count(DISTINCT d1) AS pm_m_days
               ORDER BY pm_m_days DESC LIMIT 50"""
        try:
            res = open_cypher(q, parameters={'depths': cohort_filter})
            matches = res.get('results', [])
        except Exception:
            matches = []
        if not matches:
            # Fallback: relax the cohort filter (Plan 2 customer cohort table is sparse).
            q2 = """MATCH (t1:FuelTransaction)
                    WHERE t1.fuel_grade = 'premium'
                    WITH t1, substring(toString(t1.ts), 0, 10) AS d1
                    MATCH (t2:FuelTransaction)
                    WHERE t2.fuel_grade = 'regular'
                      AND t2.cust_id = t1.cust_id
                      AND t2.store_cd = t1.store_cd
                      AND substring(toString(t2.ts), 0, 10) = d1
                    RETURN t1.cust_id AS cust_id,
                           count(DISTINCT d1) AS pm_m_days
                    ORDER BY pm_m_days DESC LIMIT 500"""
            try:
                res = open_cypher(q2)
                matches = res.get('results', [])
            except Exception:
                matches = []
        return {
            'pattern': 'pm_m_mixing',
            'count': len(matches),
            'matches': matches[:50],
            'note': 'PM+M same-day same-station — 92 RON DIY 후보',
        }

    if pattern == 'fuel_grade_transition':
        # Property-based: per-customer chronological grade list.
        q = """MATCH (t:FuelTransaction)
               OPTIONAL MATCH (c:Customer {cust_id: t.cust_id})
               WHERE c.data_depth IN $depths
               WITH t.cust_id AS cust_id, t.fuel_grade AS grade, t.ts AS ts
               ORDER BY cust_id, ts
               WITH cust_id, collect(grade) AS grades
               WHERE size(grades) > 4
                 AND grades[-1] <> grades[-5]
                 AND grades[-1] IN ['premium','regular']
                 AND grades[-5] = 'diesel'
               RETURN cust_id, grades[-5] AS prev, grades[-1] AS now
               LIMIT 50"""
        try:
            res = open_cypher(q, parameters={'depths': cohort_filter})
            matches = res.get('results', [])
        except Exception:
            matches = []
        return {
            'pattern': 'fuel_grade_transition',
            'matches': matches,
            'note': '디젤→휘발유 전환 — Celebration 캠페인 후보',
        }

    if pattern == 'app_signup_after_install':
        return {
            'pattern': 'app_signup_after_install',
            'note': 'PDF 3페이지 시나리오 — Plan 4의 시나리오 M에서 본격 구현',
        }

    return {'error': f'unknown pattern: {pattern}'}
