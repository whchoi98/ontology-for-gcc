"""Plan 5 Task 5.3.1 — Operational metrics for the ops console.

In-process buffer for guardrail violations + Neptune count probes + agent trace tail.
Defensive — Neptune unreachable returns -1; no exception leaks.
"""
from __future__ import annotations
from collections import deque
from typing import Iterable

# guardrail violation 누적 (in-process — Plan 5에선 단순 buffer)
_GUARDRAIL_BUF: deque = deque(maxlen=200)


def push_guardrail(source: str, violations: Iterable[str], snippet: str) -> None:
    """Hook called by chat router on each guardrail INPUT/OUTPUT decision."""
    _GUARDRAIL_BUF.append({
        'source': source,
        'violations': list(violations),
        'snippet': (snippet or '')[:120],
    })


def ingest_counts() -> dict:
    """Per-class Neptune node count for 17 representative labels."""
    labels = [
        'Customer', 'FuelTransaction', 'GasStation', 'FuelPrice', 'Campaign',
        'Coupon', 'CouponUse', 'Term', 'TermAgreement', 'AppEvent',
        'SurveyResponse', 'WeatherObservation', 'Cluster', 'Segment', 'Member',
        'CampaignSms', 'CampaignAggregation',
    ]
    out = []
    for lab in labels:
        try:
            from api.services.neptune import open_cypher
            res = open_cypher(f'MATCH (n:{lab}) RETURN count(n) AS c')
            cnt = int(res.get('results', [{}])[0].get('c', 0))
        except Exception:
            cnt = -1
        out.append({'class': lab, 'count': cnt})
    return {'counts': out}


def memory_snapshot(persona_id: str = 'marketing', limit: int = 10) -> dict:
    """AgentCore Memory recent events (간이판 — full mem.list_events deferred)."""
    return {
        'note': 'AgentCore Memory namespace=gcc · short(session) + long(7d). '
                'Full event listing deferred — uses mem.list_events upstream.',
        'persona_id': persona_id,
        'limit': limit,
    }


def eval_scoreboard() -> dict:
    """eval_wow_queries.py 결과 latest.json (Plan 5에서 nightly run)."""
    import json
    from pathlib import Path
    p = Path('.harness-eval/eval-latest.json')
    if not p.exists():
        return {'scenarios': [], 'overall_pass_pct': 0,
                'note': 'no eval-latest.json yet — run scripts/eval_wow_queries.py first'}
    try:
        return json.loads(p.read_text(encoding='utf-8'))
    except Exception as e:
        return {'scenarios': [], 'overall_pass_pct': 0, 'error': str(e)[:200]}


def trace_timeline() -> dict:
    """Recent tool-call trace from agent.py ring buffer."""
    try:
        from api.services.agent import get_trace_buf
        return {'trace': get_trace_buf()[-100:]}
    except Exception as e:
        return {'trace': [], 'error': str(e)[:200]}


def guardrail_log() -> dict:
    return {'guardrail': list(_GUARDRAIL_BUF)}
