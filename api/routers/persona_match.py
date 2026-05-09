# api/routers/persona_match.py — 시나리오 D: 페르소나 매칭 (Customer KPI × PERSONA_REGISTRY 가중치)
from __future__ import annotations
from typing import List, Optional
from fastapi import APIRouter
from pydantic import BaseModel
from api.services.persona import PERSONA_REGISTRY
from api.services.neptune import open_cypher

router = APIRouter(prefix='/api/persona-match', tags=['persona_match'])


class MatchRequest(BaseModel):
    cust_ids: List[str] = []
    persona_id: Optional[str] = 'marketing'


@router.post('')
def match(req: MatchRequest) -> dict:
    if not req.cust_ids:
        return {'matches': []}
    # property-join fallback — Plan 5 polish: switch to graph traversal once
    # full edges loaded. We use Customer node lookups + per-cust_id transaction
    # aggregation via the cust_id FK on FuelTransaction.
    q = """UNWIND $ids AS id
           MATCH (c:Customer {cust_id: id})
           OPTIONAL MATCH (t:FuelTransaction {cust_id: id})
           RETURN c.cust_id AS cust_id, c.vip_yn AS vip,
                  count(t) AS tx_count, sum(t.amount) AS total_amt"""
    res = open_cypher(query=q, parameters={'ids': req.cust_ids})
    rows = res.get('results', [])
    matches = []
    for row in rows:
        scores = {}
        for pid, p in PERSONA_REGISTRY.items():
            base = 0.0
            if 'roas' in p['kpi_focus']:
                base += min((row.get('total_amt', 0) or 0) / 1_000_000, 1.0) * 0.4
            if 'retention' in p['kpi_focus']:
                base += min((row.get('tx_count', 0) or 0) / 100, 1.0) * 0.3
            if 'plcc_attach' in p['kpi_focus'] and row.get('vip') == 'Y':
                base += 0.3
            if 'station_volume' in p['kpi_focus']:
                base += min((row.get('tx_count', 0) or 0) / 50, 1.0) * 0.25
            if 'cluster_quality' in p['kpi_focus']:
                base += 0.15  # baseline weight for data-ai persona
            scores[pid] = round(base, 3)
        best = max(scores.items(), key=lambda kv: kv[1])
        matches.append({
            'cust_id': row['cust_id'],
            'best_persona': best[0],
            'all_scores': scores,
        })
    return {'matches': matches}
