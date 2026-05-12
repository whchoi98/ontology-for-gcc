"""CI subset of wow-query evaluation (mocked).

Full 30-query live eval: `scripts/eval_wow_queries.py` (requires deployed CloudFront).
"""
from __future__ import annotations

import json
import os

os.environ.setdefault('DEMO_PUBLIC_MODE', 'true')

from typing import Any, Callable, Literal
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)

Persona = Literal["marketing", "strategy", "data-ai", "crm", "retail-ops"]


class WowQueryCase(dict):
    persona: Persona
    query: str
    fake: dict[str, Any]
    expects: Callable[[dict], bool]


WOW_SEARCH_CASES: list[dict[str, Any]] = [
    {
        'persona': 'marketing',
        'query': '고급휘발유에 충성도가 높은 30대 직장인',
        'fake': {
            'query': '고급휘발유에 충성도가 높은 30대 직장인',
            'persona_id': 'marketing',
            'results': [
                {'id': 'C001', 'text': 'premium 고객 1'},
                {'id': 'C002', 'text': 'premium 고객 2'},
                {'id': 'C003', 'text': '고급휘발유 충성 30대'},
            ],
            'subgraph': {'nodes': [], 'edges': []},
        },
        'expects': lambda r: any(
            'premium' in str(x).lower() or '고급' in str(x)
            for x in r.get('results', [])
        ),
    },
    {
        'persona': 'strategy',
        'query': '약관 동의 안 한 고객 중 매출 활발한 사람',
        'fake': {
            'query': '약관 동의 안 한 고객 중 매출 활발한 사람',
            'persona_id': 'strategy',
            'results': [
                {'id': 'C100', 'text': '약관 미동의'},
                {'id': 'C101', 'text': '약관 거부 + 매출 100K+'},
            ],
            'subgraph': {
                'nodes': [{'id': 't-tos-1', 'type': 'Term', 'label': '약관'}],
                'edges': [],
            },
        },
        'expects': lambda r: len(r.get('results', [])) >= 2 and any(
            'term' in str(x).lower() or '약관' in str(x)
            for x in r.get('subgraph', {}).get('nodes', [])
        ),
    },
    {
        'persona': 'data-ai',
        'query': '디젤에서 고급휘발유로 전환한 고객',
        'fake': {
            'query': '디젤에서 고급휘발유로 전환한 고객',
            'persona_id': 'data-ai',
            'results': [
                {'id': 'C200', 'text': 'diesel→premium 전환 추적'},
                {'id': 'C201', 'text': 'premium 신규 가입 30대'},
            ],
            'subgraph': {'nodes': [], 'edges': []},
        },
        'expects': lambda r: (
            'diesel' in json.dumps(r).lower()
            and 'premium' in json.dumps(r).lower()
        ),
    },
    {
        'persona': 'crm',
        'query': 'PLCC 보유 고객의 평균 객단가',
        'fake': {
            'query': 'PLCC 보유 고객의 평균 객단가',
            'persona_id': 'crm',
            'results': [
                {'id': 'C300', 'text': 'PLCC 보유 객단가 75,000원'},
            ],
            'subgraph': {'nodes': [], 'edges': []},
        },
        'expects': lambda r: any(
            'PLCC' in str(x) for x in r.get('results', [])
        ),
    },
    {
        'persona': 'retail-ops',
        'query': '셀프 주유소 매출 상위 시도',
        'fake': {
            'query': '셀프 주유소 매출 상위 시도',
            'persona_id': 'retail-ops',
            'results': [
                {'id': 'S001', 'text': '셀프 주유소 매출 1위 서울'},
                {'id': 'S002', 'text': 'self-service 경기 상위'},
            ],
            'subgraph': {'nodes': [], 'edges': []},
        },
        'expects': lambda r: any(
            'self' in str(x).lower() or '셀프' in str(x)
            for x in r.get('results', [])
        ),
    },
]


def _ids(case: dict[str, Any]) -> str:
    return f"{case['persona']}::{case['query'][:30]}"


@pytest.mark.parametrize('case', WOW_SEARCH_CASES, ids=_ids)
def test_wow_search_query_contract(case: dict[str, Any]) -> None:
    with patch('api.routers.search._run_search', return_value=case['fake']):
        r = client.post(
            '/api/search',
            json={'query': case['query'], 'persona_id': case['persona']},
        )

    assert r.status_code == 200, f"HTTP {r.status_code} for {_ids(case)}"
    body = r.json()

    for key in ('query', 'persona_id', 'results', 'subgraph'):
        assert key in body, f"response missing '{key}': {body}"

    expects: Callable[[dict], bool] = case['expects']
    assert expects(body), (
        f"expects predicate failed for {_ids(case)} — "
        f"results={body.get('results')!r} subgraph={body.get('subgraph')!r}"
    )
