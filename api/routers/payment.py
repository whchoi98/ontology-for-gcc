# api/routers/payment.py — 시나리오 L: 결제·가격·채널 분석
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from api.services.neptune import open_cypher
from api.services.insight_summary import summarize, summarize_stream
from api.services.sse import stream_phases

router = APIRouter(prefix='/api/payment', tags=['payment'])


class AnalyzeRequest(BaseModel):
    persona_id: Optional[str] = 'retail-ops'
    fuel_grade: Optional[str] = None
    sido_nm: Optional[str] = None


_SOURCES = ['real:FuelTransaction', 'real:PaymentMethod', 'real:GasStation']
_EXTRA = 'PLCC 보유율, 앱페이 vs credit 비중, 멤버십 등급별 결제 패턴 시점 해석.'


def _query_matrix(req: AnalyzeRequest) -> list:
    where = ['1=1']
    params: dict = {}
    if req.fuel_grade:
        where.append('t.fuel_grade = $grade')
        params['grade'] = req.fuel_grade
    if req.sido_nm:
        where.append('s.sido_nm = $sido')
        params['sido'] = req.sido_nm
    q = f"""MATCH (t:FuelTransaction)
            MATCH (s:GasStation) WHERE s.site_cd = t.store_cd
            WITH t, s WHERE {' AND '.join(where)}
            RETURN t.payment_type AS payment, t.fuel_grade AS grade,
                   s.sido_nm AS sido, count(*) AS tx,
                   sum(t.amount) AS revenue,
                   avg(t.unit_price) AS avg_price
            ORDER BY revenue DESC LIMIT 100"""
    return open_cypher(query=q, parameters=params).get('results', [])


def _data_summary(req: AnalyzeRequest, rows: list) -> str:
    if not rows:
        return ''
    total_tx = sum(r.get('tx', 0) or 0 for r in rows)
    total_rev = sum(r.get('revenue', 0) or 0 for r in rows)
    by_payment: dict = {}
    for r in rows:
        p = r.get('payment') or '?'
        by_payment[p] = by_payment.get(p, 0) + (r.get('tx', 0) or 0)
    top_payments = sorted(by_payment.items(), key=lambda kv: -kv[1])[:5]
    return (
        f"매트릭스 {len(rows)}행, 총 거래 {total_tx:,}건, 총 매출 {total_rev/1e8:.1f}억원. "
        f"결제수단 상위 5: {top_payments}. "
        f"필터: fuel_grade={req.fuel_grade or '전체'}, sido={req.sido_nm or '전체'}."
    )


@router.post('/analyze')
def analyze(req: AnalyzeRequest) -> dict:
    rows = _query_matrix(req)
    summary = summarize(
        req.persona_id, 'L', '결제·가격·채널 분석', _data_summary(req, rows),
        sources=_SOURCES, extra_instruction=_EXTRA,
    ) if rows else ''
    return {'matrix': rows, 'summary': summary}


@router.post('/stream')
async def analyze_stream(req: AnalyzeRequest) -> StreamingResponse:
    """SSE: querying_neptune → aggregated → summary_streaming → result."""
    async def gen():
        yield ('phase', {'name': 'querying_neptune',
                         'desc': '139K 거래 × PaymentMethod × GasStation 집계'})
        rows = _query_matrix(req)
        yield ('phase', {'name': 'aggregated', 'count': len(rows)})

        if not rows:
            yield ('result', {'matrix': [], 'summary': ''})
            return

        yield ('phase', {'name': 'summary_streaming'})
        chunks: list[str] = []
        for chunk in summarize_stream(
            req.persona_id, 'L', '결제·가격·채널 분석', _data_summary(req, rows),
            sources=_SOURCES, extra_instruction=_EXTRA,
        ):
            chunks.append(chunk)
            yield ('delta', {'channel': 'summary', 'text': chunk})
        summary = ''.join(chunks)
        yield ('phase', {'name': 'summary_done', 'len': len(summary)})

        yield ('result', {'matrix': rows, 'summary': summary})

    return StreamingResponse(stream_phases(gen()), media_type='text/event-stream')
