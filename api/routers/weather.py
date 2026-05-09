# api/routers/weather.py — 시나리오 N: 날씨 × 주유 패턴
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter
from pydantic import BaseModel
from api.services.weather_pipeline import correlate_by_sido

router = APIRouter(prefix='/api/weather', tags=['weather'])


class CorrRequest(BaseModel):
    persona_id: Optional[str] = 'data-ai'
    sido_nm: Optional[str] = None


@router.post('/correlate')
def correlate(req: CorrRequest) -> dict:
    return correlate_by_sido(req.sido_nm)
