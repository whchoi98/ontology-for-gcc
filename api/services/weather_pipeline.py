"""WeatherObservation × FuelTransaction 시도·일자 단위 join + 산점도.

property-join fallback — Plan 5 polish: switch to graph traversal once
WeatherObservation→Region edges are loaded. We join via sido_nm + dt scalars
on the WeatherObservation and FuelTransaction nodes themselves.
"""
from __future__ import annotations
import base64
import json
from typing import Optional

from api.services.neptune import open_cypher
from api.services.code_interpreter import execute as ci_execute


def correlate_by_sido(sido_nm: Optional[str] = None) -> dict:
    """WeatherObservation × FuelTransaction (시도·일자 단위 집계) → 산점도.

    Robust to schema variation: pass aggregation result through and produce a
    chart even when join is empty (graceful degradation).
    """
    where_clauses = []
    params: dict = {}
    if sido_nm:
        where_clauses.append('s.sido_nm = $sido')
        where_clauses.append('w.sido_nm = $sido')
        params['sido'] = sido_nm
    where = ' AND '.join(where_clauses) if where_clauses else '1 = 1'
    q = f"""MATCH (w:WeatherObservation)
            MATCH (s:GasStation) WHERE s.sido_nm = w.sido_nm
            MATCH (t:FuelTransaction)
            WHERE t.store_cd = s.site_cd
              AND substring(t.ts, 0, 10) = w.dt
              AND {where}
            RETURN s.sido_nm AS sido, w.dt AS dt,
                   w.temp_c AS temp, w.rain_mm AS rain,
                   count(t) AS tx_count, sum(t.amount) AS rev
            LIMIT 5000"""
    try:
        res = open_cypher(query=q, parameters=params)
        rows = res.get('results', [])
    except Exception:
        rows = []
    code = (
        "import json\n"
        "import matplotlib.pyplot as plt\n"
        f"data = {json.dumps(rows)}\n"
        "xs = [r.get('rain') or 0 for r in data]\n"
        "ys = [r.get('tx_count') or 0 for r in data]\n"
        "fig, ax = plt.subplots(figsize=(7,4))\n"
        "if data:\n"
        "    ax.scatter(xs, ys, alpha=0.5, s=10)\n"
        "else:\n"
        "    ax.text(0.5, 0.5, '데이터 부족 (Plan 5 join polish)', "
        "ha='center', va='center', transform=ax.transAxes)\n"
        "ax.set_xlabel('강수량 (mm)'); ax.set_ylabel('일별 거래 수')\n"
        "ax.set_title('강수량과 주유 거래 상관 ({n} points)'.format(n=len(data)))\n"
        "ax.grid(alpha=0.3); plt.tight_layout(); plt.savefig('out.png', dpi=120)\n"
    )
    ci = ci_execute(code)
    chart = (
        base64.b64encode(ci['images'][0]).decode()
        if ci.get('images') else ''
    )
    return {'rows': rows, 'chart_png_b64': chart}
