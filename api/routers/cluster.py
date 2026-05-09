# api/routers/cluster.py — 시나리오 E: 고객 클러스터링
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from api.services.sse import sse_event, stream_phases
from api.services.persona import get as get_persona

router = APIRouter(prefix='/api/cluster', tags=['cluster'])


class ClusterRequest(BaseModel):
    persona_id: Optional[str] = 'marketing'


@router.post('')
def cluster_sync(req: ClusterRequest):
    return {'persona': get_persona(req.persona_id)['name_kr'], 'placeholder': 'task 4.x에서 구현'}


@router.post('/stream')
async def cluster_streaming(req: ClusterRequest):
    async def gen():
        yield ('phase', {'name': 'cluster_start'})
        yield ('result', {'placeholder': True})
    return StreamingResponse(stream_phases(gen()), media_type='text/event-stream')
