"""CampaignAggregation 합성 — TB_SM_CMPG_OFER_S 청사진. fact → aggregation 재계산."""
from data.schemas import CampaignAggregation, CouponUse, Coupon
from collections import defaultdict


def aggregate_from_facts(coupons: list[Coupon], coupon_uses: list[CouponUse],
                         sms: list) -> list[CampaignAggregation]:
    by_cmpg_target: dict[str, int]    = defaultdict(int)
    by_cmpg_delivered: dict[str, int] = defaultdict(int)
    by_cmpg_converted: dict[str, int] = defaultdict(int)
    by_cmpg_revenue: dict[str, int]   = defaultdict(int)
    by_cmpg_cost: dict[str, int]      = defaultdict(int)
    for s in sms:
        by_cmpg_target[s.campaign_cd] += 1
        if s.delivered_yn == 'Y':
            by_cmpg_delivered[s.campaign_cd] += 1
    coupon_to_cmpg = {c.coupon_no: c.campaign_cd for c in coupons}
    for u in coupon_uses:
        cmpg = coupon_to_cmpg.get(u.coupon_no)
        if cmpg:
            by_cmpg_converted[cmpg] += 1
            by_cmpg_revenue[cmpg] += u.use_amt * 4   # 추정: 쿠폰액 4배 매출
    out: list[CampaignAggregation] = []
    for cmpg in by_cmpg_target.keys() | by_cmpg_converted.keys():
        target = by_cmpg_target[cmpg]
        delivered = by_cmpg_delivered[cmpg]
        converted = by_cmpg_converted[cmpg]
        revenue = by_cmpg_revenue[cmpg]
        cost = target * 850   # 추정: 1건당 850원 (SMS+쿠폰 비용)
        roi = (revenue - cost) / max(cost, 1) * 100
        out.append(CampaignAggregation(
            campaign_cd=cmpg, target_count=target, delivered_count=delivered,
            converted_count=converted, revenue_amt=revenue, cost_amt=cost,
            roi_pct=round(roi, 2),
        ))
    return out
