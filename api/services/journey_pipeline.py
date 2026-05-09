"""고객 1명의 App + Transaction + Term + Coupon 시계열 통합 view.

Hybrid traversal: AGREED_TO/FOR/USED_APP edges loaded → graph traversal.
Coupon path uses property-join fallback because PRICED_AT/USED edges still
missing. Plan 5 polish: switch all to graph traversal once full edges loaded.
"""
from __future__ import annotations
from typing import List

from api.services.neptune import open_cypher

_GRADES = {'premium', 'regular', 'diesel', 'lpg', 'kerosene'}


def build_journey(cust_id: str) -> dict:
    """단일 고객의 모든 시계열 이벤트를 시간순 통합."""
    # AppEvent — USED_APP edges loaded (Plan 3.5)
    q_app = """MATCH (c:Customer {cust_id: $cid})-[:USED_APP]->(e:AppEvent)
               RETURN 'app' AS source, e.ts AS ts, e.event_action AS event,
                      e.event_label AS detail
               ORDER BY ts"""
    # FuelTransaction — REFUELED missing → property-join via cust_id FK
    q_tx = """MATCH (t:FuelTransaction {cust_id: $cid})
              RETURN 'transaction' AS source, t.ts AS ts,
                     t.fuel_grade AS event,
                     toString(t.amount) AS detail
              ORDER BY ts"""
    # Term — AGREED_TO + FOR edges loaded (Plan 3.5)
    q_term = """MATCH (c:Customer {cust_id: $cid})-[:AGREED_TO]->(ta:TermAgreement)-[:FOR]->(tm:Term)
                RETURN 'term' AS source, ta.approval_dt AS ts,
                       tm.name_kr AS event,
                       ta.approved_yn AS detail
                ORDER BY ts"""
    # CouponUse — USED edges missing → property-join via cust_id (denormalized)
    q_coupon = """MATCH (u:CouponUse) WHERE u.cust_id = $cid
                  OPTIONAL MATCH (co:Coupon) WHERE co.coupon_no = u.coupon_no
                  RETURN 'coupon' AS source, u.deal_dt AS ts,
                         coalesce(co.coupon_no, u.coupon_no) AS event,
                         toString(u.use_amt) AS detail
                  ORDER BY ts"""
    events: List[dict] = []
    for q in (q_app, q_tx, q_term, q_coupon):
        try:
            res = open_cypher(query=q, parameters={'cid': cust_id})
            events.extend(res.get('results', []))
        except Exception:
            pass
    events.sort(key=lambda e: e.get('ts') or '')

    # 유종 전환 검출 — chronological grade walk
    transitions: List[dict] = []
    last_grade = None
    for e in events:
        if e.get('source') == 'transaction':
            g = e.get('event')
            if last_grade and last_grade != g and g in _GRADES:
                transitions.append({
                    'ts': e.get('ts'),
                    'from': last_grade,
                    'to': g,
                })
            last_grade = g

    # 고객 프로필
    q_prof = """MATCH (c:Customer {cust_id: $cid}) RETURN c"""
    try:
        prof_res = open_cypher(query=q_prof, parameters={'cid': cust_id})
        rows = prof_res.get('results', [])
        prof = rows[0] if rows else {}
    except Exception:
        prof = {}

    return {
        'cust_id': cust_id,
        'profile': prof.get('c', {}),
        'events': events,
        'event_count': len(events),
        'fuel_grade_transitions': transitions,
        'note': 'PDF 3페이지 시나리오 — 다층 Insight + Action Item 도출',
    }
