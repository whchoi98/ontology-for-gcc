# api/routers/external_signal.py — 시나리오 J: 외부 시그널 통합 (현대카드·앱·설문·날씨)
from __future__ import annotations
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from api.services.neptune import open_cypher
from api.services.bedrock import converse, ConverseRequest
from api.services.persona import system_prompt

router = APIRouter(prefix='/api/external-signal', tags=['external_signal'])


class FuseRequest(BaseModel):
    persona_id: Optional[str] = 'strategy'
    cust_id: Optional[str] = None  # None이면 cohort 평균


@router.post('/fuse')
def fuse(req: FuseRequest) -> dict:
    """현대카드·앱·설문·기상 cross-source 융합 → Sonnet narrative.

    HAS_INDEX (Plan 3.5 loaded), USED_APP (loaded), ANSWERED (loaded) edges
    are available, so we can use graph traversal here.
    """
    if req.cust_id:
        q = """MATCH (c:Customer {cust_id: $cid})
               OPTIONAL MATCH (c)-[:HAS_INDEX]->(i:ConsumptionIndex)
               OPTIONAL MATCH (c)-[:USED_APP]->(e:AppEvent)
               OPTIONAL MATCH (c)-[:ANSWERED]->(s:SurveyResponse)
               RETURN c.cust_id AS cust_id, c.vip_yn AS vip,
                      count(DISTINCT i) AS index_count,
                      count(DISTINCT e) AS app_events,
                      count(DISTINCT s) AS survey_responses
               LIMIT 1"""
        params: dict = {'cid': req.cust_id}
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
        res = open_cypher(query=q, parameters=params)
        rows = res.get('results', [])
    except Exception as e:
        rows = [{'error': str(e)}]

    sys = system_prompt(req.persona_id, 'J')
    msg = (
        '다음 cross-source 시그널을 GS Caltex 마케팅 인사이트로 1단락 (3~5문장) 요약하라. '
        '출처는 external (현대카드 ConsumptionIndex / 에어브릿지 AppEvent / 설문 SurveyResponse / '
        '기상청 WeatherObservation)와 real (Customer)이다.\n'
        f'데이터: {rows[:5]}'
    )
    try:
        out = converse(ConverseRequest(
            system=sys,
            messages=[{'role': 'user', 'content': [{'text': msg}]}],
        ))
        narrative = out['output']['message']['content'][0]['text']
    except Exception as e:
        narrative = f'(narrative 생성 실패: {e})'
    return {'fused_rows': rows, 'narrative': narrative}
