"""file 1 (TB_SM_CMPG_OFER_F, 5,278 rows) → Campaign+Offer+Coupon+CouponUse."""
from __future__ import annotations
from data.real._common import read_csv_rows, normalize_cust_id, normalize_dt
from data.schemas import Campaign, Offer, Coupon, CouponUse


def load(path: str) -> dict[str, list]:
    campaigns: dict[str, Campaign] = {}
    offers: dict[str, Offer] = {}
    coupons: dict[str, Coupon] = {}
    coupon_uses: list[CouponUse] = []

    for row in read_csv_rows(path):
        cust = normalize_cust_id(row.get('비식별고객번호', ''))
        cmpg_cd = (row.get('campaign_cd') or '').strip()
        offer_cd = (row.get('offer_cd') or '').strip()
        coupon_no = (row.get('coupon_no') or '').strip()

        if cmpg_cd and cmpg_cd not in campaigns:
            campaigns[cmpg_cd] = Campaign(
                campaign_cd=cmpg_cd, name_kr=cmpg_cd,
                start_dt=normalize_dt(row.get('campaign_start_dt')) or '00000000',
                end_dt=normalize_dt(row.get('campaign_end_dt')) or '00000000',
            )
        if offer_cd and offer_cd not in offers:
            offers[offer_cd] = Offer(
                offer_cd=offer_cd, campaign_cd=cmpg_cd,
                offer_nm=row.get('offer_nm', '') or offer_cd,
            )
        if coupon_no and coupon_no not in coupons:
            try:
                denom = int(row['denomination_amt']) if row.get('denomination_amt') else 0
            except ValueError:
                denom = 0
            coupons[coupon_no] = Coupon(
                coupon_no=coupon_no, campaign_cd=cmpg_cd, offer_cd=offer_cd,
                denomination_amt=denom,
                valid_start_dt=normalize_dt(row.get('valid_start_dt')) or '00000000',
                valid_end_dt=normalize_dt(row.get('valid_end_dt')) or '00000000',
            )
        if cust:
            try:
                use_amt = int(row.get('coupon_use_amt') or 0)
            except ValueError:
                use_amt = 0
            seq = row.get('coupon_use_seq', '0') or '0'
            # Cohort 보존: coupon_no 결측 시 offer_cd 또는 campaign_cd를 fallback 식별자로 사용
            # (exposure-only 행은 use_amt=0). 이는 D14 cohort 정의 (500명) 유지를 위함.
            effective_coupon_no = coupon_no or (
                f'EXPOSE-{offer_cd}' if offer_cd else f'EXPOSE-{cmpg_cd}' if cmpg_cd else ''
            )
            if effective_coupon_no:
                coupon_uses.append(CouponUse(
                    use_id=f'{effective_coupon_no}-{cust}-{seq}',
                    cust_id=cust, coupon_no=effective_coupon_no,
                    use_amt=use_amt,
                    deal_dt=normalize_dt(row.get('deal_dt')) or normalize_dt(row.get('approval_dt')) or '00000000',
                ))

    return {
        'campaigns': list(campaigns.values()),
        'offers': list(offers.values()),
        'coupons': list(coupons.values()),
        'coupon_uses': coupon_uses,
    }
