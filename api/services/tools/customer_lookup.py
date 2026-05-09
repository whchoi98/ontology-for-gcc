"""Tool: customer_lookup — single customer node + behavior summary."""
from __future__ import annotations

from api.services.neptune import open_cypher


def run(input: dict, *, persona_id: str, session_id: str, cust_id):
    cid = input.get('cust_id', '')
    q = """MATCH (c:Customer {cust_id: $cid})
           OPTIONAL MATCH (c)-[:REFUELED]->(t:FuelTransaction)
           OPTIONAL MATCH (c)-[:AGREED_TO]->(ta:TermAgreement)
           RETURN c, count(DISTINCT t) AS tx_count, count(DISTINCT ta) AS terms_count
           LIMIT 1"""
    res = open_cypher(q, parameters={'cid': cid})
    rows = res.get('results', [])
    return {'customer': rows[0] if rows else {}}
