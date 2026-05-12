"""Plan 3 Task 3.2.2 — POST /api/search + /api/search/stream (SSE phases).

Replaces the legacy mfg-template router. Sync endpoint returns the final
search dict; streaming endpoint emits ``phase`` → ``result`` → ``final`` SSE
events for the live web UI.
"""
from __future__ import annotations
import logging
from typing import Optional

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.services.bedrock import embed, rerank
from api.services.opensearch import hybrid_search
from api.services.neptune import open_cypher
from api.services.sse import stream_phases
from api.services.persona import get as get_persona

log = logging.getLogger("gcc.search")

router = APIRouter(prefix='/api', tags=['search'])


class SearchRequest(BaseModel):
    query: str
    persona_id: Optional[str] = 'marketing'
    size: int = 10


def _hop1_subgraph_by_classes(class_names: list[str]) -> dict:
    """검색 결과의 class_name 리스트로 Neptune에서 sample 노드 + 1-hop 가져옴.

    OpenSearch _id는 Neptune 노드 ID와 직접 매핑되지 않으므로 (description-based
    인덱스), 결과 클래스에서 임의 sample 1개씩 뽑고 그 1-hop 이웃 200개 LIMIT.
    """
    if not class_names:
        return {'nodes': [], 'edges': []}
    # 각 라벨에서 하나씩 sample → 그 노드 1-hop. UNWIND + label 매칭.
    q = """UNWIND $labels AS lbl
           MATCH (n) WHERE lbl IN labels(n)
           WITH lbl, n LIMIT 1
           WITH collect(n) AS seeds
           UNWIND seeds AS s
           OPTIONAL MATCH (s)-[r]-(m)
           RETURN s AS n, r, m LIMIT 200"""
    try:
        res = open_cypher(q, parameters={'labels': class_names})
    except Exception as e:
        log.warning("subgraph fetch failed (degraded mode): %s", e)
        return {'nodes': [], 'edges': []}
    nodes_out: list = []
    edges_out: list = []
    seen: set = set()
    for row in res.get('results', []):
        for n in (row.get('n'), row.get('m')):
            if n and n.get('~id') not in seen:
                seen.add(n['~id'])
                labels = n.get('~labels') or ['']
                nodes_out.append({'id': n['~id'], 'label': labels[0] if labels else '', 'props': n.get('~properties', {})})
        r = row.get('r')
        if r:
            edges_out.append({'id': r.get('~id'), 'source': r.get('~start'), 'target': r.get('~end'), 'type': r.get('~type')})
    return {'nodes': nodes_out, 'edges': edges_out}


def _run_search(query: str, persona_id: Optional[str], size: int) -> dict:
    """Pipeline with per-stage logging so failures pinpoint the failing stage.

    Each stage is wrapped: a downstream service outage degrades to an empty
    result with an explanatory ``note`` field instead of failing the whole SSE.
    """
    p = get_persona(persona_id)
    log.info("search: query=%r persona=%s size=%d", query, p['persona_id'], size)

    try:
        vec = embed([query])
    except Exception as e:
        log.exception("search: embed FAILED")
        raise RuntimeError(f"embed failed: {type(e).__name__}: {e}") from e
    if not vec:
        log.warning("search: embed returned empty list")
        return {
            'query': query, 'persona_id': p['persona_id'],
            'results': [], 'subgraph': {'nodes': [], 'edges': []},
            'note': 'embed returned empty',
        }
    log.info("search: embed OK dim=%d", len(vec[0]) if vec[0] else 0)

    try:
        hits = hybrid_search(query, vec[0], size=size * 2)
    except Exception as e:
        log.exception("search: hybrid_search FAILED")
        return {
            'query': query, 'persona_id': p['persona_id'],
            'results': [], 'subgraph': {'nodes': [], 'edges': []},
            'note': f'opensearch unavailable: {type(e).__name__}: {e}',
        }
    log.info("search: hybrid_search OK hits=%d", len(hits))

    docs = [
        {
            'id': h['_id'],
            'text': h['_source'].get('text', ''),
            'class_name': h['_source'].get('class_name'),
            'metadata': h['_source'].get('metadata', {}),
            'rrf_score': h.get('_score', 0),
        }
        for h in hits
    ]
    reranked = rerank(query, docs, top_k=size)
    log.info("search: rerank OK reranked=%d", len(reranked))

    # 결과 상위 5건의 class_name으로 Neptune sample 1-hop 가져옴.
    top_classes = list({d.get('class_name') for d in reranked[:5] if d.get('class_name')})
    subgraph = _hop1_subgraph_by_classes(top_classes)
    log.info("search: subgraph OK classes=%s nodes=%d edges=%d",
             top_classes, len(subgraph['nodes']), len(subgraph['edges']))

    return {
        'query': query, 'persona_id': p['persona_id'],
        'results': reranked, 'subgraph': subgraph,
    }


@router.post('/search')
def search_sync(req: SearchRequest) -> dict:
    return _run_search(req.query, req.persona_id, req.size)


@router.post('/search/stream')
async def search_streaming(req: SearchRequest):
    async def gen():
        yield ('phase', {
            'name': 'embedding',
            'persona': get_persona(req.persona_id)['name_kr'],
        })
        out = _run_search(req.query, req.persona_id, req.size)
        yield ('phase', {'name': 'reranked', 'count': len(out['results'])})
        yield ('phase', {'name': 'subgraph', 'nodes': len(out['subgraph']['nodes'])})
        yield ('result', out)

    return StreamingResponse(stream_phases(gen()), media_type='text/event-stream')
