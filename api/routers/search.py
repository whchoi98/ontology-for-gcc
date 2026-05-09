"""Plan 3 Task 3.2.2 — POST /api/search + /api/search/stream (SSE phases).

Replaces the legacy mfg-template router. Sync endpoint returns the final
search dict; streaming endpoint emits ``phase`` → ``result`` → ``final`` SSE
events for the live web UI.
"""
from __future__ import annotations
from typing import Optional

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.services.search_pipeline import search
from api.services.sse import stream_phases
from api.services.persona import get as get_persona

router = APIRouter(prefix='/api', tags=['search'])


class SearchRequest(BaseModel):
    query: str
    persona_id: Optional[str] = 'marketing'
    size: int = 10


@router.post('/search')
def search_sync(req: SearchRequest) -> dict:
    return search(req.query, req.persona_id, req.size)


@router.post('/search/stream')
async def search_streaming(req: SearchRequest):
    async def gen():
        yield ('phase', {
            'name': 'embedding',
            'persona': get_persona(req.persona_id)['name_kr'],
        })
        out = search(req.query, req.persona_id, req.size)
        yield ('phase', {'name': 'reranked', 'count': len(out['results'])})
        yield ('phase', {'name': 'subgraph', 'nodes': len(out['subgraph']['nodes'])})
        yield ('result', out)

    return StreamingResponse(stream_phases(gen()), media_type='text/event-stream')
