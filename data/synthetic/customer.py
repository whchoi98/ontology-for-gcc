"""DW_CU_CUST_MAST 청사진 기반 15 핵심 속성 합성. 실 transaction의 성별·연령은 우선 사용."""
from __future__ import annotations
from typing import Optional
from data.schemas import Customer
from data.synthetic._common import (
    seeded_rng, weighted_choice,
    AGE_DIST, GENDER_DIST, SIDO_DIST, OCCUPATION_DIST,
)


def enrich_customer_attributes(
    cust_id: str,
    data_depth: str,
    real_gender: Optional[str] = None,
    real_age: Optional[str] = None,
) -> Customer:
    rng = seeded_rng(f'customer:{cust_id}')
    gender = real_gender or weighted_choice(rng, GENDER_DIST)
    age_section = real_age or weighted_choice(rng, AGE_DIST)
    age_val = int(age_section) + rng.randint(0, 9)
    sido = weighted_choice(rng, SIDO_DIST)
    sgg = f'{sido}-{rng.randint(1,25):02d}'
    work_sgg = sgg if rng.random() < 0.7 else f'{weighted_choice(rng, SIDO_DIST)}-{rng.randint(1,25):02d}'
    occupation = weighted_choice(rng, OCCUPATION_DIST)
    vip = 'Y' if rng.random() < 0.05 else 'N'
    grade = rng.choices(['Silver', 'Gold', 'Black'], weights=[0.6, 0.3, 0.1])[0]
    primary_site = f'S{rng.randint(1,500):04d}'
    kixx_dt = f'202{rng.randint(0,5)}{rng.randint(1,12):02d}{rng.randint(1,28):02d}'
    bns_dt = f'201{rng.randint(0,9)}{rng.randint(1,12):02d}{rng.randint(1,28):02d}'
    mail_recv = 'Y' if rng.random() < 0.45 else 'N'
    plcc = 'Y' if rng.random() < 0.18 else 'N'
    return Customer(
        cust_id=cust_id, age_val=age_val, age_section_cd=age_section,
        gender_cd=gender, sido_nm=sido, sgg_nm=sgg, work_sgg=work_sgg,
        occupation_cd=occupation, vip_yn=vip,
        primary_site_cd=primary_site, member_grade=grade,
        kixx_join_dt=kixx_dt, bns_card_join_dt=bns_dt,
        mail_recv_yn=mail_recv, plcc_yn=plcc,
        data_depth=data_depth,
    )
