# api/routers/external_signal.py — 시나리오 J: 외부 시그널 융합
# (현대카드 ConsumptionIndex · 에어브릿지 AppEvent · 운전중 SurveyResponse · KMA WeatherObservation)
#
# Two endpoints:
#   POST /api/external-signal/fuse        — legacy JSON (kept for backward compat)
#   POST /api/external-signal/fuse-stream — SSE (5-phase pipeline like other personas)
from __future__ import annotations
from typing import Optional

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.services.neptune import open_cypher
from api.services.bedrock import converse, converse_stream, ConverseRequest
from api.services.persona import system_prompt
from api.services.sse import stream_phases

router = APIRouter(prefix='/api/external-signal', tags=['external_signal'])


class FuseRequest(BaseModel):
    persona_id: Optional[str] = 'strategy'
    cust_id: Optional[str] = None  # None이면 cohort 평균


def _query_neptune(cust_id: Optional[str]) -> list[dict]:
    if cust_id:
        q = """MATCH (c:Customer {cust_id: $cid})
               OPTIONAL MATCH (c)-[:HAS_INDEX]->(i:ConsumptionIndex)
               OPTIONAL MATCH (c)-[:USED_APP]->(e:AppEvent)
               OPTIONAL MATCH (c)-[:ANSWERED]->(s:SurveyResponse)
               RETURN c.cust_id AS cust_id, c.vip_yn AS vip,
                      count(DISTINCT i) AS index_count,
                      count(DISTINCT e) AS app_events,
                      count(DISTINCT s) AS survey_responses
               LIMIT 1"""
        params: dict = {'cid': cust_id}
    else:
        q = """MATCH (c:Customer)
               OPTIONAL MATCH (c)-[:USED_APP]->(e:AppEvent)
               OPTIONAL MATCH (c)-[:HAS_INDEX]->(i:ConsumptionIndex)
               RETURN count(c) AS cust_n,
                      count(DISTINCT e) AS app_events_total,
                      avg(i.car_need_idx) AS avg_car_idx,
                      count(DISTINCT i) AS has_idx_count
               LIMIT 1"""
        params = {}
    try:
        return open_cypher(query=q, parameters=params).get('results', [])
    except Exception as e:
        return [{'error': str(e)}]


def _narrative_msg(rows: list) -> str:
    return (
        '다음 cross-source 시그널을 GS Caltex 마케팅 인사이트로 1단락 (3~5문장) 요약하라. '
        '출처는 external (현대카드 ConsumptionIndex / 에어브릿지 AppEvent / 설문 SurveyResponse / '
        '기상청 WeatherObservation)와 real (Customer)이다.\n'
        f'데이터: {rows[:5]}'
    )


def _summary_msg(rows: list) -> str:
    return (
        '다음 cross-source 시그널 (4 source: 현대카드 소비지수, 에어브릿지 앱 이벤트, 운전중 설문, '
        'KMA 기상)에 대해 5섹션 markdown으로 한국어 인사이트를 작성하라. 각 섹션 2-3문장, 정량 수치 포함. '
        '4 source cross-correlation을 활용해 외부 시그널이 GSC 내부 데이터와 결합하여 도출하는 새로운 '
        '인사이트를 강조하라.\n\n'
        f'데이터: {rows[:3]}\n\n'
        '## 헤드라인\n## 핵심 발견\n## 부서 시점 해석\n## 비즈니스 함의\n## 부서 권고 (3건)\n\n'
        '출처는 external·real을 명시.'
    )


def _stream_text(persona_id: Optional[str], scenario: str, msg: str):
    """sync generator yielding (channel-less) text chunks from Bedrock stream."""
    sys = system_prompt(persona_id, scenario)
    req = ConverseRequest(
        system=sys,
        messages=[{'role': 'user', 'content': [{'text': msg}]}],
        max_tokens=1024,
    )
    try:
        for ev in converse_stream(req):
            if 'contentBlockDelta' in ev:
                delta = ev['contentBlockDelta'].get('delta') or {}
                text = delta.get('text')
                if text:
                    yield text
    except Exception as e:
        yield f'\n\n(스트림 실패: {type(e).__name__}: {e})'


@router.post('/fuse')
def fuse(req: FuseRequest) -> dict:
    """Legacy JSON endpoint — single round-trip. CloudFront 30s timeout
    risk if Sonnet narrative + summary together exceed budget; prefer
    /fuse-stream for new clients."""
    rows = _query_neptune(req.cust_id)
    sys = system_prompt(req.persona_id, 'J')
    try:
        out = converse(ConverseRequest(
            system=sys,
            messages=[{'role': 'user', 'content': [{'text': _narrative_msg(rows)}]}],
            max_tokens=512,
        ))
        narrative = out['output']['message']['content'][0]['text']
    except Exception as e:
        narrative = f'(narrative 생성 실패: {e})'
    from api.services.insight_summary import summarize
    summary = summarize(
        req.persona_id, 'J', '외부 시그널 융합', f'fused_rows: {rows[:3]}',
        sources=['external:현대카드ConsumptionIndex', 'external:KMA',
                 'real:AppEvent', 'real:SurveyResponse', 'real:Customer'],
        extra_instruction='4 source cross-correlation. 외부 시그널이 GSC 내부 데이터와 결합하여 도출하는 새로운 인사이트 강조.',
    )
    return {'fused_rows': rows, 'narrative': narrative, 'summary': summary}


@router.post('/fuse-stream')
async def fuse_stream(req: FuseRequest) -> StreamingResponse:
    """SSE 5-phase pipeline:
       1. querying_neptune → 4-source 집계
       2. neptune_done → row count
       3. narrative_streaming → Sonnet narrative delta(channel=narrative)
       4. narrative_done
       5. summary_streaming → Sonnet 5-section delta(channel=summary)
       6. summary_done + result(fused_rows, narrative, summary)
    """
    async def gen():
        # ── Phase 1-2: Neptune
        yield ('phase', {'name': 'querying_neptune', 'desc': '4 source 집계 중'})
        rows = _query_neptune(req.cust_id)
        yield ('phase', {'name': 'neptune_done', 'count': len(rows)})

        # ── Phase 3-4: Bedrock narrative (1단락)
        yield ('phase', {'name': 'narrative_streaming', 'desc': 'Sonnet 4.6 narrative'})
        narrative_chunks: list[str] = []
        for chunk in _stream_text(req.persona_id, 'J', _narrative_msg(rows)):
            narrative_chunks.append(chunk)
            yield ('delta', {'channel': 'narrative', 'text': chunk})
        narrative = ''.join(narrative_chunks)
        yield ('phase', {'name': 'narrative_done', 'len': len(narrative)})

        # ── Phase 5-6: Bedrock 5-section summary
        yield ('phase', {'name': 'summary_streaming', 'desc': 'Sonnet 4.6 5섹션 인사이트'})
        summary_chunks: list[str] = []
        for chunk in _stream_text(req.persona_id, 'J', _summary_msg(rows)):
            summary_chunks.append(chunk)
            yield ('delta', {'channel': 'summary', 'text': chunk})
        summary = ''.join(summary_chunks)
        yield ('phase', {'name': 'summary_done', 'len': len(summary)})

        yield ('result', {
            'fused_rows': rows,
            'narrative': narrative,
            'summary': summary,
        })

    return StreamingResponse(stream_phases(gen()), media_type='text/event-stream')
