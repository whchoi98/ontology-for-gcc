"""5 부서 페르소나 SSOT — 시나리오 가중치·KPI·system prompt 어조.

ADR 0007 참조. 모든 라우터·시스템 프롬프트가 이 한 곳을 lookup.
"""
from __future__ import annotations
from typing import Literal, Optional

PersonaId = Literal['marketing', 'strategy', 'data-ai', 'crm', 'retail-ops']


PERSONA_REGISTRY: dict = {
    'marketing': {
        'name_kr': '마케팅',
        'kpi_focus': ['conversion', 'roas', 'reach', 'campaign_lift'],
        'tone': '캠페인 효율과 마케팅 성과를 분석하는 시니어 마케터의 어조',
        'scenario_priority': ['B', 'C', 'E', 'F', 'G', 'J', 'K', 'M', 'N', 'A'],
        'default_cohort': ['*'],
    },
    'strategy': {
        'name_kr': '고객전략',
        'kpi_focus': ['retention', 'clv', 'segment_size', 'compliance_rate'],
        'tone': '세그먼트·전략·약관 컴플라이언스를 깊이 보는 고객전략 매니저',
        'scenario_priority': ['D', 'E', 'H', 'I', 'J', 'K', 'M', 'A', 'C'],
        'default_cohort': ['deep-history', 'coupon-only'],
    },
    'data-ai': {
        'name_kr': '데이터·AI',
        'kpi_focus': ['cluster_quality', 'model_lift', 'data_completeness'],
        'tone': 'sklearn·embeddings·fairness를 다루는 데이터 사이언티스트',
        'scenario_priority': ['C', 'E', 'F', 'G', 'J', 'K', 'L', 'M', 'N'],
        'default_cohort': ['*'],
    },
    'crm': {
        'name_kr': 'CRM·회원사업',
        'kpi_focus': ['member_active', 'points_earned', 'plcc_attach'],
        'tone': '멤버십 등급·포인트·PLCC 보유율을 추적하는 CRM 매니저',
        'scenario_priority': ['B', 'D', 'F', 'G', 'I', 'L', 'M'],
        'default_cohort': ['deep-history', 'coupon-only'],
    },
    'retail-ops': {
        'name_kr': '리테일영업',
        'kpi_focus': ['station_volume', 'margin_pct', 'self_rate'],
        'tone': '주유소 운영·매출·셀프 비율을 보는 영업 매니저',
        'scenario_priority': ['C', 'H', 'L', 'N'],
        'default_cohort': ['deep-history', 'sales-only'],
    },
}


def get(persona_id: Optional[str]) -> dict:
    """Lookup persona; defaults to 'marketing' on unknown / None."""
    pid = persona_id if persona_id in PERSONA_REGISTRY else 'marketing'
    return {**PERSONA_REGISTRY[pid], 'persona_id': pid}


def system_prompt(persona_id: Optional[str], scenario_code: str) -> str:
    """Compose system prompt with persona tone + KPI focus + scenario code."""
    p = get(persona_id)
    return (
        f'당신은 GS Caltex 사내 데이터 분석을 돕는 AI Agent입니다. '
        f'사용자는 {p["name_kr"]} 부서이며, 어조는 다음과 같습니다: {p["tone"]}. '
        f'현재 시나리오 코드는 {scenario_code}이며 KPI 우선순위는 '
        f'{", ".join(p["kpi_focus"])} 입니다. '
        f'데이터 인사이트를 제시할 때 출처(real/synthetic/external)를 항상 명시하세요.'
    )
