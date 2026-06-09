"""Loader key-alignment regression tests (Object Explorer 0-edge bug, ADR-0022).

Root cause: nodes were MERGEd on a synthesized/scan pk (Offer.offer_id=campaign_cd,
Coupon.coupon_id=campaign_cd) while the relationship edges matched on the natural
key (offer_cd / coupon_no). Edges therefore attached to differently-keyed orphan
stubs instead of the full nodes the Object Explorer detail endpoint fetches, so the
relationship graph was empty. These tests pin the alignment so it cannot regress.
"""
from __future__ import annotations

import pytest

from data.loader import cypher_bulk as cb


def _node_pk(label: str) -> str:
    for _prefix, lab, pk in cb.NODE_MAP:
        if lab == label:
            return pk
    raise AssertionError(f"{label} not in NODE_MAP")


def _edge(edge_type: str) -> cb.EdgeSpec:
    for spec in cb.EDGE_MAP:
        if spec.edge_type == edge_type:
            return spec
    raise AssertionError(f"{edge_type} not in EDGE_MAP")


# ── Node pk alignment ───────────────────────────────────────────────────
def test_offer_node_pk_is_offer_cd():
    # Offer NDJSON carries offer_cd (clean, unique). Merging on offer_id forced
    # the scan fallback to campaign_cd, collapsing distinct offers.
    assert _node_pk("Offer") == "offer_cd"


def test_coupon_node_pk_is_coupon_no():
    assert _node_pk("Coupon") == "coupon_no"


# ── Edge match-field == node pk (the alignment invariant) ───────────────
def test_offer_edges_match_on_node_pk():
    pk = _node_pk("Offer")
    has_offer = _edge("HAS_OFFER")      # Campaign -> Offer
    issues = _edge("ISSUES")            # Offer -> Coupon
    assert has_offer.target_label == "Offer" and has_offer.target_match_field == pk
    assert issues.source_label == "Offer" and issues.source_match_field == pk


def test_coupon_edges_match_on_node_pk():
    pk = _node_pk("Coupon")
    of_coupon = _edge("OF_COUPON")      # CouponUse -> Coupon
    issues = _edge("ISSUES")            # Offer -> Coupon
    redeemed = _edge("REDEEMED_AS")     # Coupon -> CouponUse
    assert of_coupon.target_label == "Coupon" and of_coupon.target_match_field == pk
    assert issues.target_label == "Coupon" and issues.target_match_field == pk
    assert redeemed.source_label == "Coupon" and redeemed.source_match_field == pk


# ── FuelPrice PRICED_AT must target the synthesized composite pk ─────────
def test_priced_at_targets_price_id_via_transform():
    spec = _edge("PRICED_AT")
    assert spec.target_label == "FuelPrice"
    assert spec.target_match_field == _node_pk("FuelPrice")  # == 'price_id'
    assert spec.transform is not None, "PRICED_AT needs a transform to build price_id"


def test_priced_at_transform_matches_synthesized_pk():
    spec = _edge("PRICED_AT")
    row = {"station_opinet_no": "A1", "dt": "20260506", "fuel_grade": "diesel", "amount": 1700}
    pair = spec.transform(row)
    assert pair is not None
    assert pair["s"] == "A1"                        # GasStation.opinet_no
    # target must equal what load_label synthesizes as FuelPrice.price_id
    assert pair["t"] == cb._synthesize_fuel_price_pk(row)  # 'A1-20260506-diesel'


# ── Edge endpoints use MATCH (no orphan stubs), only the rel is MERGEd ───
def test_edge_query_matches_endpoints_and_merges_only_relationship():
    spec = _edge("REFUELED")
    q = cb._build_edge_query(spec)
    # endpoints resolved against EXISTING full nodes, never auto-created
    assert "MATCH (a:" in q and "MATCH (b:" in q
    assert "MERGE (a)-[:" in q
    # the old orphan-creating pattern must be gone
    assert "MERGE (a:" not in q and "MERGE (b:" not in q


# ── Object Explorer detail must look up the SAME key the node is merged on ─
def test_object_registry_id_prop_matches_node_pk():
    from api.routers.objects import _TYPE_REGISTRY
    # offer/coupon detail anchor is MATCH (n:Label {id_prop: $oid}); id_prop must
    # equal the node MERGE pk or the detail lookup 404s / finds the wrong node.
    assert _TYPE_REGISTRY["offer"]["id_prop"] == _node_pk("Offer")    # offer_cd
    assert _TYPE_REGISTRY["coupon"]["id_prop"] == _node_pk("Coupon")  # coupon_no
