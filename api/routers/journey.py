# api/routers/journey.py — 시나리오 M: 고객 통합 여정 (PDF 3페이지 시그니처)
from __future__ import annotations
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from api.services.journey_pipeline import build_journey

router = APIRouter(prefix='/api/journey', tags=['journey'])


class JourneyRequest(BaseModel):
    cust_id: str
    persona_id: Optional[str] = 'marketing'


@router.post('')
def journey(req: JourneyRequest) -> dict:
    return build_journey(req.cust_id)
