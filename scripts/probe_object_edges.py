#!/usr/bin/env python3
"""Probe the live Object Explorer API and report per-type relationship coverage.

Diagnoses / verifies the "관계도가 안 보임" (empty subgraph) bug (ADR-0022): for
each object type it samples N list items, fetches each detail, and reports how
many have ≥1 relationship edge. Run BEFORE and AFTER a Neptune edge reload to
confirm the fix.

    python3 scripts/probe_object_edges.py                       # gcc.whchoi.net, sample 10
    python3 scripts/probe_object_edges.py --base https://… --sample 20
    python3 scripts/probe_object_edges.py --types coupon,offer,campaign

Exit code 0 always (diagnostic); read the table. Needs DEMO_PUBLIC_MODE or a
session cookie on the target (the deployed demo has DEMO_PUBLIC_MODE on).
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.parse
import urllib.request


def _get(base: str, path: str, timeout: int = 20):
    try:
        with urllib.request.urlopen(base + path, timeout=timeout) as r:
            return json.loads(r.read().decode())
    except Exception as e:  # noqa: BLE001 — diagnostic tool, never crash mid-sweep
        return {"__err": str(e)[:160]}


def probe_type(base: str, slug: str, sample: int) -> dict:
    lst = _get(base, f"/api/objects/{slug}?limit={sample}")
    if "__err" in lst:
        return {"slug": slug, "error": lst["__err"]}
    items = lst.get("items", [])
    total = lst.get("total", 0)
    with_edges = 0
    max_edges = 0
    for it in items:
        det = _get(base, f"/api/objects/{slug}/{urllib.parse.quote(str(it['id']))}")
        edges = len(det.get("subgraph", {}).get("edges", [])) if "__err" not in det else 0
        if edges > 0:
            with_edges += 1
        max_edges = max(max_edges, edges)
    return {
        "slug": slug,
        "total": total,
        "sampled": len(items),
        "with_edges": with_edges,
        "max_edges": max_edges,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://gcc.whchoi.net")
    ap.add_argument("--sample", type=int, default=10)
    ap.add_argument("--types", default="", help="comma list; default = all from /api/objects/types")
    args = ap.parse_args(argv)

    base = args.base.rstrip("/")
    if args.types:
        slugs = [s.strip() for s in args.types.split(",") if s.strip()]
    else:
        meta = _get(base, "/api/objects/types")
        slugs = sorted(meta.get("types", []))
        if not slugs:
            print(f"could not list types from {base}: {meta}", file=sys.stderr)
            return 0

    print(f"Object Explorer edge coverage @ {base} (sample {args.sample})\n")
    print(f"{'slug':22}{'total':>10}{'sampled':>8}{'with_edges':>12}{'max_edges':>10}  status")
    print("-" * 78)
    zero = []
    for slug in slugs:
        r = probe_type(base, slug, args.sample)
        if "error" in r:
            print(f"{slug:22}{'ERR: ' + r['error']}")
            continue
        status = "ok" if r["with_edges"] else "NO EDGES"
        if not r["with_edges"]:
            zero.append(slug)
        print(f"{r['slug']:22}{r['total']:>10}{r['sampled']:>8}"
              f"{r['with_edges']:>12}{r['max_edges']:>10}  {status}")

    if zero:
        print(f"\n{len(zero)} type(s) with zero edges in the sample: {', '.join(zero)}")
        print("(payment_method/fuel_product/channel are static catalogs — expected.)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
