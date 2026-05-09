# api/routers/network_map.py — 시나리오 H: 주유소 네트워크 지도 (시도 choropleth)
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter
from pydantic import BaseModel
from api.services.neptune import open_cypher

router = APIRouter(prefix='/api/network-map', tags=['network_map'])


class MapRequest(BaseModel):
    persona_id: Optional[str] = 'retail-ops'
    fuel_grade: Optional[str] = None


@router.post('/map')
def network_map(req: MapRequest) -> dict:
    """시도 × 브랜드 stations 집계.

    property-join fallback — Plan 5 polish: switch to graph traversal once
    PRICED_AT edges are loaded. We aggregate on GasStation nodes directly.
    """
    q = """MATCH (s:GasStation)
           RETURN s.sido_nm AS sido, s.brand_cd AS brand,
                  count(DISTINCT s) AS stations,
                  avg(s.last_price) AS avg_price"""
    res = open_cypher(query=q)
    return {'stations_by_sido': res.get('results', [])}


@router.post('/stations')
def stations_around(req: MapRequest) -> dict:
    q = """MATCH (s:GasStation) RETURN s LIMIT 1000"""
    res = open_cypher(query=q)
    return {
        'stations': [r.get('s', {}) for r in res.get('results', [])],
    }
