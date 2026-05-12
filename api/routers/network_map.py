# api/routers/network_map.py — 시나리오 H: 주유소 네트워크 지도 (시도 choropleth)
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from api.services.neptune import open_cypher
from api.services.insight_summary import summarize, summarize_stream
from api.services.sse import stream_phases

router = APIRouter(prefix='/api/network-map', tags=['network_map'])


class MapRequest(BaseModel):
    persona_id: Optional[str] = 'retail-ops'
    fuel_grade: Optional[str] = None


_SOURCES = ['real:GasStation', 'real:Region', 'real:Opinet']
_EXTRA = 'GSC vs 경쟁사 (현대/SK/S-Oil) 권역별 비중, 진출 부진 시도, 가격 경쟁 강도 분석.'


def _query_stations() -> list:
    q = """MATCH (s:GasStation)
           RETURN s.sido_nm AS sido, s.brand_cd AS brand,
                  count(DISTINCT s) AS stations,
                  avg(s.last_price) AS avg_price"""
    return open_cypher(query=q).get('results', [])


def _data_summary(rows: list) -> str:
    by_sido: dict = {}; by_brand: dict = {}
    for r in rows:
        sido = r.get('sido') or '?'
        brand = r.get('brand') or '?'
        n = r.get('stations') or 0
        by_sido[sido] = by_sido.get(sido, 0) + n
        by_brand[brand] = by_brand.get(brand, 0) + n
    top_sido = sorted(by_sido.items(), key=lambda kv: -kv[1])[:5]
    return (
        f"매트릭스 {len(rows)} 행, 총 주유소 {sum(by_sido.values()):,}개. "
        f"시도 상위 5: {top_sido}. 브랜드 분포: {by_brand}."
    )


@router.post('/map')
def network_map(req: MapRequest) -> dict:
    rows = _query_stations()
    summary = summarize(
        req.persona_id, 'H', '권역 경쟁 주유소 지도', _data_summary(rows),
        sources=_SOURCES, extra_instruction=_EXTRA,
    )
    return {'stations_by_sido': rows, 'summary': summary}


@router.post('/stream')
async def network_map_stream(req: MapRequest) -> StreamingResponse:
    """SSE: querying_neptune → aggregated → summary_streaming → result."""
    async def gen():
        yield ('phase', {'name': 'querying_neptune',
                         'desc': '8.5K GasStation 시도×브랜드 집계'})
        rows = _query_stations()
        yield ('phase', {'name': 'aggregated', 'count': len(rows)})

        yield ('phase', {'name': 'summary_streaming'})
        chunks: list[str] = []
        for chunk in summarize_stream(
            req.persona_id, 'H', '권역 경쟁 주유소 지도', _data_summary(rows),
            sources=_SOURCES, extra_instruction=_EXTRA,
        ):
            chunks.append(chunk)
            yield ('delta', {'channel': 'summary', 'text': chunk})
        summary = ''.join(chunks)
        yield ('phase', {'name': 'summary_done', 'len': len(summary)})

        yield ('result', {'stations_by_sido': rows, 'summary': summary})

    return StreamingResponse(stream_phases(gen()), media_type='text/event-stream')


@router.post('/stations')
def stations_around(req: MapRequest) -> dict:
    q = """MATCH (s:GasStation) RETURN s LIMIT 1000"""
    res = open_cypher(query=q)
    return {
        'stations': [r.get('s', {}) for r in res.get('results', [])],
    }
