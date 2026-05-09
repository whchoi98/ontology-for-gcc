"""Neptune 집계 → matplotlib 차트 (Code Interpreter, NanumGothic) + Sonnet 4.6 요약.

property-join fallback — Plan 5 polish: switch to graph traversal once full
edges loaded. We aggregate FuelTransaction directly without the AT/REFUELED
edges. WeatherObservation/WeatherStation joins are plan 5 work.
"""
from __future__ import annotations
import base64
import json
from typing import List

from api.services.neptune import open_cypher
from api.services.code_interpreter import execute as ci_execute


def aggregate_fuel_grade_trend() -> List[dict]:
    """월별 유종별 거래 수 집계."""
    q = """MATCH (t:FuelTransaction)
           WITH substring(t.ts, 0, 7) AS month,
                t.fuel_grade AS grade,
                count(*) AS n
           RETURN month, grade, n
           ORDER BY month, grade"""
    res = open_cypher(query=q)
    return res.get('results', [])


def render_trend_chart(rows: List[dict]) -> str:
    """matplotlib PNG → base64 (returns '' on failure / empty rows)."""
    if not rows:
        return ''
    code = (
        "import json\n"
        "import collections\n"
        "import matplotlib.pyplot as plt\n"
        f"data = {json.dumps(rows)}\n"
        "by_grade = collections.defaultdict(list)\n"
        "months = sorted({r['month'] for r in data if r.get('month')})\n"
        "for r in data:\n"
        "    if r.get('grade'):\n"
        "        by_grade[r['grade']].append((r.get('month'), r.get('n', 0)))\n"
        "fig, ax = plt.subplots(figsize=(9,4))\n"
        "for grade, points in by_grade.items():\n"
        "    pts = dict(points)\n"
        "    ax.plot(months, [pts.get(m, 0) for m in months], label=grade, marker='o')\n"
        "ax.set_title('월별 유종별 거래 추이', fontsize=14)\n"
        "ax.set_xlabel('월'); ax.set_ylabel('거래 수')\n"
        "ax.legend(); ax.grid(alpha=0.3); plt.xticks(rotation=45)\n"
        "plt.tight_layout(); plt.savefig('out.png', dpi=120)\n"
    )
    out = ci_execute(code)
    if out.get('images'):
        return base64.b64encode(out['images'][0]).decode()
    return ''
