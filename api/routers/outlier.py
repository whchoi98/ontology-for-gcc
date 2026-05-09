# api/routers/outlier.py — 시나리오 K: Outlier · 행동 변화
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from api.services.sse import sse_event, stream_phases
from api.services.persona import get as get_persona

router = APIRouter(prefix='/api/outlier', tags=['outlier'])


class OutlierRequest(BaseModel):
    persona_id: Optional[str] = 'marketing'


@router.post('')
def outlier_sync(req: OutlierRequest):
    return {'persona': get_persona(req.persona_id)['name_kr'], 'placeholder': 'task 4.x에서 구현'}


@router.post('/stream')
async def outlier_streaming(req: OutlierRequest):
    async def gen():
        yield ('phase', {'name': 'outlier_start'})
        yield ('result', {'placeholder': True})
    return StreamingResponse(stream_phases(gen()), media_type='text/event-stream')
