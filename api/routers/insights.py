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
    """5 섹션 markdown 상세 인사이트 — 짧고 정량적으로 (CloudFront 30초 timeout 회피)."""
    sys = system_prompt(persona_id, 'C')
    # rows를 30개로 자른다 — Sonnet input token 절감 + 응답 시간 단축.
    sample = rows[:30]
    msg = (
        '다음은 월별 유종별 거래 데이터입니다 (출처 real:FuelTransaction).\n'
        f'데이터: {sample}\n\n'
        '5 섹션 markdown으로 작성하라. 각 섹션 2-3문장 이내, 정량 수치 포함:\n'
        '## 헤드라인\n## 시계열 트렌드\n## 유종별 비중\n## 비즈니스 함의\n## 부서 권고 (3건)\n\n'
        '부서 페르소나 KPI 시점 적용. 출처 (real:FuelTransaction) 표기.'
    )
    try:
        out = converse(ConverseRequest(
            system=sys,
            messages=[{'role': 'user', 'content': [{'text': msg}]}],
            max_tokens=2048,
        ))
        return out['output']['message']['content'][0]['text']
    except Exception as e:
        return f'(요약 생성 실패: {type(e).__name__}: {e})'


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
