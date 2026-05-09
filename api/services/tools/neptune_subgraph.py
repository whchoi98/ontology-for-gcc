"""Tool: neptune_subgraph — 1/2-hop subgraph by seed ids."""
from __future__ import annotations

from api.services.neptune import open_cypher
from api.services.cohort import select


def run(input: dict, *, persona_id: str, session_id: str, cust_id):
    seed_ids = input.get('seed_ids') or []
    hops = input.get('hops', 1)
    if hops == 1:
        q = (
            "UNWIND $ids AS id "
            "MATCH (n {id_key: id})-[r]-(m) "
            "RETURN n, r, m LIMIT 200"
        )
    else:
        q = (
            "UNWIND $ids AS id "
            "MATCH (n {id_key: id})-[r]-(:any)-[r2]-(m) "
            "RETURN n, r, m LIMIT 200"
        )
    res = open_cypher(q, parameters={'ids': seed_ids})
    return {
        'subgraph': res.get('results', []),
        'cohort_filter': select(persona_id, 'B'),
    }
