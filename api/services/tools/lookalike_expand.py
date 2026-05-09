"""Tool: lookalike_expand — embedding similarity expansion of seed customers."""
from __future__ import annotations

from api.services.bedrock import embed
from api.services.opensearch import client
from api.config import settings


def run(input: dict, *, persona_id: str, session_id: str, cust_id):
    seed = input.get('seed_cust_ids') or []
    top_pct = input.get('top_pct', 0.20)
    if not seed:
        return {'expanded': [], 'count': 0}
    seed_text = ' '.join(seed)
    try:
        vec = embed([seed_text])[0]
    except Exception as e:
        return {'expanded': [], 'count': 0, 'error': str(e)}
    try:
        cl = client()
        body = {
            'size': max(int(50000 * top_pct), 100),
            'query': {'knn': {'embedding': {'vector': vec, 'k': 1000}}},
        }
        hits = cl.search(index=settings.opensearch_index, body=body)['hits']['hits']
    except Exception as e:
        return {'expanded': [], 'count': 0, 'error': str(e)}
    seed_set = set(seed)
    expanded = [h['_id'] for h in hits if h['_id'] not in seed_set]
    return {'expanded': expanded[:1000], 'count': len(expanded)}
