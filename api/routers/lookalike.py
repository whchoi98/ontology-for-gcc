# api/routers/lookalike.py — 시나리오 F: 룩어라이크 익스팬션
from __future__ import annotations
from typing import List, Optional
from fastapi import APIRouter
from pydantic import BaseModel
from api.services.tools.lookalike_expand import run as lookalike_run

router = APIRouter(prefix='/api/lookalike', tags=['lookalike'])


class LookalikeRequest(BaseModel):
    seed_cust_ids: List[str]
    top_pct: float = 0.20
    persona_id: Optional[str] = 'data-ai'


@router.post('')
def expand(req: LookalikeRequest) -> dict:
    return lookalike_run(
        {'seed_cust_ids': req.seed_cust_ids, 'top_pct': req.top_pct},
        persona_id=req.persona_id or 'data-ai',
        session_id='web',
        cust_id=None,
    )
