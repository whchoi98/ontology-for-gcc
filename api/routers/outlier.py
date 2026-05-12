# api/routers/outlier.py — 시나리오 K: Outlier · 행동 변화 탐지 (PDF 3페이지 시그니처)
from __future__ import annotations
from typing import List, Optional

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.services.tools.behavior_change_detect import run as detect_run
from api.services.cohort import select
from api.services.insight_summary import summarize, summarize_stream
from api.services.sse import stream_phases

router = APIRouter(prefix='/api/outlier', tags=['outlier'])


class OutlierRequest(BaseModel):
    pattern: str  # 'pm_m_mixing' | 'fuel_grade_transition' | 'app_signup_after_install'
    persona_id: Optional[str] = 'data-ai'
    cohort_filter: Optional[List[str]] = None


_PATTERN_LABELS = {
    'pm_m_mixing': 'PM+M 혼유 (92 RON DIY)',
    'fuel_grade_transition': '디젤→premium 유종 전환',
    'app_signup_after_install': '앱 설치 후 가입',
}
_SOURCES = ['real:Customer', 'real:FuelTransaction']
_EXTRA = '해당 패턴이 비즈니스에 의미하는 바, false positive 가능성, 추가 후속 액션 (캠페인·CS·데이터 정제) 권고.'


def _data_summary(req: OutlierRequest, cohort: List[str], out: dict) -> str:
    pattern_label = _PATTERN_LABELS.get(req.pattern, req.pattern)
    matches_count = out.get('matches_count') or out.get('count') or len(out.get('matches', []))
    return (
        f"패턴: {pattern_label}. cohort_filter={cohort}, "
        f"cohort_size={out.get('cohort_size')}, coverage={out.get('coverage')}, "
        f"matches={matches_count}. sample matches: {out.get('matches', [])[:5]}."
    )


@router.post('/detect')
def detect(req: OutlierRequest) -> dict:
    cohort = req.cohort_filter or select(req.persona_id or 'data-ai', 'K')
    out = detect_run(
        {'pattern': req.pattern, 'cohort_filter': cohort},
        persona_id=req.persona_id or 'data-ai', session_id='web', cust_id=None,
    )
    pattern_label = _PATTERN_LABELS.get(req.pattern, req.pattern)
    out['summary'] = summarize(
        req.persona_id, 'K', f'{pattern_label} 이상 행동 탐지',
        _data_summary(req, cohort, out),
        sources=_SOURCES, extra_instruction=_EXTRA,
    )
    return out


@router.post('/detect-stream')
async def detect_stream(req: OutlierRequest) -> StreamingResponse:
    """SSE: cohort_select → detecting → compute_done → summary_streaming → result."""
    async def gen():
        cohort = req.cohort_filter or select(req.persona_id or 'data-ai', 'K')
        yield ('phase', {'name': 'querying',
                         'desc': f'cohort {len(cohort)}명 선정'})
        pattern_label = _PATTERN_LABELS.get(req.pattern, req.pattern)
        yield ('phase', {'name': 'detecting',
                         'desc': f'시그니처 매칭: {pattern_label}'})
        out = detect_run(
            {'pattern': req.pattern, 'cohort_filter': cohort},
            persona_id=req.persona_id or 'data-ai', session_id='web', cust_id=None,
        )
        matches_count = out.get('matches_count') or out.get('count') or len(out.get('matches', []))
        yield ('phase', {'name': 'compute_done',
                         'desc': f'매치 {matches_count}건'})

        yield ('phase', {'name': 'summary_streaming'})
        chunks: list[str] = []
        for chunk in summarize_stream(
            req.persona_id, 'K', f'{pattern_label} 이상 행동 탐지',
            _data_summary(req, cohort, out),
            sources=_SOURCES, extra_instruction=_EXTRA,
        ):
            chunks.append(chunk)
            yield ('delta', {'channel': 'summary', 'text': chunk})
        summary = ''.join(chunks)
        yield ('phase', {'name': 'summary_done', 'len': len(summary)})

        yield ('result', {**out, 'summary': summary})

    return StreamingResponse(stream_phases(gen()), media_type='text/event-stream')
