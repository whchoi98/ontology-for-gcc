# api/routers/network_map.py — 시나리오 H: 주유소 네트워크 지도
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from api.services.sse import sse_event, stream_phases
from api.services.persona import get as get_persona

router = APIRouter(prefix='/api/network-map', tags=['network_map'])


class NetworkMapRequest(BaseModel):
    persona_id: Optional[str] = 'marketing'


@router.post('')
def network_map_sync(req: NetworkMapRequest):
    return {'persona': get_persona(req.persona_id)['name_kr'], 'placeholder': 'task 4.x에서 구현'}


@router.post('/stream')
async def network_map_streaming(req: NetworkMapRequest):
    async def gen():
        yield ('phase', {'name': 'network_map_start'})
        yield ('result', {'placeholder': True})
    return StreamingResponse(stream_phases(gen()), media_type='text/event-stream')
