# api/routers/lookalike.py — 시나리오 F: 룩어라이크 익스팬션
from __future__ import annotations
from typing import List, Optional
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from api.services.tools.lookalike_expand import run as lookalike_run
from api.services.insight_summary import summarize, summarize_stream
from api.services.sse import stream_phases

router = APIRouter(prefix='/api/lookalike', tags=['lookalike'])


class LookalikeRequest(BaseModel):
    seed_cust_ids: List[str]
    top_pct: float = 0.20
    persona_id: Optional[str] = 'data-ai'


def _profile_dists(profiles: list) -> tuple[dict, dict, dict]:
    age_dist: dict = {}; grade_dist: dict = {}; sido_dist: dict = {}
    for p in profiles:
        age = p.get('age')
        if age:
            bucket = f'{(age // 10) * 10}대'
            age_dist[bucket] = age_dist.get(bucket, 0) + 1
        if p.get('grade'):
            grade_dist[p['grade']] = grade_dist.get(p['grade'], 0) + 1
        if p.get('sido'):
            sido_dist[p['sido']] = sido_dist.get(p['sido'], 0) + 1
    return age_dist, grade_dist, sido_dist


def _data_summary(req: LookalikeRequest, out: dict) -> str:
    profiles = out.get('expanded_profiles') or []
    age_dist, grade_dist, sido_dist = _profile_dists(profiles)
    top_sido = dict(sorted(sido_dist.items(), key=lambda kv: -kv[1])[:5])
    return (
        f"seed {len(req.seed_cust_ids)}명 → 확장 {out.get('count', 0)}명 (top {int(req.top_pct*100)}%). "
        f"상위 50명 프로필 분포 — 연령: {age_dist}, 등급: {grade_dist}, 시도 상위: {top_sido}."
    )


_SOURCES = ['real:Customer', 'synthetic:LookalikeCohort', 'OpenSearch:Cohere-v4-KNN']
_EXTRA = 'seed cohort 특성 vs 확장 cohort 차이를 분석. 캠페인 타겟팅 활용 시 권고.'


@router.post('')
def expand(req: LookalikeRequest) -> dict:
    out = lookalike_run(
        {'seed_cust_ids': req.seed_cust_ids, 'top_pct': req.top_pct},
        persona_id=req.persona_id or 'data-ai',
        session_id='web', cust_id=None,
    )
    out['summary'] = summarize(
        req.persona_id, 'F', '룩어라이크 확장', _data_summary(req, out),
        sources=_SOURCES, extra_instruction=_EXTRA,
    )
    return out


@router.post('/stream')
async def expand_stream(req: LookalikeRequest) -> StreamingResponse:
    """SSE: embedding → similarity → ranking → summary_streaming → result."""
    async def gen():
        yield ('phase', {'name': 'embedding',
                         'desc': f'seed {len(req.seed_cust_ids)}명 임베딩'})
        out = lookalike_run(
            {'seed_cust_ids': req.seed_cust_ids, 'top_pct': req.top_pct},
            persona_id=req.persona_id or 'data-ai',
            session_id='web', cust_id=None,
        )
        yield ('phase', {'name': 'similarity', 'count': out.get('count', 0)})
        yield ('phase', {'name': 'compute_done',
                         'desc': f'top {int(req.top_pct*100)}% 확장 완료'})

        yield ('phase', {'name': 'summary_streaming'})
        chunks: list[str] = []
        for chunk in summarize_stream(
            req.persona_id, 'F', '룩어라이크 확장', _data_summary(req, out),
            sources=_SOURCES, extra_instruction=_EXTRA,
        ):
            chunks.append(chunk)
            yield ('delta', {'channel': 'summary', 'text': chunk})
        summary = ''.join(chunks)
        yield ('phase', {'name': 'summary_done', 'len': len(summary)})

        yield ('result', {**out, 'summary': summary})

    return StreamingResponse(stream_phases(gen()), media_type='text/event-stream')
