# api/routers/journey.py — 시나리오 M: 고객 통합 여정 (PDF 3페이지 시그니처)
from __future__ import annotations
from typing import Optional

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.services.journey_pipeline import build_journey
from api.services.insight_summary import summarize, summarize_stream
from api.services.sse import stream_phases

router = APIRouter(prefix='/api/journey', tags=['journey'])


class JourneyRequest(BaseModel):
    cust_id: str
    persona_id: Optional[str] = 'marketing'


_SOURCES = ['real:Customer', 'real:FuelTransaction', 'real:AppEvent', 'real:CouponUse', 'real:TermAgreement']
_EXTRA = '유종 전환 (PDF 3페이지 PM+M 92 RON DIY 시그니처)이 있다면 그 시점의 행동 변화 의미와 캠페인 기회 분석.'


def _data_summary(req: JourneyRequest, out: dict) -> str:
    profile = out.get('profile') or {}
    props = profile.get('~properties') if isinstance(profile, dict) else {}
    if not props and isinstance(profile, dict):
        props = profile
    events = out.get('events') or []
    transitions = out.get('fuel_grade_transitions') or []
    by_source: dict = {}
    for e in events:
        s = e.get('source') or '?'
        by_source[s] = by_source.get(s, 0) + 1
    return (
        f"cust_id={req.cust_id}, 프로필: age={props.get('age_val')}, "
        f"gender={props.get('gender_cd')}, sido={props.get('sido_nm')}, "
        f"grade={props.get('member_grade')}, vip={props.get('vip_yn')}, "
        f"depth={props.get('data_depth')}. "
        f"이벤트 {len(events)}건 (source 분포: {by_source}), "
        f"유종 전환 {len(transitions)}건: {transitions[:3]}."
    )


@router.post('')
def journey(req: JourneyRequest) -> dict:
    out = build_journey(req.cust_id)
    out['summary'] = summarize(
        req.persona_id, 'M', '고객 통합 여정', _data_summary(req, out),
        sources=_SOURCES, extra_instruction=_EXTRA,
    )
    return out


@router.post('/stream')
async def journey_stream(req: JourneyRequest) -> StreamingResponse:
    """SSE: querying_neptune → merging (4 source timeline) → compute_done → summary_streaming → result."""
    async def gen():
        yield ('phase', {'name': 'querying_neptune',
                         'desc': f'cust_id={req.cust_id} 4-source 조회'})
        out = build_journey(req.cust_id)
        events = out.get('events') or []
        transitions = out.get('fuel_grade_transitions') or []
        yield ('phase', {'name': 'merging',
                         'desc': f'{len(events)} 이벤트 시계열 merge'})
        yield ('phase', {'name': 'compute_done',
                         'desc': f'유종 전환 {len(transitions)}건 탐지'})

        yield ('phase', {'name': 'summary_streaming'})
        chunks: list[str] = []
        for chunk in summarize_stream(
            req.persona_id, 'M', '고객 통합 여정', _data_summary(req, out),
            sources=_SOURCES, extra_instruction=_EXTRA,
        ):
            chunks.append(chunk)
            yield ('delta', {'channel': 'summary', 'text': chunk})
        summary = ''.join(chunks)
        yield ('phase', {'name': 'summary_done', 'len': len(summary)})

        yield ('result', {**out, 'summary': summary})

    return StreamingResponse(stream_phases(gen()), media_type='text/event-stream')
