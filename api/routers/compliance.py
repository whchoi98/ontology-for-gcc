# api/routers/compliance.py — 시나리오 I: 약관·규제 가드레일
from __future__ import annotations
from typing import List, Optional
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from api.services.neptune import open_cypher
from api.services.guardrails import apply as guardrail_apply
from api.services.insight_summary import summarize, summarize_stream
from api.services.sse import stream_phases

router = APIRouter(prefix='/api/compliance', tags=['compliance'])


class CheckRequest(BaseModel):
    target_cust_ids: List[str]
    marketing_action: str
    persona_id: Optional[str] = 'strategy'


_SOURCES = ['real:Customer', 'real:Term', 'real:TermAgreement', 'Bedrock:Guardrails']
_EXTRA = '약관 미동의 사유 분석, 추가 동의 캠페인 효율성, 가드레일 위반 시 액션 표현 수정 권고.'


def _eligibility(cust_ids: List[str]) -> tuple[List[str], List[str]]:
    q = """UNWIND $ids AS id
           MATCH (c:Customer {cust_id: id})
           OPTIONAL MATCH (c)-[:AGREED_TO]->(ta:TermAgreement)-[:FOR]->(t:Term)
           WHERE t.marketing_eligible_yn = 'Y'
           RETURN c.cust_id AS cust_id, count(ta) AS marketing_eligible_count"""
    rows = open_cypher(query=q, parameters={'ids': cust_ids}).get('results', [])
    eligible: List[str] = []; blocked: List[str] = []
    for row in rows:
        if (row.get('marketing_eligible_count') or 0) > 0:
            eligible.append(row['cust_id'])
        else:
            blocked.append(row['cust_id'])
    return eligible, blocked


def _build_response(req: CheckRequest, eligible: List[str], blocked: List[str],
                    cleaned: str, violations: list, summary: str) -> dict:
    return {
        'action_cleaned': cleaned,
        'guardrail_violations': violations,
        'eligible_count': len(eligible),
        'blocked_count': len(blocked),
        'eligible_sample': eligible[:10],
        'blocked_sample': blocked[:10],
        'recommendation': (
            '진행 가능' if not violations and len(blocked) == 0
            else '약관 미동의 고객 제외 또는 추가 동의 캠페인 선행 필요'
        ),
        'summary': summary,
    }


def _data_summary(req: CheckRequest, eligible: List[str], blocked: List[str], violations: list) -> str:
    return (
        f"마케팅 액션: '{req.marketing_action}'. 가드레일 위반: {violations}. "
        f"대상 {len(req.target_cust_ids)}명 — 적격 {len(eligible)}, 차단 {len(blocked)}. "
        f"적격 sample: {eligible[:5]}, 차단 sample: {blocked[:5]}."
    )


@router.post('/check')
def check(req: CheckRequest) -> dict:
    eligible, blocked = _eligibility(req.target_cust_ids)
    cleaned, violations = guardrail_apply(req.marketing_action, source='INPUT')
    summary = summarize(
        req.persona_id, 'I', '약관·가드레일 검사',
        _data_summary(req, eligible, blocked, violations),
        sources=_SOURCES, extra_instruction=_EXTRA,
    )
    return _build_response(req, eligible, blocked, cleaned, violations, summary)


@router.post('/stream')
async def check_stream(req: CheckRequest) -> StreamingResponse:
    """SSE: querying_neptune → guardrail → compute_done → summary_streaming → result."""
    async def gen():
        yield ('phase', {'name': 'querying_neptune',
                         'desc': f'{len(req.target_cust_ids)}명 약관 동의 매트릭스'})
        eligible, blocked = _eligibility(req.target_cust_ids)
        yield ('phase', {'name': 'query_done',
                         'desc': f'적격 {len(eligible)} · 차단 {len(blocked)}'})

        yield ('phase', {'name': 'detecting', 'desc': 'Bedrock Guardrail 액션 텍스트 검사'})
        cleaned, violations = guardrail_apply(req.marketing_action, source='INPUT')
        yield ('phase', {'name': 'compute_done',
                         'desc': f'가드레일 위반 {len(violations)}건'})

        yield ('phase', {'name': 'summary_streaming'})
        chunks: list[str] = []
        for chunk in summarize_stream(
            req.persona_id, 'I', '약관·가드레일 검사',
            _data_summary(req, eligible, blocked, violations),
            sources=_SOURCES, extra_instruction=_EXTRA,
        ):
            chunks.append(chunk)
            yield ('delta', {'channel': 'summary', 'text': chunk})
        summary = ''.join(chunks)
        yield ('phase', {'name': 'summary_done', 'len': len(summary)})

        yield ('result', _build_response(req, eligible, blocked, cleaned, violations, summary))

    return StreamingResponse(stream_phases(gen()), media_type='text/event-stream')
