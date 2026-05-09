# api/routers/outlier.py — 시나리오 K: Outlier · 행동 변화 탐지 (PDF 3페이지 시그니처)
from __future__ import annotations
from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from api.services.tools.behavior_change_detect import run as detect_run
from api.services.cohort import select

router = APIRouter(prefix='/api/outlier', tags=['outlier'])


class OutlierRequest(BaseModel):
    pattern: str  # 'pm_m_mixing' | 'fuel_grade_transition' | 'app_signup_after_install'
    persona_id: Optional[str] = 'data-ai'
    cohort_filter: Optional[List[str]] = None


@router.post('/detect')
def detect(req: OutlierRequest) -> dict:
    cohort = req.cohort_filter or select(req.persona_id or 'data-ai', 'K')
    return detect_run(
        {'pattern': req.pattern, 'cohort_filter': cohort},
        persona_id=req.persona_id or 'data-ai',
        session_id='web',
        cust_id=None,
    )
