# api/routers/insights.py — 시나리오 C: MD 인사이트
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from api.services.sse import sse_event, stream_phases
from api.services.persona import get as get_persona

router = APIRouter(prefix='/api/insights', tags=['insights'])


class InsightsRequest(BaseModel):
    persona_id: Optional[str] = 'marketing'


@router.post('')
def insights_sync(req: InsightsRequest):
    return {'persona': get_persona(req.persona_id)['name_kr'], 'placeholder': 'task 4.x에서 구현'}


@router.post('/stream')
async def insights_streaming(req: InsightsRequest):
    async def gen():
        yield ('phase', {'name': 'insights_start'})
        yield ('result', {'placeholder': True})
    return StreamingResponse(stream_phases(gen()), media_type='text/event-stream')
