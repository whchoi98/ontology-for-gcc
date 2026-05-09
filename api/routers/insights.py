# api/routers/insights.py — 시나리오 C: MD 인사이트 (Code Interpreter + Sonnet 요약)
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from api.services.sse import stream_phases
from api.services.insights_pipeline import (
    aggregate_fuel_grade_trend,
    render_trend_chart,
)
from api.services.bedrock import converse, ConverseRequest
from api.services.persona import system_prompt

router = APIRouter(prefix='/api/insights', tags=['insights'])


class InsightsRequest(BaseModel):
    persona_id: Optional[str] = 'marketing'
    topic: str = 'fuel_grade_trend'


def _summarize(persona_id: Optional[str], rows: list) -> str:
    sys = system_prompt(persona_id, 'C')
    msg = (
        '다음 월별 유종별 거래 데이터를 한국어로 3문장 이내로 요약하라. '
        '출처는 real (FuelTransaction)이다.\n'
        f'데이터: {rows[:30]}'
    )
    try:
        out = converse(ConverseRequest(
            system=sys,
            messages=[{'role': 'user', 'content': [{'text': msg}]}],
        ))
        return out['output']['message']['content'][0]['text']
    except Exception as e:
        return f'(요약 생성 실패: {e})'


@router.post('/stream')
async def stream(req: InsightsRequest) -> StreamingResponse:
    async def gen():
        yield ('phase', {'name': 'aggregating'})
        rows = aggregate_fuel_grade_trend()
        yield ('phase', {'name': 'aggregated', 'count': len(rows)})
        yield ('phase', {'name': 'rendering_chart'})
        png_b64 = render_trend_chart(rows)
        yield ('phase', {'name': 'chart_ready', 'has_chart': bool(png_b64)})
        summary = _summarize(req.persona_id, rows)
        yield ('result', {
            'chart_png_b64': png_b64,
            'summary': summary,
            'rows': rows,
        })

    return StreamingResponse(
        stream_phases(gen()), media_type='text/event-stream',
    )
