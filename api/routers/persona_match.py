# api/routers/persona_match.py — 시나리오 D: 페르소나 매칭
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from api.services.sse import sse_event, stream_phases
from api.services.persona import get as get_persona

router = APIRouter(prefix='/api/persona-match', tags=['persona_match'])


class PersonaMatchRequest(BaseModel):
    persona_id: Optional[str] = 'marketing'


@router.post('')
def persona_match_sync(req: PersonaMatchRequest):
    return {'persona': get_persona(req.persona_id)['name_kr'], 'placeholder': 'task 4.x에서 구현'}


@router.post('/stream')
async def persona_match_streaming(req: PersonaMatchRequest):
    async def gen():
        yield ('phase', {'name': 'persona_match_start'})
        yield ('result', {'placeholder': True})
    return StreamingResponse(stream_phases(gen()), media_type='text/event-stream')
