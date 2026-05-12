"""WeatherObservation × FuelTransaction 시도·일자 단위 join + 산점도 + Sonnet 요약.

쿼리 단순화: WeatherObservation은 시도·날짜 기준 작은 데이터셋(1,275 rows)이라
직접 가져오고, FuelTransaction은 Customer.sido_nm 매개로 시도·날짜 단위 집계해
Python 메모리에서 join. Cartesian product 회피.
"""
from __future__ import annotations
import base64
import io
import logging
from collections import defaultdict
from typing import Optional

from api.services.neptune import open_cypher
from api.services.bedrock import converse, ConverseRequest
from api.services.persona import system_prompt

log = logging.getLogger("gcc.weather")


def fetch_weather(sido_nm: Optional[str]) -> list[dict]:
    if sido_nm:
        q = """MATCH (w:WeatherObservation)
               WHERE w.sido_nm = $sido
               RETURN w.sido_nm AS sido, w.dt AS dt,
                      w.temp_c AS temp, w.rain_mm AS rain
               ORDER BY w.dt LIMIT 2000"""
        params = {'sido': sido_nm}
    else:
        q = """MATCH (w:WeatherObservation)
               RETURN w.sido_nm AS sido, w.dt AS dt,
                      w.temp_c AS temp, w.rain_mm AS rain
               ORDER BY w.dt LIMIT 2000"""
        params = {}
    try:
        res = open_cypher(query=q, parameters=params)
        return res.get('results', [])
    except Exception as e:
        log.warning("weather fetch failed: %s", e)
        return []


def fetch_tx_by_sido_date(sido_nm: Optional[str]) -> dict:
    """Customer.sido_nm을 매개로 FuelTransaction 시도·날짜 집계."""
    if sido_nm:
        q = """MATCH (c:Customer {sido_nm: $sido})
               WITH c LIMIT 5000
               MATCH (t:FuelTransaction {cust_id: c.cust_id})
               WITH c.sido_nm AS sido,
                    replace(substring(t.ts, 0, 10), '-', '') AS dt,
                    count(*) AS tx_count, sum(t.amount) AS rev
               RETURN sido, dt, tx_count, rev"""
        params = {'sido': sido_nm}
    else:
        q = """MATCH (c:Customer)
               WITH c LIMIT 5000
               MATCH (t:FuelTransaction {cust_id: c.cust_id})
               WITH c.sido_nm AS sido,
                    replace(substring(t.ts, 0, 10), '-', '') AS dt,
                    count(*) AS tx_count, sum(t.amount) AS rev
               RETURN sido, dt, tx_count, rev"""
        params = {}
    try:
        res = open_cypher(query=q, parameters=params)
        out: dict = {}
        for r in res.get('results', []):
            out[(r.get('sido'), r.get('dt'))] = r
        return out
    except Exception as e:
        log.warning("tx aggregation failed: %s", e)
        return {}


def render_chart(rows: list[dict]) -> str:
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        try:
            plt.rcParams['font.family'] = 'NanumGothic'
            plt.rcParams['axes.unicode_minus'] = False
        except Exception:
            pass

        fig, axes = plt.subplots(1, 2, figsize=(12, 4.5))

        if rows:
            rains = [r.get('rain') or 0 for r in rows]
            tx_counts = [r.get('tx_count') or 0 for r in rows]
            temps = [r.get('temp') or 0 for r in rows]

            sc1 = axes[0].scatter(rains, tx_counts, c=temps, cmap='coolwarm',
                                   s=18, alpha=0.65, edgecolors='none')
            axes[0].set_xlabel('강수량 (mm)')
            axes[0].set_ylabel('일별 거래 수')
            axes[0].set_title(f'강수 × 거래 ({len(rows)} 시도·날짜 쌍)')
            axes[0].grid(alpha=0.3)
            plt.colorbar(sc1, ax=axes[0], label='기온 (°C)')

            by_sido = defaultdict(list)
            for r in rows:
                by_sido[r.get('sido') or ''].append(r.get('tx_count') or 0)
            sido_names = list(by_sido.keys())[:17]
            avgs = [sum(by_sido[s]) / max(len(by_sido[s]), 1) for s in sido_names]
            axes[1].bar(range(len(sido_names)), avgs, color='#fb923c', alpha=0.8)
            axes[1].set_xticks(range(len(sido_names)))
            axes[1].set_xticklabels(sido_names, rotation=45, ha='right', fontsize=8)
            axes[1].set_ylabel('평균 일별 거래 수')
            axes[1].set_title('시도별 평균 거래량')
            axes[1].grid(alpha=0.3, axis='y')
        else:
            for ax in axes:
                ax.text(0.5, 0.5, '데이터 없음 (sido 입력 변경)',
                        ha='center', va='center', transform=ax.transAxes,
                        color='#94a3b8')

        plt.tight_layout()
        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=110)
        plt.close(fig)
        return base64.b64encode(buf.getvalue()).decode()
    except Exception as e:
        log.exception("local matplotlib failed: %s", e)
        return ''


def _summarize(
    persona_id: Optional[str],
    sido_nm: Optional[str],
    rows: list[dict],
    correlation: Optional[float],
) -> str:
    """Bedrock Sonnet 4.6으로 부서 페르소나 어조의 한국어 인사이트 요약."""
    if not rows:
        return ''
    # 시도별 평균 거래/매출/기온/강수 요약 (Sonnet에 보낼 압축 통계).
    by_sido: dict[str, list] = defaultdict(list)
    for r in rows:
        by_sido[r.get('sido') or '?'].append(r)
    sido_stats = []
    for s, items in list(by_sido.items())[:17]:
        avg_tx = sum(i.get('tx_count') or 0 for i in items) / max(len(items), 1)
        avg_rev = sum(i.get('rev') or 0 for i in items) / max(len(items), 1)
        avg_temp_vals = [i.get('temp') for i in items if i.get('temp') is not None]
        avg_temp = sum(avg_temp_vals) / max(len(avg_temp_vals), 1) if avg_temp_vals else None
        avg_rain_vals = [i.get('rain') for i in items if i.get('rain') is not None]
        avg_rain = sum(avg_rain_vals) / max(len(avg_rain_vals), 1) if avg_rain_vals else None
        sido_stats.append({
            'sido': s,
            'avg_tx': round(avg_tx, 1),
            'avg_rev_won': int(avg_rev),
            'avg_temp_c': round(avg_temp, 1) if avg_temp is not None else None,
            'avg_rain_mm': round(avg_rain, 2) if avg_rain is not None else None,
            'rows': len(items),
        })

    sys = system_prompt(persona_id, 'N')
    target = f"{sido_nm} 시도" if sido_nm else "전국 17 시도"
    # max_tokens 1024 + sido_stats 5개 + 짧은 prompt → 응답 ~10-15초로 단축.
    msg = (
        f"대상={target}, Pearson r={correlation if correlation is not None else 'N/A'}, rows={len(rows)}\n"
        f"통계: {sido_stats[:5]}\n\n"
        "5섹션 markdown, 각 섹션 2문장:\n"
        "## 헤드라인\n## 상관 해석\n## 시도별 비교\n## 날씨 영향\n## 부서 권고\n\n"
        "한국어, 출처 (real:KMA, real:FuelTransaction)."
    )
    try:
        out = converse(ConverseRequest(
            system=sys,
            messages=[{'role': 'user', 'content': [{'text': msg}]}],
            max_tokens=1024,
            temperature=0.3,
        ))
        return out['output']['message']['content'][0]['text']
    except Exception as e:
        log.warning("weather summary failed: %s", e)
        return f'(Sonnet 요약 생성 실패: {type(e).__name__})'


def join_weather_tx(weather_rows: list[dict], tx_by_key: dict) -> list[dict]:
    """시도·일자 단위 LEFT JOIN (Python 메모리 — Cartesian 회피)."""
    out: list[dict] = []
    for w in weather_rows:
        key = (w.get('sido'), w.get('dt'))
        tx = tx_by_key.get(key, {})
        out.append({
            'sido': w.get('sido'),
            'dt': w.get('dt'),
            'temp': w.get('temp'),
            'rain': w.get('rain'),
            'tx_count': tx.get('tx_count') or 0,
            'rev': tx.get('rev') or 0,
        })
    return out


def pearson_correlation(joined: list[dict]) -> Optional[float]:
    """강수량 × 거래량 Pearson r. n<5이거나 분산 0이면 None."""
    if len(joined) < 5:
        return None
    try:
        import statistics
        rains = [r.get('rain') or 0 for r in joined]
        txs = [r.get('tx_count') or 0 for r in joined]
        mean_r = statistics.mean(rains)
        mean_t = statistics.mean(txs)
        num = sum((r - mean_r) * (t - mean_t) for r, t in zip(rains, txs))
        den_r = sum((r - mean_r) ** 2 for r in rains) ** 0.5
        den_t = sum((t - mean_t) ** 2 for t in txs) ** 0.5
        if den_r > 0 and den_t > 0:
            return round(num / (den_r * den_t), 3)
    except Exception:
        return None
    return None


def correlate_by_sido(
    sido_nm: Optional[str] = None,
    persona_id: Optional[str] = None,
) -> dict:
    """Legacy sync entrypoint — kept for backward compat. /stream uses the
    individual helpers above with token-by-token Sonnet streaming for richer
    insights without the 30s CloudFront idle timeout risk."""
    weather_rows = fetch_weather(sido_nm)
    tx_by_key = fetch_tx_by_sido_date(sido_nm)
    joined = join_weather_tx(weather_rows, tx_by_key)
    chart = render_chart(joined)
    correlation = pearson_correlation(joined)
    summary = _summarize(persona_id, sido_nm, joined, correlation)

    return {
        # 전체 joined 행을 클라이언트로 — WeatherOverlay가 시도별 누적 강수/거래를
        # 계산하려면 일부 슬라이스가 아닌 전체가 필요. 1275 obs × 7 fields ≈ 90KB.
        'rows': joined,
        'total_rows': len(joined),
        'weather_count': len(weather_rows),
        'tx_keys_count': len(tx_by_key),
        'correlation_rain_tx': correlation,
        'chart_png_b64': chart,
        'summary': summary,
    }
