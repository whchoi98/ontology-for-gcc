"""TOOL_SPECS 단일 등록점 + dispatch + 트레이스 ring buffer.

Plan 3 Task 3.4.1 / ADR 0006. Replaces the legacy mfg-template AgentRunner.
"""
from __future__ import annotations
from collections import deque
from typing import Any, Optional

_TRACE_BUF: deque = deque(maxlen=200)


def trace_log(name: str, input: dict, output: Any, ms: int) -> None:
    _TRACE_BUF.append({'tool': name, 'input': input, 'output': output, 'ms': ms})


def get_trace_buf() -> list:
    return list(_TRACE_BUF)


TOOL_SPECS: list = [
    {'toolSpec': {
        'name': 'memory_recall',
        'description': (
            'AgentCore Memory의 long-term namespace에서 의미적으로 관련된 과거 대화·인사이트를 '
            '회상한다. 마케터가 "지난번에 말씀드렸던..." 처럼 컨텍스트 회복할 때 사용.'
        ),
        'inputSchema': {'json': {
            'type': 'object',
            'properties': {
                'query': {'type': 'string'},
                'top_k': {'type': 'integer', 'default': 5},
            },
            'required': ['query'],
        }},
    }},
    {'toolSpec': {
        'name': 'neptune_subgraph',
        'description': (
            '특정 노드 ID를 시드로 1-hop 또는 2-hop subgraph를 가져온다. '
            '페르소나·시나리오에 적합한 cohort 필터(data_depth)를 자동 적용.'
        ),
        'inputSchema': {'json': {
            'type': 'object',
            'properties': {
                'seed_ids': {'type': 'array', 'items': {'type': 'string'}},
                'hops': {'type': 'integer', 'default': 1},
            },
            'required': ['seed_ids'],
        }},
    }},
    {'toolSpec': {
        'name': 'semantic_search',
        'description': '자연어 query로 의미 검색 (시나리오 A 재사용). 결과는 reranked 문서 리스트.',
        'inputSchema': {'json': {
            'type': 'object',
            'properties': {
                'query': {'type': 'string'},
                'size': {'type': 'integer', 'default': 10},
            },
            'required': ['query'],
        }},
    }},
    {'toolSpec': {
        'name': 'kb_lookup',
        'description': 'Bedrock Knowledge Base에서 정책·약관·매뉴얼 문서 조회.',
        'inputSchema': {'json': {
            'type': 'object',
            'properties': {
                'query': {'type': 'string'},
                'top_k': {'type': 'integer', 'default': 3},
            },
            'required': ['query'],
        }},
    }},
    {'toolSpec': {
        'name': 'customer_lookup',
        'description': '비식별고객번호로 단일 고객 노드 + 주요 행동 요약 (최근 거래·약관·앱 활동).',
        'inputSchema': {'json': {
            'type': 'object',
            'properties': {'cust_id': {'type': 'string'}},
            'required': ['cust_id'],
        }},
    }},
    {'toolSpec': {
        'name': 'cluster_predict',
        'description': '고객 set의 클러스터 분포·각 클러스터의 행동 특징 요약 반환. 시나리오 E와 연계.',
        'inputSchema': {'json': {
            'type': 'object',
            'properties': {
                'cust_ids': {'type': 'array', 'items': {'type': 'string'}},
            },
            'required': ['cust_ids'],
        }},
    }},
    {'toolSpec': {
        'name': 'nearest_stations',
        'description': '위경도·반경(km)을 받아 haversine k-NN으로 GSC + 경쟁사 주유소 반환.',
        'inputSchema': {'json': {
            'type': 'object',
            'properties': {
                'lat': {'type': 'number'},
                'lon': {'type': 'number'},
                'radius_km': {'type': 'number', 'default': 5.0},
                'k': {'type': 'integer', 'default': 10},
            },
            'required': ['lat', 'lon'],
        }},
    }},
    {'toolSpec': {
        'name': 'campaign_simulator',
        'description': (
            '쿠폰 액수·타겟 cohort를 받아 예상 전환률·매출·ROI 시뮬레이션. '
            'CampaignAggregation의 사전계산 KPI를 reference.'
        ),
        'inputSchema': {'json': {
            'type': 'object',
            'properties': {
                'coupon_amt': {'type': 'integer'},
                'target_segment_id': {'type': 'string'},
                'duration_days': {'type': 'integer', 'default': 30},
            },
            'required': ['coupon_amt', 'target_segment_id'],
        }},
    }},
    {'toolSpec': {
        'name': 'lookalike_expand',
        'description': '시드 고객 set에서 임베딩 유사도 상위 X% 추출 (시나리오 F와 연계).',
        'inputSchema': {'json': {
            'type': 'object',
            'properties': {
                'seed_cust_ids': {'type': 'array', 'items': {'type': 'string'}},
                'top_pct': {'type': 'number', 'default': 0.20},
            },
            'required': ['seed_cust_ids'],
        }},
    }},
    {'toolSpec': {
        'name': 'behavior_change_detect',
        'description': (
            '시계열 행동 변화 패턴 자동 검출 (디젤→고급휘발유 전환, PM+M 92 RON 혼유 등). '
            'PDF 3페이지의 시그니처 인사이트.'
        ),
        'inputSchema': {'json': {
            'type': 'object',
            'properties': {
                'pattern': {
                    'type': 'string',
                    'enum': ['fuel_grade_transition', 'pm_m_mixing', 'app_signup_after_install'],
                },
                'cohort_filter': {
                    'type': 'array',
                    'items': {'type': 'string'},
                    'description': 'data_depth filter (e.g. ["deep-history"])',
                },
            },
            'required': ['pattern'],
        }},
    }},
]
assert len({t['toolSpec']['name'] for t in TOOL_SPECS}) == 10, '10 unique tools required'


def dispatch(
    name: str,
    input: dict,
    persona_id: str,
    session_id: str,
    cust_id: Optional[str],
) -> dict:
    """Route a single tool call to the matching `tools/<name>.py` module.

    Records every call into ``_TRACE_BUF`` (with ms duration) and returns the
    tool's output dict. Unknown tool names produce ``{'error': ...}``.
    """
    import time
    t0 = time.monotonic()
    from api.services.tools import (
        memory_recall, neptune_subgraph, semantic_search, kb_lookup,
        customer_lookup, cluster_predict, nearest_stations,
        campaign_simulator, lookalike_expand, behavior_change_detect,
    )
    routes = {
        'memory_recall': memory_recall.run,
        'neptune_subgraph': neptune_subgraph.run,
        'semantic_search': semantic_search.run,
        'kb_lookup': kb_lookup.run,
        'customer_lookup': customer_lookup.run,
        'cluster_predict': cluster_predict.run,
        'nearest_stations': nearest_stations.run,
        'campaign_simulator': campaign_simulator.run,
        'lookalike_expand': lookalike_expand.run,
        'behavior_change_detect': behavior_change_detect.run,
    }
    fn = routes.get(name)
    if not fn:
        return {'error': f'unknown tool: {name}'}
    out = fn(input, persona_id=persona_id, session_id=session_id, cust_id=cust_id)
    ms = int((time.monotonic() - t0) * 1000)
    trace_log(name, input, out, ms)
    return out
