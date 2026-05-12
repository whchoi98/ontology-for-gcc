# api/routers/persona_match.py — 시나리오 D: 페르소나 매칭
# (Customer KPI × PERSONA_REGISTRY 5 부서 가중치)
from __future__ import annotations
from typing import List, Optional

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.services.persona import PERSONA_REGISTRY
from api.services.neptune import open_cypher
from api.services.insight_summary import summarize, summarize_stream
from api.services.sse import stream_phases

router = APIRouter(prefix='/api/persona-match', tags=['persona_match'])


class MatchRequest(BaseModel):
    cust_ids: List[str] = []
    persona_id: Optional[str] = 'marketing'


def _query_and_score(cust_ids: List[str]) -> tuple[list, dict, dict]:
    """Returns (matches, avg_scores, best_counts)."""
    if not cust_ids:
        return [], {}, {}
    q = """UNWIND $ids AS id
           MATCH (c:Customer {cust_id: id})
           OPTIONAL MATCH (t:FuelTransaction {cust_id: id})
           RETURN c.cust_id AS cust_id, c.vip_yn AS vip,
                  count(t) AS tx_count, sum(t.amount) AS total_amt"""
    rows = open_cypher(query=q, parameters={'ids': cust_ids}).get('results', [])
    matches = []
    for row in rows:
        scores: dict = {}
        for pid, p in PERSONA_REGISTRY.items():
            base = 0.0
            if 'roas' in p['kpi_focus']:
                base += min((row.get('total_amt', 0) or 0) / 1_000_000, 1.0) * 0.4
            if 'retention' in p['kpi_focus']:
                base += min((row.get('tx_count', 0) or 0) / 100, 1.0) * 0.3
            if 'plcc_attach' in p['kpi_focus'] and row.get('vip') == 'Y':
                base += 0.3
            if 'station_volume' in p['kpi_focus']:
                base += min((row.get('tx_count', 0) or 0) / 50, 1.0) * 0.25
            if 'cluster_quality' in p['kpi_focus']:
                base += 0.15
            scores[pid] = round(base, 3)
        best = max(scores.items(), key=lambda kv: kv[1])
        matches.append({
            'cust_id': row['cust_id'],
            'best_persona': best[0],
            'all_scores': scores,
        })
    avg_scores: dict[str, float] = {}
    for pid in PERSONA_REGISTRY.keys():
        ss = [m['all_scores'].get(pid, 0) for m in matches]
        avg_scores[pid] = round(sum(ss) / max(len(ss), 1), 3)
    best_counts: dict[str, int] = {}
    for m in matches:
        best_counts[m['best_persona']] = best_counts.get(m['best_persona'], 0) + 1
    return matches, avg_scores, best_counts


def _data_summary(matches: list, avg_scores: dict, best_counts: dict) -> str:
    return (
        f"고객 {len(matches)}명 매칭 결과. "
        f"부서별 평균 점수: {avg_scores}. "
        f"best_persona 분포: {best_counts}."
    )


@router.post('')
def match(req: MatchRequest) -> dict:
    """Legacy JSON endpoint (kept for backward compat — primary clients should
    use /stream for live pipeline visibility)."""
    matches, avg_scores, best_counts = _query_and_score(req.cust_ids)
    if not matches:
        return {'matches': []}
    summary = summarize(
        req.persona_id, 'D', '페르소나 매칭',
        _data_summary(matches, avg_scores, best_counts),
        sources=['real:Customer', 'real:FuelTransaction'],
        extra_instruction='best_persona 분포에서 부서별 차별화 의미를 분석하고, margin이 큰 고객의 마케팅 가치를 부서 시점에서 해석.',
    )
    return {'matches': matches, 'summary': summary,
            'avg_scores': avg_scores, 'best_counts': best_counts}


@router.post('/stream')
async def match_stream(req: MatchRequest) -> StreamingResponse:
    """SSE pipeline:
      querying_neptune → query_done → scoring → compute_done →
      summary_streaming (delta) → summary_done → result."""
    async def gen():
        yield ('phase', {'name': 'querying_neptune',
                         'desc': f'{len(req.cust_ids)}명 Customer 조회'})
        matches, avg_scores, best_counts = _query_and_score(req.cust_ids)
        yield ('phase', {'name': 'query_done', 'count': len(matches)})

        if not matches:
            yield ('result', {'matches': [], 'avg_scores': {}, 'best_counts': {},
                              'summary': ''})
            return

        yield ('phase', {'name': 'scoring',
                         'desc': f'{len(PERSONA_REGISTRY)} 부서 KPI 가중치 매칭'})
        # scoring already happened inside _query_and_score
        yield ('phase', {'name': 'compute_done', 'count': len(matches)})

        yield ('phase', {'name': 'summary_streaming'})
        summary_chunks: list[str] = []
        for chunk in summarize_stream(
            req.persona_id, 'D', '페르소나 매칭',
            _data_summary(matches, avg_scores, best_counts),
            sources=['real:Customer', 'real:FuelTransaction'],
            extra_instruction='best_persona 분포에서 부서별 차별화 의미를 분석하고, margin이 큰 고객의 마케팅 가치를 부서 시점에서 해석.',
        ):
            summary_chunks.append(chunk)
            yield ('delta', {'channel': 'summary', 'text': chunk})
        summary = ''.join(summary_chunks)
        yield ('phase', {'name': 'summary_done', 'len': len(summary)})

        yield ('result', {
            'matches': matches,
            'avg_scores': avg_scores,
            'best_counts': best_counts,
            'summary': summary,
        })

    return StreamingResponse(stream_phases(gen()), media_type='text/event-stream')
