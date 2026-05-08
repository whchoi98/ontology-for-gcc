"""
WOW query evaluation for ontology-for-gcc.

Runs scenario-defined queries against the deployed /api/search endpoint and
reports hit-rate against expected keyword profiles.

Heuristic: a query is "successful" if at least one expected keyword appears in
the metadata/text blob of the top-N hits returned by the search API.

Cases are populated by:
  - Plan 3 (시나리오 A — primary semantic retrieval)
  - Plan 4 (시나리오 B–N — additional GCC scenarios)

Until then, WOW_QUERIES is an empty list and the script exits cleanly with
0 cases evaluated. Use --dry-run to validate the script without making any
network calls.

Usage:
    python scripts/eval_wow_queries.py --dry-run
    python scripts/eval_wow_queries.py [--cf-domain <domain>]
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.request

# Cases are added by Plan 3 (시나리오 A) and Plan 4 (B-N).
# Each entry is a dict with:
#   - "query": str — the natural-language query
#   - "keywords": list[str] — expected substrings in any top-N hit's text/metadata
#   - "scenario": str — e.g. "A", "B", ... (informational)
WOW_QUERIES: list[dict] = []  # populated by Plan 3 (시나리오 A) and Plan 4 (B-N)


def search(domain: str, query: str, top_k: int = 10) -> dict:
    url = f"https://{domain}/api/search"
    payload = json.dumps({"q": query, "top_k": top_k, "include_subgraph": False}).encode("utf-8")
    req = urllib.request.Request(url, data=payload,
                                  headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())


def evaluate(domain: str, dry_run: bool = False) -> int:
    if dry_run:
        print(f"[dry-run] would evaluate {len(WOW_QUERIES)} cases against https://{domain}")
    else:
        print(f"Wow query eval against https://{domain}\n")

    if not WOW_QUERIES:
        print("0 cases evaluated (WOW_QUERIES is empty — populated by Plan 3/4).")
        return 0

    if dry_run:
        # Print what we would run, but make no network calls.
        for i, case in enumerate(WOW_QUERIES, 1):
            print(f"{i:>3} | {case.get('query')}  (keywords: {case.get('keywords')})")
        return 0

    print(f"{'#':>3} {'pass':>5} {'hits':>5} | query")
    print("-" * 100)
    passes = 0
    for i, case in enumerate(WOW_QUERIES, 1):
        q = case["query"]
        keywords = case.get("keywords", [])
        try:
            res = search(domain, q)
            hits = res.get("hits", [])
            text_blob = " ".join((h.get("text", "") + " " + json.dumps(h.get("metadata", {}), ensure_ascii=False))
                                  for h in hits[:5]).lower()
            ok = any(k.lower() in text_blob for k in keywords)
            mark = "PASS" if ok else "FAIL"
            if ok:
                passes += 1
            print(f"{i:>3} {mark:>5} {len(hits):>5d} | {q}")
        except Exception as e:
            print(f"{i:>3} {'ERR':>5} {'-':>5} | {q}  -> {e}")
    print("-" * 100)
    rate = passes / len(WOW_QUERIES)
    print(f"Pass rate: {passes}/{len(WOW_QUERIES)} ({rate * 100:.1f}%)")
    threshold = 0.85
    if rate < threshold:
        print(f"\nFAIL: pass rate {rate * 100:.1f}% < {threshold * 100:.0f}% threshold. Consider:")
        print("  - more wow_moment SKUs / scenario coverage in ontology data")
        print("  - additional Korean synonyms / domain mappings")
        print("  - tuning RRF k or candidate_pool")
        return 1
    print(f"\nPASS: pass rate {rate * 100:.1f}% >= {threshold * 100:.0f}% threshold.")
    return 0


def main() -> None:
    p = argparse.ArgumentParser(description="Evaluate WOW queries for ontology-for-gcc")
    p.add_argument("--cf-domain", default="example.cloudfront.net",
                   help="CloudFront domain serving /api/search (overridden once Plan 6 deploys infra)")
    p.add_argument("--dry-run", action="store_true",
                   help="Validate the script and list cases without making network calls")
    args = p.parse_args()
    sys.exit(evaluate(args.cf_domain, dry_run=args.dry_run))


if __name__ == "__main__":
    main()
