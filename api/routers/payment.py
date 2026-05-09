# api/routers/payment.py — 시나리오 L: 결제·가격·채널 분석
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter
from pydantic import BaseModel
from api.services.neptune import open_cypher

router = APIRouter(prefix='/api/payment', tags=['payment'])


class AnalyzeRequest(BaseModel):
    persona_id: Optional[str] = 'retail-ops'
    fuel_grade: Optional[str] = None
    sido_nm: Optional[str] = None


@router.post('/analyze')
def analyze(req: AnalyzeRequest) -> dict:
    """Transaction × PaymentMethod × FuelPrice 매트릭스.

    property-join fallback — Plan 5 polish: switch to graph traversal once
    AT/PRICED_AT edges are loaded. Joins via cust_id/store_cd FKs.
    """
    where = ['1=1']
    params: dict = {}
    if req.fuel_grade:
        where.append('t.fuel_grade = $grade')
        params['grade'] = req.fuel_grade
    if req.sido_nm:
        where.append('s.sido_nm = $sido')
        params['sido'] = req.sido_nm
    where_clause = ' AND '.join(where)
    q = f"""MATCH (t:FuelTransaction)
            MATCH (s:GasStation) WHERE s.site_cd = t.store_cd
            WITH t, s WHERE {where_clause}
            RETURN t.payment_type AS payment, t.fuel_grade AS grade,
                   s.sido_nm AS sido, count(*) AS tx,
                   sum(t.amount) AS revenue,
                   avg(t.unit_price) AS avg_price
            ORDER BY revenue DESC LIMIT 100"""
    res = open_cypher(query=q, parameters=params)
    return {'matrix': res.get('results', [])}
