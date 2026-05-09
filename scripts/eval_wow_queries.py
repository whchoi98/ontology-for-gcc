"""
WOW query evaluation for ontology-for-gcc.

Runs scenario-defined queries against the deployed /api/search and /api/chat
endpoints and reports hit-rate against expected predicates.

A case is "successful" if its `expects(result_dict)` predicate returns truthy.
Each entry in `WOW_QUERIES` carries:
  - "scenario": "A" (search) | "B" (chat)
  - "persona": one of marketing/strategy/data-ai/crm/retail-ops
  - "query": str
  - "expects": callable(result_dict) -> bool
  - "min_results": int (informational)

Plan 3 cases:
  - 시나리오 A (3.2.5): 5 personas × 1 search query each (10 total)
  - 시나리오 B (3.4.5): 5 PDF Scenario 1 dialog 재현 chat queries

Usage:
    python scripts/eval_wow_queries.py --dry-run
    python scripts/eval_wow_queries.py --scenarios A
    python scripts/eval_wow_queries.py --scenarios A B --cf-domain <domain>
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.request

# Plan 3 wow cases — scenario A (search) + B (chat).
# Each entry: scenario, persona, query, expects (callable), min_results.
WOW_QUERIES: list[dict] = []


# ---- Plan 3.2.5 — 시나리오 A (search) — 5 personas × 1 case ----
WOW_QUERIES.extend([
    {
        'scenario': 'A',
        'persona': 'marketing',
        'query': '고급휘발유에 충성도가 높은 30대 직장인',
        'expects': lambda r: any(
            'premium' in str(x).lower() or '고급' in str(x)
            for x in r.get('results', [])
        ),
        'min_results': 3,
    },
    {
        'scenario': 'A',
        'persona': 'strategy',
        'query': '약관 동의 안 한 고객 중 매출 활발한 사람',
        'expects': lambda r: len(r.get('results', [])) >= 2 and any(
            'term' in str(x).lower() or '약관' in str(x)
            for x in r.get('subgraph', {}).get('nodes', [])
        ),
        'min_results': 2,
    },
    {
        'scenario': 'A',
        'persona': 'data-ai',
        'query': '디젤에서 고급휘발유로 전환한 고객',
        'expects': lambda r: 'diesel' in json.dumps(r).lower()
                              and 'premium' in json.dumps(r).lower(),
        'min_results': 2,
    },
    {
        'scenario': 'A',
        'persona': 'crm',
        'query': 'PLCC 보유 고객의 평균 객단가',
        'expects': lambda r: any('PLCC' in str(x) for x in r.get('results', [])),
        'min_results': 1,
    },
    {
        'scenario': 'A',
        'persona': 'retail-ops',
        'query': '셀프 주유소 매출 상위 시도',
        'expects': lambda r: any(
            'self' in str(x).lower() or '셀프' in str(x)
            for x in r.get('results', [])
        ),
        'min_results': 1,
    },
])


# ---- Plan 3.4.5 — 시나리오 B (chat agent) — 5 PDF Scenario 1 dialog 재현 ----
WOW_QUERIES.extend([
    {
        'scenario': 'B',
        'persona': 'marketing',
        'query': '고급휘발유 업셀링 캠페인을 실행할거야. 평균과 다른 고급휘발유 고객의 특징을 알고 싶어.',
        'expects': lambda r: ('고급' in str(r) or 'premium' in str(r).lower())
                              and 'tool' in str(r.get('trace', [])).lower(),
        'min_results': 1,
    },
    {
        'scenario': 'B',
        'persona': 'marketing',
        'query': '마케팅 대상 수가 적어. 유사고객 탐색 모델링해서 상위 20%도 같이 추출해줘.',
        'expects': lambda r: any(
            'lookalike' in str(t).lower() for t in r.get('trace', [])
        ) or 'lookalike_expand' in str(r),
        'min_results': 1,
    },
    {
        'scenario': 'B',
        'persona': 'data-ai',
        'query': '디젤에서 휘발유로 전환한 고객이 누군지 그래프로 보여줘.',
        'expects': lambda r: any(
            'behavior_change_detect' in str(t) for t in r.get('trace', [])
        ) or '전환' in str(r),
        'min_results': 1,
    },
    {
        'scenario': 'B',
        'persona': 'crm',
        'query': '지난 3개월 PLCC 가입자 중 고급휘발유 주유 이력 있는 사람 알려줘.',
        'expects': lambda r: any(
            'customer_lookup' in str(t) or 'semantic_search' in str(t)
            for t in r.get('trace', [])
        ),
        'min_results': 1,
    },
    {
        'scenario': 'B',
        'persona': 'strategy',
        'query': '서울 강남구 주변 우리 주유소와 경쟁 주유소 가격 비교해줘.',
        'expects': lambda r: any(
            'nearest_stations' in str(t) for t in r.get('trace', [])
        ),
        'min_results': 1,
    },
])


# ---- Plan 4 시나리오 D (persona_match) ----
WOW_QUERIES.extend([
    {'scenario': 'D', 'persona': 'marketing',
     'query': {'cust_ids': ['c001', 'c002', 'c003']},
     'expects': lambda r: len(r.get('matches', [])) >= 1, 'min_results': 1},
    {'scenario': 'D', 'persona': 'strategy',
     'query': {'cust_ids': ['c004', 'c005']},
     'expects': lambda r: any('best_persona' in m for m in r.get('matches', [])),
     'min_results': 1},
    {'scenario': 'D', 'persona': 'data-ai',
     'query': {'cust_ids': ['c001']},
     'expects': lambda r: 'all_scores' in (r.get('matches', [{}])[0] or {}),
     'min_results': 1},
    {'scenario': 'D', 'persona': 'crm',
     'query': {'cust_ids': ['c001', 'c002']},
     'expects': lambda r: 'crm' in str(r), 'min_results': 1},
    {'scenario': 'D', 'persona': 'retail-ops',
     'query': {'cust_ids': ['c003']},
     'expects': lambda r: 'retail-ops' in str(r), 'min_results': 1},
])


# ---- Plan 4 시나리오 F (lookalike) ----
WOW_QUERIES.extend([
    {'scenario': 'F', 'persona': 'data-ai',
     'query': {'seed_cust_ids': ['c001'], 'top_pct': 0.10},
     'expects': lambda r: r.get('count', 0) >= 100, 'min_results': 100},
    {'scenario': 'F', 'persona': 'marketing',
     'query': {'seed_cust_ids': ['c001', 'c002'], 'top_pct': 0.20},
     'expects': lambda r: r.get('count', 0) >= 200, 'min_results': 200},
    {'scenario': 'F', 'persona': 'strategy',
     'query': {'seed_cust_ids': ['c003']},
     'expects': lambda r: 'expanded' in r, 'min_results': 1},
    {'scenario': 'F', 'persona': 'crm',
     'query': {'seed_cust_ids': ['c004', 'c005', 'c006']},
     'expects': lambda r: r.get('count', 0) > 0, 'min_results': 1},
    {'scenario': 'F', 'persona': 'retail-ops',
     'query': {'seed_cust_ids': ['c007']},
     'expects': lambda r: 'expanded' in r, 'min_results': 1},
])


# ---- Plan 4 시나리오 I (compliance) ----
WOW_QUERIES.extend([
    {'scenario': 'I', 'persona': 'strategy',
     'query': {'target_cust_ids': ['c001', 'c002', 'c003'],
               'marketing_action': '고급휘발유 SMS 캠페인'},
     'expects': lambda r: 'recommendation' in r, 'min_results': 1},
    {'scenario': 'I', 'persona': 'crm',
     'query': {'target_cust_ids': ['c004'],
               'marketing_action': '위치기반 푸시 알림'},
     'expects': lambda r: 'eligible_count' in r, 'min_results': 1},
    {'scenario': 'I', 'persona': 'marketing',
     'query': {'target_cust_ids': ['c001', 'c002'],
               'marketing_action': '단순 SMS 안내'},
     'expects': lambda r: r.get('eligible_count', 0) >= 0, 'min_results': 1},
    {'scenario': 'I', 'persona': 'data-ai',
     'query': {'target_cust_ids': ['c005', 'c006'],
               'marketing_action': '개인화 추천 모델 적용'},
     'expects': lambda r: 'guardrail_violations' in r, 'min_results': 1},
    {'scenario': 'I', 'persona': 'retail-ops',
     'query': {'target_cust_ids': ['c007'],
               'marketing_action': '주유소 방문 행사 안내'},
     'expects': lambda r: 'recommendation' in r, 'min_results': 1},
])


# ---- Plan 4 시나리오 L (payment) ----
WOW_QUERIES.extend([
    {'scenario': 'L', 'persona': 'retail-ops', 'query': {'fuel_grade': 'premium'},
     'expects': lambda r: len(r.get('matrix', [])) >= 1, 'min_results': 1},
    {'scenario': 'L', 'persona': 'data-ai',
     'query': {'fuel_grade': None, 'sido_nm': '서울'},
     'expects': lambda r: any('서울' in str(m) for m in r.get('matrix', [])),
     'min_results': 1},
    {'scenario': 'L', 'persona': 'marketing', 'query': {},
     'expects': lambda r: 'matrix' in r, 'min_results': 1},
    {'scenario': 'L', 'persona': 'crm', 'query': {'fuel_grade': 'regular'},
     'expects': lambda r: 'matrix' in r, 'min_results': 1},
    {'scenario': 'L', 'persona': 'strategy', 'query': {},
     'expects': lambda r: any(m.get('revenue', 0) > 0 for m in r.get('matrix', [])),
     'min_results': 1},
])


# ---- Plan 4 시나리오 C (insights) ----
WOW_QUERIES.extend([
    {'scenario': 'C', 'persona': 'marketing',
     'query': {'topic': 'fuel_grade_trend'},
     'expects': lambda r: bool(r.get('chart_png_b64')) and len(r.get('summary', '')) > 20,
     'min_results': 1},
    {'scenario': 'C', 'persona': 'data-ai',
     'query': {'topic': 'fuel_grade_trend'},
     'expects': lambda r: 'rows' in r and len(r.get('rows') or []) > 0,
     'min_results': 1},
    {'scenario': 'C', 'persona': 'strategy',
     'query': {'topic': 'fuel_grade_trend'},
     'expects': lambda r: bool(r.get('chart_png_b64')), 'min_results': 1},
    {'scenario': 'C', 'persona': 'crm',
     'query': {'topic': 'fuel_grade_trend'},
     'expects': lambda r: bool(r.get('summary')), 'min_results': 1},
    {'scenario': 'C', 'persona': 'retail-ops',
     'query': {'topic': 'fuel_grade_trend'},
     'expects': lambda r: bool(r.get('chart_png_b64')), 'min_results': 1},
])


# ---- Plan 4 시나리오 E (cluster) ----
WOW_QUERIES.extend([
    {'scenario': 'E', 'persona': 'data-ai', 'query': {'write_back': False},
     'expects': lambda r: len(r.get('assignments', [])) > 0
                          and len(r.get('labels', [])) == 6,
     'min_results': 1},
    {'scenario': 'E', 'persona': 'marketing', 'query': {'write_back': False},
     'expects': lambda r: bool(r.get('chart_png_b64')), 'min_results': 1},
    {'scenario': 'E', 'persona': 'strategy', 'query': {'write_back': False},
     'expects': lambda r: len(r.get('centroids', [])) == 6, 'min_results': 1},
    {'scenario': 'E', 'persona': 'crm', 'query': {'write_back': False},
     'expects': lambda r: len(r.get('labels', [])) > 0, 'min_results': 1},
    {'scenario': 'E', 'persona': 'retail-ops', 'query': {'write_back': False},
     'expects': lambda r: 'assignments' in r, 'min_results': 1},
])


# ---- Plan 4 시나리오 G (campaign_roi) ----
WOW_QUERIES.extend([
    {'scenario': 'G', 'persona': 'marketing',
     'query': {'coupon_amt': 1000, 'target_segment_id': 'seg-001'},
     'expects': lambda r: 'projected_conversion' in r and bool(r.get('chart_png_b64')),
     'min_results': 1},
    {'scenario': 'G', 'persona': 'data-ai',
     'query': {'coupon_amt': 5000, 'target_segment_id': 'seg-005'},
     'expects': lambda r: r.get('projected_conversion', 0) > 0, 'min_results': 1},
    {'scenario': 'G', 'persona': 'crm',
     'query': {'coupon_amt': 2000, 'target_segment_id': 'seg-003'},
     'expects': lambda r: 'baseline_roi_pct' in r, 'min_results': 1},
    {'scenario': 'G', 'persona': 'strategy',
     'query': {'coupon_amt': 500, 'target_segment_id': 'seg-007'},
     'expects': lambda r: bool(r.get('chart_png_b64')), 'min_results': 1},
    {'scenario': 'G', 'persona': 'retail-ops',
     'query': {'coupon_amt': 3000, 'target_segment_id': 'seg-010'},
     'expects': lambda r: 'projected_conversion' in r, 'min_results': 1},
])


# ---- Plan 4 시나리오 H (network_map) ----
WOW_QUERIES.extend([
    {'scenario': 'H', 'persona': 'retail-ops', 'query': {},
     'expects': lambda r: len(r.get('stations_by_sido', [])) >= 5,
     'min_results': 5},
    {'scenario': 'H', 'persona': 'strategy', 'query': {'fuel_grade': 'premium'},
     'expects': lambda r: 'stations_by_sido' in r, 'min_results': 1},
    {'scenario': 'H', 'persona': 'marketing', 'query': {},
     'expects': lambda r: any(s.get('avg_price', 0) > 0
                              for s in r.get('stations_by_sido', [])),
     'min_results': 1},
    {'scenario': 'H', 'persona': 'data-ai', 'query': {},
     'expects': lambda r: any(s.get('brand') in {'GSC', 'SK', 'HD', 'SOIL'}
                              for s in r.get('stations_by_sido', [])),
     'min_results': 1},
    {'scenario': 'H', 'persona': 'crm', 'query': {},
     'expects': lambda r: 'stations_by_sido' in r, 'min_results': 1},
])


# ---- Plan 4 시나리오 N (weather) ----
WOW_QUERIES.extend([
    {'scenario': 'N', 'persona': 'data-ai', 'query': {},
     'expects': lambda r: 'rows' in r and bool(r.get('chart_png_b64')),
     'min_results': 1},
    {'scenario': 'N', 'persona': 'marketing', 'query': {'sido_nm': '서울'},
     'expects': lambda r: 'rows' in r, 'min_results': 0},
    {'scenario': 'N', 'persona': 'retail-ops', 'query': {'sido_nm': '경기'},
     'expects': lambda r: bool(r.get('chart_png_b64')), 'min_results': 0},
    {'scenario': 'N', 'persona': 'strategy', 'query': {},
     'expects': lambda r: 'rows' in r, 'min_results': 0},
    {'scenario': 'N', 'persona': 'crm', 'query': {'sido_nm': '부산'},
     'expects': lambda r: 'rows' in r, 'min_results': 0},
])


# ---- Plan 4 시나리오 J (external_signal) ----
WOW_QUERIES.extend([
    {'scenario': 'J', 'persona': 'strategy', 'query': {'cust_id': 'c001'},
     'expects': lambda r: 'narrative' in r and len(r.get('narrative', '')) > 30,
     'min_results': 1},
    {'scenario': 'J', 'persona': 'data-ai', 'query': {},
     'expects': lambda r: 'fused_rows' in r, 'min_results': 1},
    {'scenario': 'J', 'persona': 'marketing', 'query': {'cust_id': 'c002'},
     'expects': lambda r: bool(r.get('narrative')), 'min_results': 1},
    {'scenario': 'J', 'persona': 'crm', 'query': {'cust_id': 'c003'},
     'expects': lambda r: 'narrative' in r, 'min_results': 1},
    {'scenario': 'J', 'persona': 'retail-ops', 'query': {},
     'expects': lambda r: 'fused_rows' in r, 'min_results': 1},
])


def search_call(domain: str, query: str, persona_id: str, size: int = 10) -> dict:
    url = f"https://{domain}/api/search"
    payload = json.dumps({
        'query': query,
        'persona_id': persona_id,
        'size': size,
    }).encode('utf-8')
    req = urllib.request.Request(
        url, data=payload, headers={'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())


def chat_call(domain: str, message: str, persona_id: str) -> dict:
    """Call /api/chat (SSE) and aggregate the events into a single dict."""
    url = f"https://{domain}/api/chat"
    payload = json.dumps({
        'message': message,
        'persona_id': persona_id,
        'session_id': 'eval',
    }).encode('utf-8')
    req = urllib.request.Request(
        url, data=payload, headers={'Content-Type': 'application/json'},
    )
    aggregated: dict = {'trace': [], 'final_text': ''}
    with urllib.request.urlopen(req, timeout=120) as resp:
        for raw in resp:
            line = raw.decode('utf-8', errors='ignore').strip()
            if not line.startswith('data: '):
                continue
            try:
                ev = json.loads(line[6:])
            except json.JSONDecodeError:
                continue
            t = ev.get('type')
            d = ev.get('data')
            if t == 'log' and isinstance(d, dict) and 'tool_call' in d:
                aggregated['trace'].append(d.get('tool_call', ''))
            elif t == 'result' and isinstance(d, dict):
                aggregated.update(d)
    return aggregated


def evaluate(domain: str, scenarios: list[str], dry_run: bool = False) -> int:
    cases = [c for c in WOW_QUERIES if c.get('scenario') in scenarios]
    if dry_run:
        print(f"[dry-run] would evaluate {len(cases)} cases against https://{domain}")
        for i, case in enumerate(cases, 1):
            print(f"{i:>3} [{case['scenario']}/{case['persona']}] {case['query']}")
        return 0

    print(f"Wow query eval against https://{domain}\n")
    if not cases:
        print("0 cases evaluated (no matching scenarios).")
        return 0

    print(f"{'#':>3} {'sc':>3} {'pass':>5} | persona     | query")
    print('-' * 110)
    passes = 0
    for i, case in enumerate(cases, 1):
        q = case['query']
        persona = case.get('persona', 'marketing')
        expects = case.get('expects', lambda r: True)
        try:
            if case['scenario'] == 'A':
                res = search_call(domain, q, persona)
            else:  # 'B'
                res = chat_call(domain, q, persona)
            ok = bool(expects(res))
            mark = 'PASS' if ok else 'FAIL'
            if ok:
                passes += 1
            print(f"{i:>3} {case['scenario']:>3} {mark:>5} | {persona:11s} | {q}")
        except Exception as e:
            print(f"{i:>3} {case['scenario']:>3} {'ERR':>5} | {persona:11s} | {q}  -> {e}")
    print('-' * 110)
    rate = passes / len(cases) if cases else 0
    print(f"Pass rate: {passes}/{len(cases)} ({rate * 100:.1f}%)")
    threshold = 0.85
    if rate < threshold:
        print(f"\nFAIL: pass rate {rate * 100:.1f}% < {threshold * 100:.0f}% threshold.")
        return 1
    print(f"\nPASS: pass rate {rate * 100:.1f}% >= {threshold * 100:.0f}% threshold.")
    return 0


def main() -> None:
    p = argparse.ArgumentParser(description='Evaluate WOW queries for ontology-for-gcc')
    p.add_argument(
        '--cf-domain',
        default='d2vtgoziwcvh15.cloudfront.net',
        help='CloudFront domain serving /api/search and /api/chat',
    )
    p.add_argument(
        '--scenarios',
        nargs='+',
        default=['A'],
        help='Scenarios to evaluate (e.g. A B). Default: A.',
    )
    p.add_argument(
        '--dry-run', action='store_true',
        help='List cases without making network calls.',
    )
    args = p.parse_args()
    sys.exit(evaluate(args.cf_domain, args.scenarios, dry_run=args.dry_run))


if __name__ == '__main__':
    main()
