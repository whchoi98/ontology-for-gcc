"""CampaignSms 합성 — DW_CP_SM_CAMP_MSG 청사진."""
from data.schemas import CampaignSms
from data.synthetic._common import seeded_rng


def generate_sms_for_campaigns(campaign_codes: list[str], target_cust_ids: list[str],
                                per_campaign: int = 250) -> list[CampaignSms]:
    out = []
    for cmpg in campaign_codes:
        rng = seeded_rng(f'sms:{cmpg}')
        for c in rng.sample(target_cust_ids, min(per_campaign, len(target_cust_ids))):
            delivered = 'Y' if rng.random() < 0.92 else 'N'
            opened    = 'Y' if delivered == 'Y' and rng.random() < 0.35 else 'N'
            clicked   = 'Y' if opened == 'Y' and rng.random() < 0.18 else 'N'
            year = 2025
            month = rng.randint(1, 12)
            day = rng.randint(1, 28)
            out.append(CampaignSms(
                sms_id=f'sms-{cmpg}-{c}', campaign_cd=cmpg, cust_id=c,
                sent_dt=f'{year}{month:02d}{day:02d}',
                delivered_yn=delivered, open_yn=opened, clicked_yn=clicked,
            ))
    return out
