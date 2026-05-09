# api/routers/cluster.py — 시나리오 E: 고객 클러스터링 (KMeans 6 + LLM 라벨링)
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from api.services.sse import stream_phases
from api.services.cluster_pipeline import (
    features_query,
    cluster_features,
    llm_label_clusters,
    write_back_clusters,
)

router = APIRouter(prefix='/api/cluster', tags=['cluster'])


class ClusterRequest(BaseModel):
    persona_id: Optional[str] = 'data-ai'
    write_back: bool = False


@router.post('/stream')
async def stream(req: ClusterRequest) -> StreamingResponse:
    async def gen():
        yield ('phase', {'name': 'fetching_features'})
        rows = features_query()
        yield ('phase', {'name': 'clustering', 'n': len(rows)})
        out = cluster_features(rows)
        yield ('phase', {'name': 'labeling'})
        labels = llm_label_clusters(out['centroids'])
        if req.write_back:
            write_back_clusters(out['assignments'], labels)
            yield ('log', {'wrote_back': True})
        yield ('result', {**out, 'labels': labels})

    return StreamingResponse(
        stream_phases(gen()), media_type='text/event-stream',
    )
