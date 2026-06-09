"""Ops router — sidebar "파이프라인 (Ops)" pages.

Stub endpoints returning demo content for the 5 ops areas:
- ingest:    데이터 적재
- guardrail: 가드레일 4 토픽
- memory:    AgentCore Memory 히스토리
- eval:      평가 결과
- trace:     도구 호출 트레이스
"""
from __future__ import annotations
import random
from datetime import datetime, timedelta
from fastapi import APIRouter, Path

router = APIRouter(tags=["ops"])

_AREAS = {"ingest", "guardrail", "memory", "eval", "trace"}


def _ingest_data() -> dict:
    sources = [
        {"name": "Customer (Neptune)", "type": "graph", "rows": 50000, "last_run": "2026-05-04T13:20Z", "status": "success"},
        {"name": "FuelTransaction (Neptune)", "type": "graph", "rows": 139000, "last_run": "2026-05-04T13:20Z", "status": "success"},
        {"name": "GasStation (Neptune)", "type": "graph", "rows": 8500, "last_run": "2026-05-04T13:20Z", "status": "success"},
        {"name": "고객·주유소 (OpenSearch)", "type": "search", "rows": 58500, "last_run": "2026-05-04T13:25Z", "status": "success"},
        {"name": "opinet 가격 (CSV → FuelPrice)", "type": "csv", "rows": 12000, "last_run": "2026-05-01T00:00Z", "status": "success"},
        {"name": "KMA 기상관측 (→ WeatherObservation)", "type": "external", "rows": 4000, "last_run": "2026-05-04T13:30Z", "status": "success"},
    ]
    return {"summary": "data.load (loader) 적재 결과 — Neptune openCypher + OpenSearch bulk + opinet/KMA 외부 신호.",
            "sources": sources, "total_rows": sum(s["rows"] for s in sources)}


def _guardrail_data() -> dict:
    topics = [
        {"name": "CustomerPII",            "blocks_24h": 14, "ko": "고객 개인정보",
         "definition": "비식별고객번호·전화·주소 등 PII 원문 노출 차단"},
        {"name": "CompetitorDisparagement","blocks_24h": 4,  "ko": "경쟁사 비방",
         "definition": "SK에너지/현대오일뱅크/S-OIL 등 경쟁 주유 브랜드 부정 표현 차단"},
        {"name": "MarketingConsentViolation","blocks_24h": 6, "ko": "마케팅 미동의 발송",
         "definition": "마케팅 수신 미동의(약관) 고객 대상 SMS·발송 추천 차단"},
        {"name": "SensitiveMargin",        "blocks_24h": 2,  "ko": "영업비밀 마진",
         "definition": "주유소별 원가·마진 등 비공개 영업정보 노출 차단"},
    ]
    return {"summary": "Bedrock Guardrails 4 토픽 활성 (챗 입력 scrub + 인사이트 출력 필터). DRAFT 버전.",
            "topics": topics, "total_blocks_24h": sum(t["blocks_24h"] for t in topics)}


def _memory_data() -> dict:
    rng = random.Random("memory-demo")
    persona_ids = ['marketing', 'strategy', 'data-ai', 'crm', 'retail-ops']
    persona_kr = ['마케팅', '고객전략', '데이터·AI', 'CRM·회원사업', '리테일영업']
    sessions = []
    for i in range(8):
        sessions.append({
            "session_id": f"gcc-{persona_ids[i % 5]}-{rng.randint(10**12, 10**13)}",
            "persona": persona_kr[i % 5],
            "facts": rng.randint(2, 12),
            "last_active": (datetime.utcnow() - timedelta(hours=rng.randint(1, 72))).isoformat() + "Z",
        })
    return {"summary": "AgentCore Memory namespace `gcc`. 단기(세션) + 장기(7일) 양쪽 활성. DynamoDB 폴백 사용 중.",
            "sessions": sessions, "total_sessions": len(sessions)}


def _eval_data() -> dict:
    queries = [
        {"id": "A01", "scenario": "A", "name": "고급휘발유 셀프 주유소 검색", "p95_ms": 1820, "pass": True},
        {"id": "B01", "scenario": "B", "name": "VIP 재방문 캠페인 추천 (Cally)", "p95_ms": 6120, "pass": True},
        {"id": "B02", "scenario": "B", "name": "경쟁사 SK 단가 비교 (가드레일)", "p95_ms": 480, "pass": True},
        {"id": "C01", "scenario": "C", "name": "권역 매출 인사이트 카드", "p95_ms": 1650, "pass": True},
        {"id": "D01", "scenario": "D", "name": "출퇴근형 페르소나 매칭", "p95_ms": 920, "pass": True},
        {"id": "E01", "scenario": "E", "name": "고객 6-클러스터", "p95_ms": 65, "pass": True},
        {"id": "F01", "scenario": "F", "name": "VIP 룩어라이크 확장", "p95_ms": 240, "pass": True},
        {"id": "G01", "scenario": "G", "name": "SMS 캠페인 ROI", "p95_ms": 380, "pass": True},
        {"id": "H01", "scenario": "H", "name": "권역 경쟁 주유소 지도", "p95_ms": 840, "pass": True},
        {"id": "I01", "scenario": "I", "name": "마케팅 약관 동의 컴플라이언스", "p95_ms": 510, "pass": True},
        {"id": "N01", "scenario": "N", "name": "강수×경유 수요 (날씨)", "p95_ms": 9850, "pass": True},
    ]
    passed = sum(1 for q in queries if q["pass"])
    return {"summary": f"14 시나리오 평가 쿼리 — {passed}/{len(queries)} 통과 (p95 < 12s).",
            "queries": queries, "pass_rate": round(passed / len(queries), 3)}


def _trace_data() -> dict:
    rng = random.Random("trace-demo")
    tools = ["semantic_search", "neptune_subgraph", "nearest_stations", "cluster_predict", "campaign_simulator"]
    inputs = ["고급휘발유 셀프", "MATCH (c:Customer)-[:REFUELED]->()", "37.5,127.0 r=5km",
              "cust-000123 클러스터", "캠페인 CMP-2026-04 ROI"]
    traces = []
    for i in range(15):
        traces.append({
            "id": f"trace-{rng.randint(10**6, 10**7)}",
            "ts": (datetime.utcnow() - timedelta(minutes=i * 7)).isoformat() + "Z",
            "tool": tools[i % len(tools)],
            "duration_ms": rng.randint(120, 3500),
            "status": "ok" if i % 8 != 0 else "error",
            "input_summary": inputs[i % 5],
        })
    return {"summary": "최근 15개 도구 호출 트레이스. AgentCore Gateway 경유.",
            "traces": traces, "total": len(traces)}


_HANDLERS = {
    "ingest":    _ingest_data,
    "guardrail": _guardrail_data,
    "memory":    _memory_data,
    "eval":      _eval_data,
    "trace":     _trace_data,
}


@router.get("/ops/{area}")
def ops(area: str = Path(..., description="One of: ingest, guardrail, memory, eval, trace")) -> dict:
    if area not in _AREAS:
        return {"error": f"unknown area '{area}'", "valid": sorted(_AREAS)}
    return {"area": area, **_HANDLERS[area]()}


# ── Plan 5 Task 5.3.1 — Live metrics endpoints (Neptune + buffer-backed) ──
# These coexist with the legacy /ops/{area} demo endpoints above.
from api.services import ops_metrics as _opsm  # noqa: E402


@router.get("/ops/live/ingest")
def ops_ingest_live() -> dict:
    return _opsm.ingest_counts()


@router.get("/ops/live/memory")
def ops_memory_live() -> dict:
    return _opsm.memory_snapshot()


@router.get("/ops/live/eval")
def ops_eval_live() -> dict:
    return _opsm.eval_scoreboard()


@router.get("/ops/live/trace")
def ops_trace_live() -> dict:
    return _opsm.trace_timeline()


@router.get("/ops/live/guardrail")
def ops_guardrail_live() -> dict:
    return _opsm.guardrail_log()
