"""Neptune 집계 → matplotlib 차트 (Code Interpreter + 로컬 fallback) + Sonnet 4.6 요약.

property-join fallback — Plan 5 polish: switch to graph traversal once full
edges loaded. We aggregate FuelTransaction directly without the AT/REFUELED
edges. WeatherObservation/WeatherStation joins are plan 5 work.
"""
from __future__ import annotations
import base64
import io
import json
import logging
from collections import defaultdict
from typing import List

from api.services.neptune import open_cypher
from api.services.code_interpreter import execute as ci_execute

log = logging.getLogger("gcc.insights")


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


def _render_locally(rows: List[dict]) -> str:
    """로컬 matplotlib 렌더 (api 컨테이너 안). NanumGothic 없으면 영문 라벨로 fallback."""
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        # 한글 폰트가 시스템에 있으면 사용, 없으면 default (라벨 깨질 수 있음).
        try:
            plt.rcParams['font.family'] = 'NanumGothic'
            plt.rcParams['axes.unicode_minus'] = False
        except Exception:
            pass

        by_grade: defaultdict[str, list] = defaultdict(list)
        months = sorted({r['month'] for r in rows if r.get('month')})
        for r in rows:
            if r.get('grade'):
                by_grade[r['grade']].append((r.get('month'), r.get('n', 0)))

        fig, ax = plt.subplots(figsize=(9, 4))
        for grade, points in by_grade.items():
            pts = dict(points)
            ax.plot(months, [pts.get(m, 0) for m in months], label=grade, marker='o')
        ax.set_title('Monthly Fuel Grade Trend / 월별 유종별 거래 추이', fontsize=12)
        ax.set_xlabel('Month / 월')
        ax.set_ylabel('Transactions / 거래 수')
        ax.legend()
        ax.grid(alpha=0.3)
        plt.xticks(rotation=45)
        plt.tight_layout()

        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=120)
        plt.close(fig)
        return base64.b64encode(buf.getvalue()).decode()
    except Exception as e:
        log.exception("local matplotlib render failed: %s", e)
        return ''


def render_trend_chart(rows: List[dict]) -> str:
    """matplotlib PNG → base64. AgentCore Code Interpreter 시도 후 로컬 fallback.

    AgentCore가 image를 반환하지 않거나 (현재 PoC 환경에서 빈 image 반환) 실패 시
    로컬 matplotlib 렌더로 자동 전환 — 사용자 입장에서 차트는 항상 보인다.
    """
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
    try:
        out = ci_execute(code)
        if out.get('images'):
            return base64.b64encode(out['images'][0]).decode()
        log.warning("AgentCore returned empty images, falling back to local matplotlib")
    except Exception as e:
        log.warning("AgentCore execute failed (%s) — local fallback", e)
    return _render_locally(rows)
