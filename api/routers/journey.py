# api/routers/journey.py — 시나리오 M: 고객 통합 여정
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from api.services.sse import sse_event, stream_phases
from api.services.persona import get as get_persona

router = APIRouter(prefix='/api/journey', tags=['journey'])


class JourneyRequest(BaseModel):
    persona_id: Optional[str] = 'marketing'


@router.post('')
def journey_sync(req: JourneyRequest):
    return {'persona': get_persona(req.persona_id)['name_kr'], 'placeholder': 'task 4.x에서 구현'}


@router.post('/stream')
async def journey_streaming(req: JourneyRequest):
    async def gen():
        yield ('phase', {'name': 'journey_start'})
        yield ('result', {'placeholder': True})
    return StreamingResponse(stream_phases(gen()), media_type='text/event-stream')
