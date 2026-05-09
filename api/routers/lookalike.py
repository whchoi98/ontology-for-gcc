# api/routers/lookalike.py — 시나리오 F: 룩어라이크 익스팬션
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from api.services.sse import sse_event, stream_phases
from api.services.persona import get as get_persona

router = APIRouter(prefix='/api/lookalike', tags=['lookalike'])


class LookalikeRequest(BaseModel):
    persona_id: Optional[str] = 'marketing'


@router.post('')
def lookalike_sync(req: LookalikeRequest):
    return {'persona': get_persona(req.persona_id)['name_kr'], 'placeholder': 'task 4.x에서 구현'}


@router.post('/stream')
async def lookalike_streaming(req: LookalikeRequest):
    async def gen():
        yield ('phase', {'name': 'lookalike_start'})
        yield ('result', {'placeholder': True})
    return StreamingResponse(stream_phases(gen()), media_type='text/event-stream')
