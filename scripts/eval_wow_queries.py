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
