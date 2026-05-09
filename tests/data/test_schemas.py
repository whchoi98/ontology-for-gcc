"""Validate that data/schemas.py has the 25 Pydantic classes + 30+ relations
required by Plan 2 Phase 2.1 spec (D11·D13·D17 SSOT)."""
import pytest
from data.schemas import (
    Customer, Persona, Cluster, Segment, Member,
    FuelTransaction, AppEvent, SurveyResponse, CouponUse, PaymentMethod,
    Campaign, Coupon, Offer, Channel, CampaignSms, CampaignAggregation,
    FuelProduct, GasStation, FuelPrice, Region,
    Term, TermAgreement, ConsumptionIndex, WeatherObservation,
    TimeSlot,
    ALL_CLASSES, ALL_RELATIONS,
)


def test_25_classes_registered():
    assert len(ALL_CLASSES) == 25, f"expected 25, got {len(ALL_CLASSES)}"


def test_customer_15_attrs():
    c = Customer(
        cust_id='c001', age_val=35, age_section_cd='30', gender_cd='M',
        sido_nm='서울', sgg_nm='강남구', work_sgg='강남구',
        occupation_cd='OFC', vip_yn='N', primary_site_cd='S001',
        member_grade='Gold', kixx_join_dt='20210501',
        bns_card_join_dt='20210501', mail_recv_yn='Y', plcc_yn='N',
        data_depth='deep-history',
    )
    assert c.cust_id == 'c001'
    assert c.data_depth in {'deep-history', 'coupon-only', 'sales-only', 'lookalike-syn'}


def test_fuel_price_source_tag():
    p = FuelPrice(station_opinet_no='A12345', fuel_grade='premium',
                  dt='20260501', amount=1850, source='real')
    assert p.source in {'real', 'synthetic'}


def test_weather_observation_structure():
    w = WeatherObservation(sido_nm='서울', dt='20260501', hour=12,
                           temp_c=22.5, rain_mm=0.0, wind_mps=2.1, pm10_ugm3=45)
    assert w.temp_c == 22.5


def test_relations_count():
    assert len(ALL_RELATIONS) >= 30, f"need 30+ edge defs, got {len(ALL_RELATIONS)}"
