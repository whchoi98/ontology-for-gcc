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
from api.services.insight_summary import summarize, summarize_stream

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
        yield ('phase', {'name': 'summary_streaming'})
        # 5섹션 markdown 인사이트 — token-by-token streaming (KMeans centroid + 라벨)
        n_assigned = len(out.get('assignments', []))
        cluster_sizes: dict = {}
        for a in out.get('assignments', []):
            c = a.get('cluster')
            cluster_sizes[c] = cluster_sizes.get(c, 0) + 1
        data_summary = (
            f"KMeans 6 군집, 총 {n_assigned}명 customer features. "
            f"군집 크기: {cluster_sizes}. 라벨: {labels}. "
            f"centroids ([tx, amt, prem_ratio]): {out.get('centroids', [])}."
        )
        summary_chunks: list[str] = []
        for chunk in summarize_stream(
            req.persona_id, 'E', '고객 KMeans 6 클러스터링', data_summary,
            sources=['real:Customer', 'real:FuelTransaction', 'sklearn:KMeans'],
            extra_instruction='군집별 차별화 마케팅 전략, 가장 가치 큰 군집, 군집 간 이동 가능성 분석.',
        ):
            summary_chunks.append(chunk)
            yield ('delta', {'channel': 'summary', 'text': chunk})
        summary = ''.join(summary_chunks)
        yield ('phase', {'name': 'summary_done', 'len': len(summary)})
        yield ('result', {**out, 'labels': labels, 'summary': summary})

    return StreamingResponse(
        stream_phases(gen()), media_type='text/event-stream',
    )
