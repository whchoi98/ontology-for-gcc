"""의미 검색 파이프라인 — query → embed → BM25+KNN(RRF) → rerank → 1-hop subgraph.

Plan 3 Task 3.2.1 — composes the four common services (bedrock, opensearch,
neptune, persona) into the canonical Scenario A retrieval pipeline.
"""
from __future__ import annotations
from typing import Optional

from api.services.bedrock import embed, rerank
from api.services.opensearch import hybrid_search
from api.services.neptune import open_cypher
from api.services.persona import get as get_persona


def search(query: str, persona_id: Optional[str] = None, size: int = 10) -> dict:
    """Run the full Scenario A search pipeline.

    Returns ``{query, persona_id, results, subgraph}`` where ``results`` is the
    reranked document list and ``subgraph`` is the 1-hop neighborhood of the
    top 5 result ids fetched from Neptune.
    """
    p = get_persona(persona_id)

    # 1) embed
    vec = embed([query])[0]

    # 2) hybrid (BM25 + KNN, RRF)
    hits = hybrid_search(query, vec, size=size * 2)

    # 3) rerank
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

    # 4) 1-hop subgraph (top 5 nodes)
    subgraph_ids = [d['id'] for d in reranked[:5]]
    subgraph = _hop1_subgraph(subgraph_ids)

    return {
        'query': query,
        'persona_id': p['persona_id'],
        'results': reranked,
        'subgraph': subgraph,
    }


def _hop1_subgraph(ids: list) -> dict:
    """Fetch 1-hop subgraph from Neptune for the given node ids.

    Uses ``id_key`` matching (consistent with Plan 2 Bulk Loader format) and
    flattens the ``n, r, m`` rows into a deduplicated nodes/edges payload.
    """
    if not ids:
        return {'nodes': [], 'edges': []}
    q = """UNWIND $ids AS id
           MATCH (n {id_key: id})-[r]-(m)
           RETURN n, r, m LIMIT 200"""
    res = open_cypher(q, parameters={'ids': ids})
    nodes_out: list = []
    edges_out: list = []
    seen: set = set()
    for row in res.get('results', []):
        for n in (row.get('n'), row.get('m')):
            if n and n.get('~id') not in seen:
                seen.add(n['~id'])
                labels = n.get('~labels') or ['']
                nodes_out.append({
                    'id': n['~id'],
                    'label': labels[0] if labels else '',
                    'props': n.get('~properties', {}),
                })
        r = row.get('r')
        if r:
            edges_out.append({
                'id': r.get('~id'),
                'source': r.get('~start'),
                'target': r.get('~end'),
                'type': r.get('~type'),
            })
    return {'nodes': nodes_out, 'edges': edges_out}
