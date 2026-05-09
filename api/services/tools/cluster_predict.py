"""Tool: cluster_predict — distribution of customers across clusters."""
from __future__ import annotations

from api.services.neptune import open_cypher


def run(input: dict, *, persona_id: str, session_id: str, cust_id):
    ids = input.get('cust_ids') or []
    q = """UNWIND $ids AS id
           MATCH (c:Customer {cust_id: id})-[:BELONGS_TO]->(cl:Cluster)
           RETURN cl.label AS label, count(c) AS cnt"""
    res = open_cypher(q, parameters={'ids': ids})
    return {'distribution': res.get('results', [])}
