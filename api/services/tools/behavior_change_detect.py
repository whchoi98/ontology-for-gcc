"""Tool: behavior_change_detect — PDF 3페이지 시그니처 인사이트.

PM+M 92 RON 혼유 (pm_m_mixing) + 디젤→premium 유종 전환 (fuel_grade_transition).
"""
from __future__ import annotations

from api.services.neptune import open_cypher
from api.services.cohort import select


def run(input: dict, *, persona_id: str, session_id: str, cust_id):
    pattern = input.get('pattern', '')
    cohort_filter = input.get('cohort_filter') or select(persona_id, 'K')

    if pattern == 'pm_m_mixing':
        q = """MATCH (c:Customer)-[:REFUELED]->(t1:FuelTransaction)-[:AT]->(s:GasStation)
               MATCH (c)-[:REFUELED]->(t2:FuelTransaction)-[:AT]->(s)
               WHERE t1.fuel_grade='premium' AND t2.fuel_grade='regular'
                 AND substring(t1.ts,0,10) = substring(t2.ts,0,10)
                 AND c.data_depth IN $depths
               RETURN c.cust_id AS cust_id,
                      c.data_depth AS depth,
                      count(DISTINCT substring(t1.ts,0,10)) AS pm_m_days
               ORDER BY pm_m_days DESC LIMIT 50"""
        res = open_cypher(q, parameters={'depths': cohort_filter})
        matches = res.get('results', [])
        return {
            'pattern': 'pm_m_mixing',
            'count': len(matches),
            'matches': matches,
            'note': 'PM+M same-day same-station — 92 RON DIY 후보',
        }

    if pattern == 'fuel_grade_transition':
        q = """MATCH (c:Customer)-[:REFUELED]->(t:FuelTransaction)
               WHERE c.data_depth IN $depths
               WITH c, t.fuel_grade AS grade, t.ts AS ts ORDER BY ts
               WITH c, collect(grade) AS grades
               WHERE size(grades) > 4
                 AND grades[-1] <> grades[-5]
                 AND grades[-1] IN ['premium','regular']
                 AND grades[-5] = 'diesel'
               RETURN c.cust_id AS cust_id,
                      grades[-5] AS prev,
                      grades[-1] AS now
               LIMIT 50"""
        res = open_cypher(q, parameters={'depths': cohort_filter})
        return {
            'pattern': 'fuel_grade_transition',
            'matches': res.get('results', []),
            'note': '디젤→휘발유 전환 — Celebration 캠페인 후보',
        }

    if pattern == 'app_signup_after_install':
        return {
            'pattern': 'app_signup_after_install',
            'note': 'PDF 3페이지 시나리오 — Plan 4의 시나리오 M에서 본격 구현',
        }

    return {'error': f'unknown pattern: {pattern}'}
