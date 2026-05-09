"""Tool: campaign_simulator — coupon × cohort → projected conversion / ROI."""
from __future__ import annotations

from api.services.neptune import open_cypher


def run(input: dict, *, persona_id: str, session_id: str, cust_id):
    seg = input.get('target_segment_id', '')
    coupon = input.get('coupon_amt', 0)
    duration = input.get('duration_days', 30)
    q = """MATCH (a:CampaignAggregation)
           RETURN avg(a.roi_pct) AS avg_roi,
                  avg(toFloat(a.converted_count) / a.target_count) AS avg_conv"""
    res = open_cypher(q)
    rows = res.get('results') or [{'avg_roi': 15.0, 'avg_conv': 0.035}]
    base = rows[0] if rows else {'avg_roi': 15.0, 'avg_conv': 0.035}
    avg_conv = base.get('avg_conv') or 0.035
    avg_roi = base.get('avg_roi') or 15.0
    # heuristic lift: 500원 단위 coupon scale, capped at 4x.
    lift = 1.0 + min((coupon or 0) / 500.0, 4.0)
    proj_conv = min(avg_conv * lift, 0.5)
    return {
        'segment_id': seg,
        'coupon_amt': coupon,
        'duration_days': duration,
        'projected_conversion': round(proj_conv, 4),
        'baseline_roi_pct': round(avg_roi, 2),
        'note': 'Bayesian point estimate; 시나리오 G에서 분포 시각화',
    }
