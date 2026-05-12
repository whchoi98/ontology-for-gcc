# api/routers/weather.py — 시나리오 N: 날씨 × 주유 패턴
from __future__ import annotations
from typing import Optional

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.services.weather_pipeline import (
    correlate_by_sido,
    fetch_weather,
    fetch_tx_by_sido_date,
    join_weather_tx,
    pearson_correlation,
    render_chart,
)
from api.services.insight_summary import summarize_stream
from api.services.sse import stream_phases

router = APIRouter(prefix='/api/weather', tags=['weather'])


class CorrRequest(BaseModel):
    persona_id: Optional[str] = 'data-ai'
    sido_nm: Optional[str] = None
    nl_query: Optional[str] = None  # 자유 자연어 질문 — Sonnet 인사이트 추가 instruction


@router.post('/correlate')
def correlate(req: CorrRequest) -> dict:
    """Legacy JSON endpoint — single round-trip. /stream gives richer
    insights + live pipeline visibility."""
    return correlate_by_sido(req.sido_nm, req.persona_id)


def _data_summary(req: CorrRequest, joined: list, correlation):
    """Compact stats for the Sonnet streaming insight."""
    from collections import defaultdict
    by_sido: dict = defaultdict(list)
    for r in joined:
        by_sido[r.get('sido') or '?'].append(r)
    sido_stats = []
    for s, items in list(by_sido.items())[:17]:
        avg_tx = sum(i.get('tx_count') or 0 for i in items) / max(len(items), 1)
        avg_rev = sum(i.get('rev') or 0 for i in items) / max(len(items), 1)
        temps = [i.get('temp') for i in items if i.get('temp') is not None]
        rains = [i.get('rain') for i in items if i.get('rain') is not None]
        sido_stats.append({
            'sido': s,
            'avg_tx': round(avg_tx, 1),
            'avg_rev_won': int(avg_rev),
            'avg_temp_c': round(sum(temps) / max(len(temps), 1), 1) if temps else None,
            'avg_rain_mm': round(sum(rains) / max(len(rains), 1), 2) if rains else None,
            'rows': len(items),
        })
    target = f"{req.sido_nm} 시도" if req.sido_nm else "전국 17 시도"
    return (
        f"대상: {target}. Pearson r(강수×거래) = {correlation if correlation is not None else 'N/A'}, "
        f"join rows = {len(joined)}. "
        f"시도별 평균 통계 (상위 5): {sido_stats[:5]}. "
        f"전체 시도 수: {len(sido_stats)}."
    )


@router.post('/stream')
async def correlate_stream(req: CorrRequest) -> StreamingResponse:
    """SSE pipeline (실제 7단계 — fake setTimeout 시뮬레이션 제거):
      1. fetch_weather — KMA WeatherObservation 조회
      2. fetch_tx — Customer.sido_nm 매개 FuelTransaction 집계
      3. joining — 시도·일자 단위 LEFT JOIN
      4. correlating — Pearson r(강수×거래)
      5. rendering_chart — matplotlib 산점도 + 시도별 평균
      6. summary_streaming — Sonnet 4.6 5섹션 인사이트 (delta)
      7. summary_done + result
    """
    async def gen():
        # ── 1. fetch_weather
        yield ('phase', {'name': 'querying_neptune',
                         'desc': f'KMA WeatherObservation 조회 ({req.sido_nm or "전국 17"})'})
        weather_rows = fetch_weather(req.sido_nm)
        yield ('phase', {'name': 'neptune_done',
                         'desc': f'기상 관측 {len(weather_rows)} rows'})

        # ── 2. fetch_tx
        yield ('phase', {'name': 'aggregating',
                         'desc': 'FuelTransaction 시도·날짜 집계'})
        tx_by_key = fetch_tx_by_sido_date(req.sido_nm)
        yield ('phase', {'name': 'aggregated',
                         'desc': f'거래 키 {len(tx_by_key)} (sido·dt)'})

        # ── 3. join
        yield ('phase', {'name': 'merging', 'desc': '시도·일자 단위 LEFT JOIN'})
        joined = join_weather_tx(weather_rows, tx_by_key)
        yield ('phase', {'name': 'compute_done', 'desc': f'join {len(joined)} rows'})

        # ── 4. correlate
        yield ('phase', {'name': 'computing', 'desc': 'Pearson 상관계수 (강수 × 거래)'})
        correlation = pearson_correlation(joined)

        # ── 5. chart
        yield ('phase', {'name': 'rendering_chart', 'desc': 'matplotlib 산점도'})
        chart = render_chart(joined)
        yield ('phase', {'name': 'chart_ready',
                         'desc': f'r = {correlation if correlation is not None else "N/A"}'})

        # ── 6. summary_streaming (Sonnet 4.6 5섹션, 4096 토큰)
        yield ('phase', {'name': 'summary_streaming',
                         'desc': 'Sonnet 4.6 풍부한 5섹션 인사이트'})
        base_extra = (
            '강수일 / 폭염일 / 폭설일 → 셀프 vs 풀서비스 / 등유 / 디젤 비중 변화 같은 cross-channel '
            '인사이트 강조. 시도별 차이 + 부서 KPI 시점 + 실행 가능 캠페인 권고.'
        )
        if req.nl_query:
            # 사용자 자연어 질문을 우선 답변하면서 기본 분석도 유지.
            extra = f'사용자 질문: "{req.nl_query}"\n위 질문에 우선 직접 답하고, 이어서: {base_extra}'
        else:
            extra = base_extra
        chunks: list[str] = []
        for chunk in summarize_stream(
            req.persona_id, 'N', '날씨 × 주유 패턴',
            _data_summary(req, joined, correlation),
            sources=['real:KMA WeatherObservation', 'real:FuelTransaction', 'real:Customer'],
            extra_instruction=extra,
        ):
            chunks.append(chunk)
            yield ('delta', {'channel': 'summary', 'text': chunk})
        summary = ''.join(chunks)
        yield ('phase', {'name': 'summary_done', 'len': len(summary)})

        # ── 7. result
        yield ('result', {
            # 전체 joined 행 — WeatherOverlay 17 시도 누적이 작은 sample에 갇히지 않게.
            'rows': joined,
            'total_rows': len(joined),
            'weather_count': len(weather_rows),
            'tx_keys_count': len(tx_by_key),
            'correlation_rain_tx': correlation,
            'chart_png_b64': chart,
            'summary': summary,
        })

    return StreamingResponse(stream_phases(gen()), media_type='text/event-stream')
