"""25 클래스 single source of truth (D11·D13·D17 갱신).
관계 메타는 ALL_RELATIONS에 등록. ontology/classes/*.yaml은 사람용 카탈로그."""
from __future__ import annotations
from typing import Literal, Optional
from pydantic import BaseModel, Field

DataDepth = Literal['deep-history', 'coupon-only', 'sales-only', 'lookalike-syn']
PriceSource = Literal['real', 'synthetic']

# ── 고객·회원 (5) ───────────────────────────────────────────────
class Customer(BaseModel):
    cust_id: str           # 비식별고객번호
    age_val: Optional[int] = None
    age_section_cd: Optional[str] = None  # 20/30/40/50/60+
    gender_cd: Optional[str] = None       # M/F
    sido_nm: Optional[str] = None
    sgg_nm: Optional[str] = None
    work_sgg: Optional[str] = None
    occupation_cd: Optional[str] = None
    vip_yn: str = 'N'
    primary_site_cd: Optional[str] = None
    member_grade: Optional[str] = None    # Silver/Gold/Black
    kixx_join_dt: Optional[str] = None
    bns_card_join_dt: Optional[str] = None
    mail_recv_yn: str = 'N'
    plcc_yn: str = 'N'
    data_depth: DataDepth                 # cohort 분류 (D14)

class Persona(BaseModel):
    persona_id: str          # marketing/strategy/data-ai/crm/retail-ops
    name_kr: str
    kpi_focus: list[str]

class Cluster(BaseModel):
    cluster_id: str          # cl-1 ~ cl-6
    label: str               # 충전형/출퇴근형/...
    centroid: dict           # arbitrary feature centroid

class Segment(BaseModel):
    segment_id: str          # seg-001 ~
    label: str
    seed_cust_ids: list[str]
    similarity_threshold: float = 0.7

class Member(BaseModel):
    cust_id: str
    grade: str               # Silver/Gold/Black
    points: int = 0

# ── 행동·거래 (5) ───────────────────────────────────────────────
class FuelTransaction(BaseModel):
    tx_id: str
    cust_id: str
    ts: str                  # ISO8601 KST
    store_cd: str            # GSC 내부 site_cd
    fuel_grade: str          # regular/premium/diesel/kerosene/lpg
    qty_l: float
    unit_price: int
    amount: int
    payment_type: str        # PLCC/credit/smart/point/cash
    earned_general_point: int = 0

class AppEvent(BaseModel):
    event_id: str
    cust_id: Optional[str] = None
    ts: str
    event_action: str
    event_label: Optional[str] = None
    platform: str = 'unknown'

class SurveyResponse(BaseModel):
    response_id: str
    cust_id: Optional[str] = None     # None = anonymous (25,946건)
    ts: str
    inconvenience_factors: list[str]
    free_text: Optional[str] = None

class CouponUse(BaseModel):
    use_id: str
    cust_id: str
    coupon_no: str
    tx_id: Optional[str] = None
    use_amt: int
    deal_dt: str

class PaymentMethod(BaseModel):
    method_id: str           # PLCC/credit/smart/point/cash
    label_kr: str

# ── 마케팅 (6) ──────────────────────────────────────────────────
class Campaign(BaseModel):
    campaign_cd: str
    name_kr: str
    purpose_nm: Optional[str] = None
    lcls_nm: Optional[str] = None
    scls_nm: Optional[str] = None
    start_dt: str
    end_dt: str
    target_persona_id: Optional[str] = None

class Coupon(BaseModel):
    coupon_no: str
    campaign_cd: str
    offer_cd: str
    denomination_amt: int
    valid_start_dt: str
    valid_end_dt: str

class Offer(BaseModel):
    offer_cd: str
    campaign_cd: str
    offer_nm: str

class Channel(BaseModel):
    channel_id: str          # SMS/PUSH/EMAIL/BANNER
    label_kr: str

class CampaignSms(BaseModel):       # D17 — DW_CP_SM_CAMP_MSG 청사진
    sms_id: str
    campaign_cd: str
    cust_id: str
    sent_dt: str
    delivered_yn: str = 'Y'
    open_yn: str = 'N'
    clicked_yn: str = 'N'

class CampaignAggregation(BaseModel):  # D17 — TB_SM_CMPG_OFER_S 청사진
    campaign_cd: str
    offer_cd: Optional[str] = None
    target_count: int
    delivered_count: int
    converted_count: int
    revenue_amt: int
    cost_amt: int
    roi_pct: float

# ── 운영·상품 (4) ───────────────────────────────────────────────
class FuelProduct(BaseModel):
    product_id: str
    grade: str               # regular/premium/diesel/kerosene/lpg
    octane_ron: Optional[int] = None
    label_kr: str

class GasStation(BaseModel):
    opinet_no: str           # 공개 표준 식별자
    site_cd: Optional[str] = None  # GSC 내부 (None for non-GSC)
    name: str
    addr: str
    sido_nm: str
    sgg_nm: str
    self_yn: str = 'N'
    cvs_yn: str = 'N'
    crwa_yn: str = 'N'           # car wash
    lat: float
    lon: float
    brand_cd: str            # GSC/SK/HD/Hyundai/Self/Other (opinet_codes)

class FuelPrice(BaseModel):
    station_opinet_no: str
    fuel_grade: str
    dt: str
    amount: int
    source: PriceSource      # D15

class Region(BaseModel):
    region_cd: str           # KOSTAT 행정구역코드
    sido_nm: str
    sgg_nm: Optional[str] = None
    level: str = 'sgg'       # sido/sgg

# ── 컴플·외부 (4) ───────────────────────────────────────────────
class Term(BaseModel):
    term_cd: str
    name_kr: str
    required_yn: str = 'N'
    marketing_eligible_yn: str = 'N'

class TermAgreement(BaseModel):
    agreement_id: str
    cust_id: str
    term_cd: str
    approval_dt: str         # 일부 '00000000' 결측 가능
    approval_channel_cd: Optional[str] = None
    approved_yn: str = 'Y'

class ConsumptionIndex(BaseModel):
    cust_id: str
    bonus_card_months: Optional[int] = None
    energy_plus_app_months: Optional[int] = None
    car_need_idx: Optional[float] = None
    gas_station_pref_idx: Optional[float] = None
    car_finance_pref_idx: Optional[float] = None
    # 78개 필드 중 핵심 6개; 나머지는 dict로 보관
    extras: dict = Field(default_factory=dict)

class WeatherObservation(BaseModel):  # D13
    sido_nm: str
    dt: str
    hour: int
    temp_c: Optional[float] = None
    rain_mm: Optional[float] = None
    wind_mps: Optional[float] = None
    pm10_ugm3: Optional[int] = None

# ── 시간 (1) ────────────────────────────────────────────────────
class TimeSlot(BaseModel):
    slot_id: str             # commute_morning/lunch/commute_evening/late_night/weekend
    label_kr: str
    hour_start: int
    hour_end: int
    weekend_yn: str

# ── 메타 ────────────────────────────────────────────────────────
ALL_CLASSES: list[type[BaseModel]] = [
    Customer, Persona, Cluster, Segment, Member,
    FuelTransaction, AppEvent, SurveyResponse, CouponUse, PaymentMethod,
    Campaign, Coupon, Offer, Channel, CampaignSms, CampaignAggregation,
    FuelProduct, GasStation, FuelPrice, Region,
    Term, TermAgreement, ConsumptionIndex, WeatherObservation,
    TimeSlot,
]

# 관계 정의 — 30+ edges (spec §4.2)
ALL_RELATIONS: list[tuple[str, str, str]] = [
    ('Customer', 'HAS_PERSONA', 'Persona'),
    ('Customer', 'BELONGS_TO', 'Cluster'),
    ('Customer', 'IN_SEGMENT', 'Segment'),
    ('Customer', 'IS_MEMBER', 'Member'),
    ('Customer', 'AGREED_TO', 'TermAgreement'),
    ('TermAgreement', 'FOR', 'Term'),
    ('Customer', 'HAS_INDEX', 'ConsumptionIndex'),
    ('Customer', 'USED_APP', 'AppEvent'),
    ('Customer', 'ANSWERED', 'SurveyResponse'),
    ('Customer', 'REFUELED', 'FuelTransaction'),
    ('FuelTransaction', 'AT', 'GasStation'),
    ('GasStation', 'IN', 'Region'),
    ('FuelTransaction', 'OF', 'FuelProduct'),
    ('FuelTransaction', 'VIA', 'PaymentMethod'),
    ('FuelTransaction', 'AT_TIME', 'TimeSlot'),
    ('FuelTransaction', 'USED', 'CouponUse'),
    ('CouponUse', 'OF', 'Coupon'),
    ('Campaign', 'HAS_OFFER', 'Offer'),
    ('Offer', 'ISSUES', 'Coupon'),
    ('Campaign', 'TARGETS_PERSONA', 'Persona'),
    ('Campaign', 'TARGETS_CLUSTER', 'Cluster'),
    ('Campaign', 'TARGETS_SEGMENT', 'Segment'),
    ('Campaign', 'SENT_VIA', 'Channel'),
    ('Coupon', 'REDEEMED_AS', 'CouponUse'),
    ('GasStation', 'PRICED_AT', 'FuelPrice'),
    ('GasStation', 'SELLS', 'FuelProduct'),
    # D17
    ('Campaign', 'SENT_SMS', 'CampaignSms'),
    ('CampaignSms', 'TO', 'Customer'),
    ('Campaign', 'AGGREGATED_AS', 'CampaignAggregation'),
    # D13 (Weather)
    ('Region', 'OBSERVED_WEATHER', 'WeatherObservation'),
    ('WeatherObservation', 'AT_TIME', 'TimeSlot'),
]

assert len(ALL_CLASSES) == 25, "ALL_CLASSES count drift"
assert len(ALL_RELATIONS) >= 30, "ALL_RELATIONS count below spec §4.2"
