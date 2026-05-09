# api/routers/external_signal.py — 시나리오 J: 외부 시그널 통합
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from api.services.sse import sse_event, stream_phases
from api.services.persona import get as get_persona

router = APIRouter(prefix='/api/external-signal', tags=['external_signal'])


class ExternalSignalRequest(BaseModel):
    persona_id: Optional[str] = 'marketing'


@router.post('')
def external_signal_sync(req: ExternalSignalRequest):
    return {'persona': get_persona(req.persona_id)['name_kr'], 'placeholder': 'task 4.x에서 구현'}


@router.post('/stream')
async def external_signal_streaming(req: ExternalSignalRequest):
    async def gen():
        yield ('phase', {'name': 'external_signal_start'})
        yield ('result', {'placeholder': True})
    return StreamingResponse(stream_phases(gen()), media_type='text/event-stream')
