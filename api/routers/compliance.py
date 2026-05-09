# api/routers/compliance.py — 시나리오 I: 약관·규제 가드레일
from __future__ import annotations
from typing import List, Optional
from fastapi import APIRouter
from pydantic import BaseModel
from api.services.neptune import open_cypher
from api.services.guardrails import apply as guardrail_apply

router = APIRouter(prefix='/api/compliance', tags=['compliance'])


class CheckRequest(BaseModel):
    target_cust_ids: List[str]
    marketing_action: str  # 자유 텍스트 (e.g. "고급휘발유 SMS 캠페인")
    persona_id: Optional[str] = 'strategy'


@router.post('/check')
def check(req: CheckRequest) -> dict:
    """약관 동의 매트릭스 + Bedrock Guardrail input scrub.

    AGREED_TO·FOR edges are loaded (Plan 3.5), so we use graph traversal here.
    """
    # 1) 약관 동의 매트릭스 — graph traversal (AGREED_TO + FOR edges loaded)
    q = """UNWIND $ids AS id
           MATCH (c:Customer {cust_id: id})
           OPTIONAL MATCH (c)-[:AGREED_TO]->(ta:TermAgreement)-[:FOR]->(t:Term)
           WHERE t.marketing_eligible_yn = 'Y'
           RETURN c.cust_id AS cust_id, count(ta) AS marketing_eligible_count"""
    res = open_cypher(query=q, parameters={'ids': req.target_cust_ids})
    eligible: List[str] = []
    blocked: List[str] = []
    for row in res.get('results', []):
        if (row.get('marketing_eligible_count') or 0) > 0:
            eligible.append(row['cust_id'])
        else:
            blocked.append(row['cust_id'])

    # 2) action 텍스트 자체 가드레일
    cleaned, violations = guardrail_apply(req.marketing_action, source='INPUT')

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
    }
