"""공통 Sonnet 4.6 인사이트 요약 helper — 모든 시나리오 페이지의 5섹션 markdown 생성.

max_tokens=2048: 5섹션 × 2-3문장 + "권고 3건" 한국어 응답은 1024로는 부족해
중간 절단 (stop_reason=max_tokens) 발생. 2048도 평균 ~18-22초로 CloudFront
30초 idle timeout 안전 마진 안.
"""
from __future__ import annotations
import logging
from typing import Optional

from api.services.bedrock import converse, converse_stream, ConverseRequest
from api.services.persona import system_prompt

log = logging.getLogger("gcc.insight_summary")


def summarize(
    persona_id: Optional[str],
    scenario_code: str,
    title: str,
    data_summary: str,
    sources: list[str],
    extra_instruction: str = '',
    max_tokens: int = 2048,
) -> str:
    """5 섹션 markdown 인사이트 생성.

    Parameters
    ----------
    persona_id : 'marketing' | 'strategy' | 'data-ai' | 'crm' | 'retail-ops'
    scenario_code : 'D' .. 'N'
    title : 시나리오 제목 (예: "페르소나 매칭")
    data_summary : 압축된 데이터 통계 (Sonnet에 보낼 input). 큰 raw rows 직접 넣지 말고 핵심 metric만.
    sources : ["real:Customer", "real:FuelTransaction"] 등 — markdown 출처 표기에 사용.
    extra_instruction : 시나리오별 추가 지침 (예: "PM+M 92 RON DIY 시그니처 강조").
    """
    sys = system_prompt(persona_id, scenario_code)
    src_str = ', '.join(sources) if sources else 'real'
    msg = (
        f"# 분석: {title}\n"
        f"데이터: {data_summary}\n"
        f"출처: {src_str}\n"
        f"{extra_instruction}\n\n"
        "다음 5섹션 markdown을 한국어로 작성. 각 섹션 2-3문장, 정량 수치 포함, 부서 페르소나 KPI 시점.\n"
        "마지막 권고 섹션은 반드시 3개 글머리표 (- ...)로 끝까지 완성.\n\n"
        "## 헤드라인\n"
        "## 핵심 발견\n"
        "## 부서 시점 해석\n"
        "## 비즈니스 함의\n"
        f"## 부서 권고 (3건)\n\n출처 ({src_str}) 명시."
    )
    try:
        out = converse(ConverseRequest(
            system=sys,
            messages=[{'role': 'user', 'content': [{'text': msg}]}],
            max_tokens=max_tokens,
            temperature=0.3,
        ))
        return out['output']['message']['content'][0]['text']
    except Exception as e:
        log.warning("insight summary failed for %s: %s", scenario_code, e)
        return f'(Sonnet 인사이트 생성 실패: {type(e).__name__}: {e})'


def _prompt(title: str, data_summary: str, src_str: str, extra_instruction: str) -> str:
    """Shared 5-section markdown prompt for both sync `summarize` and the
    streaming variant. Defined as a module-level helper so both code paths
    stay in lock-step — drift between them caused subtle output differences
    in the past."""
    return (
        f"# 분석: {title}\n"
        f"데이터: {data_summary}\n"
        f"출처: {src_str}\n"
        f"{extra_instruction}\n\n"
        "다음 5섹션 markdown을 한국어로 작성. 각 섹션 2-3문장, 정량 수치 포함, 부서 페르소나 KPI 시점.\n"
        "마지막 권고 섹션은 반드시 3개 글머리표 (- ...)로 끝까지 완성.\n\n"
        "## 헤드라인\n"
        "## 핵심 발견\n"
        "## 부서 시점 해석\n"
        "## 비즈니스 함의\n"
        f"## 부서 권고 (3건)\n\n출처 ({src_str}) 명시."
    )


def summarize_stream(
    persona_id: Optional[str],
    scenario_code: str,
    title: str,
    data_summary: str,
    sources: list[str],
    extra_instruction: str = '',
    max_tokens: int = 4096,
):
    """Yield text chunks from streaming Sonnet — for SSE pipelines.

    Use this when the page wants `delta` events for the insight summary.
    Same prompt shape as `summarize()`, just streamed token-by-token via
    Bedrock `converse_stream` so the user sees the report build live and
    CloudFront's 30s idle timeout never fires (each delta resets it).

    max_tokens=4096 (vs sync `summarize` at 2048): each delta event resets
    CloudFront's idle timer, so the total wall-clock can exceed 30s without
    the connection being torn down. This unlocks richer 5-section reports
    (~600 tokens/section average, 3 bullet-list 권고 with full reasoning).
    """
    sys = system_prompt(persona_id, scenario_code)
    src_str = ', '.join(sources) if sources else 'real'
    req = ConverseRequest(
        system=sys,
        messages=[{'role': 'user', 'content': [{'text': _prompt(title, data_summary, src_str, extra_instruction)}]}],
        max_tokens=max_tokens,
        temperature=0.3,
    )
    try:
        for ev in converse_stream(req):
            if 'contentBlockDelta' in ev:
                delta = ev['contentBlockDelta'].get('delta') or {}
                text = delta.get('text')
                if text:
                    yield text
    except Exception as e:
        log.warning("insight summary stream failed for %s: %s", scenario_code, e)
        yield f'\n\n(인사이트 스트림 실패: {type(e).__name__}: {e})'
