"""Object Explorer — /api/objects/{slug}, /api/objects/{slug}/{id}.

Palantir Foundry-style "Object Type Browser" pattern adapted for the GCC
M&M본부 25-class ontology (5 도메인: 고객·회원 / 행동·거래 / 마케팅 /
운영·상품 / 컴플·외부 / 시간). Returns retail-compatible {ObjectList,
ObjectDetail} shapes that the frontend's 3-pane layout (list + Cytoscape
1-hop graph + property inspector) consumes directly.

Slugs are snake_case to match the Sidebar URLs
(`/objects/fuel_transaction`, `/objects/gas_station`, etc.).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from api.services.neptune import open_cypher

router = APIRouter(prefix="/api/objects", tags=["objects"])


# ── Type registry ──────────────────────────────────────────────────────
# slug → (Neptune label, primary key prop, name prop, ordering Cypher tail)
# Order strategy is per-type and surfaces the most "interesting" rows
# first (e.g. Customer by REFUELED fanout, GasStation by tx count).
_TYPE_REGISTRY: Dict[str, Dict[str, str]] = {
    # ── 고객·회원 (5) ───────────────────────────────────────
    "customer": {
        "label": "Customer", "id_prop": "cust_id", "name_prop": "cust_id",
        "order_by": (
            "OPTIONAL MATCH (n)-[:REFUELED]->(t:FuelTransaction) "
            "WITH n, count(t) AS tx_count "
            "RETURN n, tx_count AS rank_score "
            "ORDER BY tx_count DESC"
        ),
    },
    "persona": {
        "label": "Persona", "id_prop": "persona_id", "name_prop": "name_kr",
        "order_by": (
            "OPTIONAL MATCH (n)<-[:HAS_PERSONA]-(c:Customer) "
            "WITH n, count(c) AS members "
            "RETURN n, members AS rank_score "
            "ORDER BY members DESC"
        ),
    },
    "cluster": {
        "label": "Cluster", "id_prop": "cluster_id", "name_prop": "label",
        "order_by": (
            "OPTIONAL MATCH (n)<-[:BELONGS_TO]-(c:Customer) "
            "WITH n, count(c) AS members "
            "RETURN n, members AS rank_score "
            "ORDER BY members DESC"
        ),
    },
    "segment": {
        "label": "Segment", "id_prop": "segment_id", "name_prop": "label",
        "order_by": (
            "OPTIONAL MATCH (n)<-[:IN_SEGMENT]-(c:Customer) "
            "WITH n, count(c) AS members "
            "RETURN n, members AS rank_score "
            "ORDER BY members DESC"
        ),
    },
    "member": {
        "label": "Member", "id_prop": "member_id", "name_prop": "grade",
        "order_by": (
            "WITH n, coalesce(n.points,0) AS pts "
            "RETURN n, pts AS rank_score ORDER BY pts DESC"
        ),
    },
    # ── 행동·거래 (5) ─────────────────────────────────────
    "fuel_transaction": {
        "label": "FuelTransaction", "id_prop": "tx_id", "name_prop": "tx_id",
        "order_by": (
            "WITH n, coalesce(n.amount,0) AS amt "
            "RETURN n, amt AS rank_score "
            "ORDER BY n.ts DESC, amt DESC"
        ),
    },
    "app_event": {
        "label": "AppEvent", "id_prop": "event_id", "name_prop": "event_action",
        "order_by": "RETURN n, 0 AS rank_score ORDER BY n.ts DESC",
    },
    "survey_response": {
        # Loader registers Survey nodes (label "Survey", not "SurveyResponse")
        # though the Pydantic class is SurveyResponse. URL slug stays
        # `survey_response` to match the Sidebar.
        "label": "Survey", "id_prop": "response_id", "name_prop": "response_id",
        "order_by": (
            "WITH n, size(coalesce(n.inconvenience_factors,[])) AS f "
            "RETURN n, f AS rank_score "
            "ORDER BY f DESC, n.ts DESC"
        ),
    },
    "coupon_use": {
        "label": "CouponUse", "id_prop": "use_id", "name_prop": "coupon_no",
        "order_by": (
            "WITH n, coalesce(n.use_amt,0) AS a "
            "RETURN n, a AS rank_score ORDER BY a DESC"
        ),
    },
    "payment_method": {
        # Not loaded into Neptune — served from static catalog below.
        "label": "PaymentMethod", "id_prop": "method_id", "name_prop": "label_kr",
        "order_by": "RETURN n, 0 AS rank_score ORDER BY n.method_id",
    },
    # ── 마케팅 (6) ────────────────────────────────────────
    "campaign": {
        "label": "Campaign", "id_prop": "campaign_cd", "name_prop": "name_kr",
        "order_by": (
            "OPTIONAL MATCH (n)-[:SENT_SMS]->(s:CampaignSMS) "
            "WITH n, count(s) AS sms_count "
            "RETURN n, sms_count AS rank_score "
            "ORDER BY n.start_dt DESC"
        ),
    },
    "coupon": {
        # id_prop == Coupon MERGE pk (coupon_no) so detail anchor + neighbors
        # resolve the full node the OF/ISSUES/REDEEMED_AS edges attach to (ADR-0022).
        "label": "Coupon", "id_prop": "coupon_no", "name_prop": "coupon_no",
        "order_by": (
            "WITH n, coalesce(n.denomination_amt,0) AS d "
            "RETURN n, d AS rank_score ORDER BY d DESC"
        ),
    },
    "offer": {
        # id_prop == Offer MERGE pk (offer_cd) — was offer_id (=campaign_cd), which
        # collapsed offers and detached HAS_OFFER/ISSUES edges (ADR-0022).
        "label": "Offer", "id_prop": "offer_cd", "name_prop": "offer_nm",
        "order_by": "RETURN n, 0 AS rank_score ORDER BY n.offer_cd",
    },
    "channel": {
        # Not loaded — static catalog (SMS/PUSH/EMAIL/BANNER).
        "label": "Channel", "id_prop": "channel_id", "name_prop": "label_kr",
        "order_by": "RETURN n, 0 AS rank_score ORDER BY n.channel_id",
    },
    "campaign_sms": {
        "label": "CampaignSMS", "id_prop": "sms_id", "name_prop": "sms_id",
        "order_by": "RETURN n, 0 AS rank_score ORDER BY n.sent_dt DESC",
    },
    "campaign_aggregation": {
        "label": "CampaignAggregation", "id_prop": "agg_id", "name_prop": "campaign_cd",
        "order_by": (
            "WITH n, coalesce(n.roi_pct,0.0) AS r "
            "RETURN n, toInteger(r) AS rank_score ORDER BY r DESC"
        ),
    },
    # ── 운영·상품 (4) ─────────────────────────────────────
    "fuel_product": {
        # Not loaded — static catalog (5 grades).
        "label": "FuelProduct", "id_prop": "product_id", "name_prop": "label_kr",
        "order_by": "RETURN n, coalesce(n.octane_ron,0) AS rank_score ORDER BY n.octane_ron DESC",
    },
    "gas_station": {
        "label": "GasStation", "id_prop": "opinet_no", "name_prop": "name",
        # WHERE opinet_no IS NOT NULL excludes orphan stubs created by the AT
        # edge MERGE on site_cd (synthetic store_cds have no real station). Those
        # stubs otherwise top the tx_count order and 404 on detail (ADR-0022).
        "order_by": (
            "WHERE n.opinet_no IS NOT NULL "
            "OPTIONAL MATCH (n)<-[:AT]-(t:FuelTransaction) "
            "WITH n, count(t) AS tx_count "
            "RETURN n, tx_count AS rank_score "
            "ORDER BY tx_count DESC"
        ),
    },
    "fuel_price": {
        "label": "FuelPrice", "id_prop": "price_id", "name_prop": "station_opinet_no",
        "order_by": (
            "WITH n, coalesce(n.amount,0) AS a "
            "RETURN n, a AS rank_score ORDER BY n.dt DESC"
        ),
    },
    "region": {
        "label": "Region", "id_prop": "region_cd", "name_prop": "sido_nm",
        "order_by": (
            "OPTIONAL MATCH (n)<-[:IN]-(s:GasStation) "
            "WITH n, count(s) AS stations "
            "RETURN n, stations AS rank_score "
            "ORDER BY stations DESC"
        ),
    },
    # ── 컴플·외부 (4) ─────────────────────────────────────
    "term": {
        "label": "Term", "id_prop": "term_cd", "name_prop": "name_kr",
        "order_by": "RETURN n, 0 AS rank_score ORDER BY n.term_cd",
    },
    "term_agreement": {
        "label": "TermAgreement", "id_prop": "agreement_id", "name_prop": "agreement_id",
        "order_by": "RETURN n, 0 AS rank_score ORDER BY n.approval_dt DESC",
    },
    "consumption_index": {
        "label": "ConsumptionIndex", "id_prop": "idx_id", "name_prop": "cust_id",
        "order_by": (
            "WITH n, coalesce(n.gas_station_pref_idx,0.0) AS p "
            "RETURN n, toInteger(p*100) AS rank_score ORDER BY p DESC"
        ),
    },
    "weather_observation": {
        "label": "WeatherObservation", "id_prop": "weather_id", "name_prop": "sido_nm",
        "order_by": (
            "WITH n, coalesce(n.temp_c, 0.0) AS t "
            "RETURN n, toInteger(t*10) AS rank_score "
            "ORDER BY n.dt DESC, n.hour DESC"
        ),
    },
    # ── 시간 (1) ──────────────────────────────────────────
    "time_slot": {
        "label": "TimeSlot", "id_prop": "slot_id", "name_prop": "label_kr",
        "order_by": "WITH n, coalesce(n.hour_start,0) AS h RETURN n, h AS rank_score ORDER BY h",
    },
}


# ── Static catalogs for unloaded classes ──────────────────────────────
# These 3 classes exist in the schema but are NOT loaded into Neptune
# (intentional — saves loader time for static reference data). Serve them
# from the API so the Object Explorer stays usable across all 25 classes.
_PAYMENT_METHODS = [
    {"method_id": "PLCC",   "label_kr": "PLCC (GS&POINT 신용카드)",   "type": "credit",   "description": "GS Caltex 전용 PLCC — 주유 적립 4%·연회비 면제·1만건/월 한도"},
    {"method_id": "credit", "label_kr": "일반 신용카드",            "type": "credit",   "description": "기타 신용카드 — KB·삼성·현대 등 BC망 카드 일반 결제"},
    {"method_id": "smart",  "label_kr": "보너스카드앱 / Energy+",      "type": "app_pay",  "description": "GSC 앱 페이 — 1회 인증 후 QR/바코드 결제 + 즉시 적립"},
    {"method_id": "point",  "label_kr": "포인트 차감",            "type": "points",   "description": "보너스 포인트 사용 — KIXX/멤버십 포인트로 결제 (1P=1원)"},
    {"method_id": "cash",   "label_kr": "현금",                    "type": "cash",     "description": "현금 결제 — 주유소 카운터·키오스크 직접 입금"},
    {"method_id": "kakaopay","label_kr": "카카오페이",            "type": "fintech",  "description": "카카오페이 머니/계좌 — QR 결제 + 카카오톡 알림"},
    {"method_id": "naverpay","label_kr": "네이버페이",            "type": "fintech",  "description": "네이버페이 포인트/머니 — QR + 적립"},
    {"method_id": "samsungpay","label_kr": "삼성페이",            "type": "wallet",   "description": "Samsung Wallet — NFC/MST 비접촉 결제"},
]

_FUEL_PRODUCTS = [
    {"product_id": "regular",  "grade": "regular",  "label_kr": "휘발유 (Regular)",       "octane_ron": 91, "description": "일반 휘발유 — 91 RON, 가장 보편적인 경차/세단 연료"},
    {"product_id": "premium",  "grade": "premium",  "label_kr": "고급휘발유 (Premium)",   "octane_ron": 95, "description": "고급 휘발유 — 95 RON, 고압축 엔진·터보·수입차 권장"},
    {"product_id": "diesel",   "grade": "diesel",   "label_kr": "경유 (Diesel)",          "octane_ron": 0,  "description": "경유 — 화물·SUV·디젤 세단 연료 (CN 51 이상)"},
    {"product_id": "kerosene", "grade": "kerosene", "label_kr": "등유 (Kerosene)",        "octane_ron": 0,  "description": "실내 난방·취사 등유 (보일러·가정용)"},
    {"product_id": "lpg",      "grade": "lpg",      "label_kr": "LPG (액화석유가스)",     "octane_ron": 0,  "description": "택시·트럭·렌터카 LPG — 충전소·코스트 효율 우위"},
]

_CHANNELS = [
    {"channel_id": "SMS",    "label_kr": "SMS / LMS",         "type": "telco",     "description": "통신사 단문/장문 메시지 — DW_CP_SM_CAMP_MSG 발송 채널, 99.5% 도달"},
    {"channel_id": "PUSH",   "label_kr": "앱 푸시 알림",      "type": "mobile",    "description": "Energy+ / 보너스카드앱 푸시 — 토큰 기반 + 사용자 권한 동의 필요"},
    {"channel_id": "EMAIL",  "label_kr": "이메일",             "type": "email",     "description": "BNS 카드/회원 이메일 발송 — 마케팅 수신 동의 회원 한정"},
    {"channel_id": "BANNER", "label_kr": "앱·웹 배너",         "type": "in_app",    "description": "보너스카드앱 메인 배너 + 결제 페이지 인라인 — 노출만 측정"},
]

_STATIC_CATALOGS: Dict[str, List[Dict[str, Any]]] = {
    "payment_method": _PAYMENT_METHODS,
    "fuel_product":   _FUEL_PRODUCTS,
    "channel":        _CHANNELS,
}


# ── Pydantic response models (retail-compatible shape) ─────────────────
class ObjectListItem(BaseModel):
    id: str
    name: str
    rank_score: int = 0
    properties: Dict[str, Any] = Field(default_factory=dict)


class ObjectListResponse(BaseModel):
    type: str
    label: str
    total: int
    items: List[ObjectListItem]


class ObjectDetailResponse(BaseModel):
    type: str
    label: str
    id: str
    name: str
    properties: Dict[str, Any]
    subgraph: Dict[str, Any]
    neighbor_summary: Dict[str, int]


def _spec_or_404(slug: str) -> Dict[str, str]:
    spec = _TYPE_REGISTRY.get(slug)
    if not spec:
        raise HTTPException(status_code=404, detail=f"unknown object type: {slug}")
    return spec


def _coerce_props(node: Any) -> Dict[str, Any]:
    if not isinstance(node, dict):
        return {}
    return dict(node.get("~properties", {}))


def _node_id(node: Any) -> str:
    return node.get("~id", "") if isinstance(node, dict) else str(node)


def _label_of(node: Any) -> str:
    if not isinstance(node, dict):
        return ""
    labels = node.get("~labels") or []
    return labels[0] if labels else ""


# Neptune `~labels[0]` → domain primary key prop. Built once from registry
# so a new type only needs an entry in `_TYPE_REGISTRY`.
_LABEL_TO_ID_PROP: Dict[str, str] = {
    spec["label"]: spec["id_prop"] for spec in _TYPE_REGISTRY.values()
}


def _domain_id(node: Any) -> str:
    """Resolve a node's *domain* primary key (cust_id, opinet_no, …) — the
    value the client will pass back via `getObjectDetail(slug, id)`.

    Frontend tap path:
      Cytoscape node tap → `id` (domain) → `/api/objects/<slug>/<id>` →
      Cypher `MATCH (n:Label {<id_prop>: $oid})` requires the domain key.

    Without this, the subgraph would expose Neptune `~id` (a UUID) and the
    detail lookup would 404 on every neighbor tap.
    """
    if not isinstance(node, dict):
        return str(node)
    props = node.get("~properties", {}) or {}
    label = (node.get("~labels") or [None])[0]
    id_prop = _LABEL_TO_ID_PROP.get(label or "")
    if id_prop:
        v = props.get(id_prop)
        if v not in (None, "", []):
            return str(v)
    return node.get("~id", "")


# ── Name resolution ────────────────────────────────────────────────────
# GCC entities have less name-richness than retail's product catalog —
# Customer/FuelTransaction/AppEvent/TermAgreement carry no "name" field.
# Synthesize a human-readable label from the most informative properties
# so the list shows e.g. "1 · 30대 서울 강남구 · Black" instead of "1".
_NAME_FALLBACKS = ["name_kr", "label", "label_kr", "name", "name_ko"]


def _humanize_age(age: Any) -> str:
    if isinstance(age, (int, float)) and age > 0:
        decade = (int(age) // 10) * 10
        return f"{decade}대"
    return ""


def _resolve_name(label: str, props: Dict[str, Any], primary: str) -> str:
    """Compose a list-row title that's actually informative for a GCC entity.

    Why per-label synthesis: schema has no name for Customer/FuelTransaction/
    AppEvent/TermAgreement/CouponUse/SurveyResponse/CampaignSms/FuelPrice.
    Without synthesis the list collapses to opaque IDs (`1`, `tx_000123`,
    `evt_99`) and the explorer is unusable.
    """
    # Try the per-type name_prop first
    v = props.get(primary)
    if v not in (None, "", []):
        primary_str = str(v)
    else:
        primary_str = ""

    # Per-label composition — surfaces the most useful 2nd-line fields.
    if label == "Customer":
        cid = props.get("cust_id", primary_str)
        age = _humanize_age(props.get("age_val"))
        sido = props.get("sido_nm") or ""
        sgg = props.get("sgg_nm") or ""
        grade = props.get("member_grade") or ""
        bits = [str(cid)]
        loc = " ".join(s for s in (sido, sgg) if s)
        if age and loc:
            bits.append(f"{age} {loc}")
        elif age:
            bits.append(age)
        elif loc:
            bits.append(loc)
        if grade:
            bits.append(grade)
        return " · ".join(bits)

    if label == "FuelTransaction":
        ts = str(props.get("ts") or "")[:16]
        amt = props.get("amount")
        amt_str = f"{int(amt):,}원" if isinstance(amt, (int, float)) else ""
        grade = props.get("fuel_grade") or ""
        bits = [s for s in (ts, grade, amt_str) if s]
        return " · ".join(bits) or primary_str or props.get("tx_id", "")

    if label == "AppEvent":
        ts = str(props.get("ts") or "")[:16]
        action = props.get("event_action") or ""
        platform = props.get("platform") or ""
        bits = [s for s in (action, ts, platform) if s]
        return " · ".join(bits) or props.get("event_id", "")

    if label == "Survey":
        ts = str(props.get("ts") or "")[:10]
        cid = props.get("cust_id") or "anonymous"
        factors = props.get("inconvenience_factors") or []
        n = len(factors) if isinstance(factors, list) else 0
        return f"{ts} · cust={cid} · {n} factors"

    if label == "CouponUse":
        amt = props.get("use_amt")
        amt_str = f"-{int(amt):,}원" if isinstance(amt, (int, float)) else ""
        cn = props.get("coupon_no") or ""
        dt = str(props.get("deal_dt") or "")[:10]
        bits = [s for s in (cn, dt, amt_str) if s]
        return " · ".join(bits) or props.get("use_id", "")

    if label == "TermAgreement":
        term = props.get("term_cd") or ""
        dt = str(props.get("approval_dt") or "")[:10]
        approved = props.get("approved_yn") or ""
        return " · ".join(s for s in (term, dt, approved) if s) or props.get("agreement_id", "")

    if label == "CampaignSMS":
        camp = props.get("campaign_cd") or ""
        cust = props.get("cust_id") or ""
        sent = str(props.get("sent_dt") or "")[:10]
        opened = "open" if props.get("open_yn") == "Y" else ""
        clicked = "click" if props.get("clicked_yn") == "Y" else ""
        bits = [s for s in (camp, cust, sent, opened, clicked) if s]
        return " · ".join(bits) or props.get("sms_id", "")

    if label == "CampaignAggregation":
        camp = props.get("campaign_cd") or ""
        roi = props.get("roi_pct")
        roi_str = f"ROI {roi:.1f}%" if isinstance(roi, (int, float)) else ""
        delivered = props.get("delivered_count")
        d_str = f"발송 {int(delivered):,}건" if isinstance(delivered, (int, float)) else ""
        return " · ".join(s for s in (camp, d_str, roi_str) if s) or props.get("agg_id", "")

    if label == "FuelPrice":
        op = props.get("station_opinet_no") or ""
        gr = props.get("fuel_grade") or ""
        dt = str(props.get("dt") or "")
        amt = props.get("amount")
        amt_str = f"{int(amt):,}원/L" if isinstance(amt, (int, float)) else ""
        return " · ".join(s for s in (op, gr, dt, amt_str) if s) or props.get("price_id", "")

    if label == "WeatherObservation":
        sido = props.get("sido_nm") or ""
        dt = str(props.get("dt") or "")
        hour = props.get("hour")
        hour_str = f"{int(hour):02d}시" if isinstance(hour, (int, float)) else ""
        temp = props.get("temp_c")
        temp_str = f"{temp:.1f}℃" if isinstance(temp, (int, float)) else ""
        return " · ".join(s for s in (sido, dt, hour_str, temp_str) if s) or props.get("weather_id", "")

    if label == "ConsumptionIndex":
        cid = props.get("cust_id") or ""
        bonus = props.get("bonus_card_months")
        bonus_str = f"보너스 {int(bonus)}개월" if isinstance(bonus, (int, float)) else ""
        pref = props.get("gas_station_pref_idx")
        pref_str = f"주유선호 {pref:.2f}" if isinstance(pref, (int, float)) else ""
        return " · ".join(s for s in (cid, bonus_str, pref_str) if s) or props.get("idx_id", "")

    if label == "GasStation":
        nm = props.get("name") or ""
        sido = props.get("sido_nm") or ""
        sgg = props.get("sgg_nm") or ""
        brand = props.get("brand_cd") or ""
        loc = " ".join(s for s in (sido, sgg) if s)
        return " · ".join(s for s in (nm, loc, brand) if s) or props.get("opinet_no", "")

    if label == "Region":
        sido = props.get("sido_nm") or ""
        sgg = props.get("sgg_nm") or ""
        level = props.get("level") or ""
        return " · ".join(s for s in (sido, sgg, level) if s) or props.get("region_cd", "")

    if label == "Member":
        cid = props.get("cust_id") or ""
        grade = props.get("grade") or ""
        pts = props.get("points")
        pts_str = f"{int(pts):,}P" if isinstance(pts, (int, float)) else ""
        return " · ".join(s for s in (cid, grade, pts_str) if s) or props.get("member_id", "")

    if label == "TimeSlot":
        lbl = props.get("label_kr") or props.get("slot_id") or ""
        hs = props.get("hour_start")
        he = props.get("hour_end")
        if isinstance(hs, (int, float)) and isinstance(he, (int, float)):
            return f"{lbl} ({int(hs):02d}–{int(he):02d}시)"
        return str(lbl)

    # Generic fallback — try fallback chain
    for key in [primary] + [k for k in _NAME_FALLBACKS if k != primary]:
        v = props.get(key)
        if v not in (None, "", []):
            return str(v)

    # Last resort — surface any *_id/*_cd field
    for k in props:
        if k.endswith(("_id", "_cd", "_no")) and props.get(k):
            return str(props[k])
    return primary_str or "(unnamed)"


# ── Public endpoints ───────────────────────────────────────────────────
@router.get("/types")
def list_types() -> Dict[str, Any]:
    """Return all 25 known type slugs (canonical snake_case)."""
    return {
        "types": sorted(_TYPE_REGISTRY.keys()),
        "count": len(_TYPE_REGISTRY),
    }


@router.get("/{slug}", response_model=ObjectListResponse)
def list_objects(slug: str, limit: int = Query(30, ge=1, le=200)) -> ObjectListResponse:
    spec = _spec_or_404(slug)

    # Static catalog short-circuit (3 unloaded classes)
    if slug in _STATIC_CATALOGS:
        catalog = _STATIC_CATALOGS[slug]
        items = [
            ObjectListItem(
                id=str(row[spec["id_prop"]]),
                name=_resolve_name(spec["label"], row, spec["name_prop"]),
                rank_score=int(row.get("octane_ron") or 0),
                properties=row,
            )
            for row in catalog[:limit]
        ]
        return ObjectListResponse(
            type=slug, label=spec["label"], total=len(catalog), items=items,
        )

    cypher = (
        f"MATCH (n:{spec['label']}) "
        f"{spec['order_by']} "
        f"LIMIT {int(limit)}"
    )
    try:
        rows = open_cypher(cypher).get("results", [])
    except Exception:
        rows = []

    items: List[ObjectListItem] = []
    for r in rows:
        node = r.get("n") or {}
        props = _coerce_props(node)
        items.append(ObjectListItem(
            id=str(props.get(spec["id_prop"]) or _node_id(node)),
            name=_resolve_name(spec["label"], props, spec["name_prop"]),
            rank_score=int(r.get("rank_score") or 0),
            properties=props,
        ))

    # Total count — separate query so the limited list doesn't lie about scale.
    total = 0
    try:
        cnt = open_cypher(
            f"MATCH (n:{spec['label']}) RETURN count(n) AS c"
        ).get("results", [])
        if cnt:
            total = int(cnt[0].get("c") or 0)
    except Exception:
        total = len(items)

    return ObjectListResponse(
        type=slug, label=spec["label"], total=total, items=items,
    )


@router.get("/{slug}/search")
def search_objects(slug: str, q: str = Query(...), size: int = 20) -> Dict[str, Any]:
    """Plan 5 — simple property-text contains search."""
    spec = _spec_or_404(slug)
    if slug in _STATIC_CATALOGS:
        ql = q.lower()
        catalog = _STATIC_CATALOGS[slug]
        hits = [
            row for row in catalog
            if any(ql in str(v).lower() for v in row.values())
        ][:size]
        items = [
            ObjectListItem(
                id=str(row[spec["id_prop"]]),
                name=_resolve_name(spec["label"], row, spec["name_prop"]),
                properties=row,
            )
            for row in hits
        ]
        return {"type": slug, "label": spec["label"], "q": q, "items": [i.model_dump() for i in items]}

    cypher = (
        f"MATCH (n:{spec['label']}) "
        "WHERE any(k IN keys(n) WHERE toString(n[k]) CONTAINS $q) "
        "RETURN n LIMIT $size"
    )
    try:
        rows = open_cypher(cypher, parameters={"q": q, "size": int(size)}).get("results", [])
    except Exception:
        rows = []
    items = []
    for r in rows:
        node = r.get("n") or {}
        props = _coerce_props(node)
        items.append({
            "id": str(props.get(spec["id_prop"]) or _node_id(node)),
            "name": _resolve_name(spec["label"], props, spec["name_prop"]),
            "properties": props,
        })
    return {"type": slug, "label": spec["label"], "q": q, "items": items}


@router.get("/{slug}/{obj_id}", response_model=ObjectDetailResponse)
def object_detail(slug: str, obj_id: str) -> ObjectDetailResponse:
    spec = _spec_or_404(slug)

    # Static catalog short-circuit — return single-row "subgraph" so the
    # page still renders even though no Neptune relationships exist.
    if slug in _STATIC_CATALOGS:
        catalog = _STATIC_CATALOGS[slug]
        row = next((r for r in catalog if str(r.get(spec["id_prop"])) == obj_id), None)
        if not row:
            raise HTTPException(status_code=404, detail=f"{slug}/{obj_id} not in static catalog")
        anchor = {
            "data": {
                "id": str(row[spec["id_prop"]]),
                "label": spec["label"],
                **row,
            }
        }
        return ObjectDetailResponse(
            type=slug, label=spec["label"],
            id=str(row[spec["id_prop"]]),
            name=_resolve_name(spec["label"], row, spec["name_prop"]),
            properties=row,
            subgraph={"nodes": [anchor], "edges": []},
            neighbor_summary={},
        )

    # Two-pass query — Neptune openCypher silently dropped neighbor rows
    # for some labels when the previous single-pass version used label-bucket
    # `items[..15]` slicing inside a chained WITH. Splitting into:
    #   1) anchor lookup (must succeed or 404)
    #   2) neighbors+edges (separate query, capped at 80 total)
    # makes the failure mode explicit and avoids the silent-drop regression.
    anchor_q = (
        f"MATCH (n:{spec['label']} {{{spec['id_prop']}: $oid}}) "
        "RETURN n LIMIT 1"
    )
    try:
        anchor_rows = open_cypher(anchor_q, parameters={"oid": obj_id}).get("results", [])
    except Exception:
        anchor_rows = []
    if not anchor_rows:
        raise HTTPException(status_code=404, detail=f"object not found: {slug}/{obj_id}")

    neighbors_q = (
        f"MATCH (n:{spec['label']} {{{spec['id_prop']}: $oid}})-[r]-(m) "
        "RETURN m, r LIMIT 80"
    )
    try:
        neighbor_rows = open_cypher(neighbors_q, parameters={"oid": obj_id}).get("results", [])
    except Exception:
        neighbor_rows = []

    rows = [{
        "n": anchor_rows[0].get("n"),
        "neighbors": [r.get("m") for r in neighbor_rows if r.get("m")],
        "edges": [r.get("r") for r in neighbor_rows if r.get("r")],
    }]

    row = rows[0]
    node = row.get("n") or {}
    props = _coerce_props(node)
    neighbors_raw = [n for n in (row.get("neighbors") or []) if isinstance(n, dict)]
    edges_raw = [e for e in (row.get("edges") or []) if isinstance(e, dict)]
    nodes_raw = [node] + neighbors_raw

    # Map Neptune ~id → domain primary key once so edges and nodes refer to
    # the same identity space (the one `getObjectDetail` expects on tap).
    raw_to_domain: Dict[str, str] = {}
    for n in nodes_raw:
        if not isinstance(n, dict):
            continue
        raw = n.get("~id", "")
        if raw:
            raw_to_domain[raw] = _domain_id(n)

    subgraph = {
        "nodes": [
            {"data": {
                "id": raw_to_domain.get(n.get("~id", ""), _domain_id(n)),
                "label": _label_of(n),
                **_coerce_props(n),
            }}
            for n in nodes_raw if isinstance(n, dict)
        ],
        "edges": [
            {"data": {
                "id": e.get("~id") or f"{e.get('~start','')}__{e.get('~end','')}",
                "source": raw_to_domain.get(e.get("~start", ""), e.get("~start", "")),
                "target": raw_to_domain.get(e.get("~end", ""), e.get("~end", "")),
                "type": e.get("~type", ""),
                **(e.get("~properties") or {}),
            }}
            for e in edges_raw
            if isinstance(e, dict) and e.get("~start") and e.get("~end")
        ],
    }

    # Neighbor summary — driver for the inspector header chips.
    neighbor_summary: Dict[str, int] = {}
    anchor_raw = node.get("~id", "")
    for n in neighbors_raw:
        if n.get("~id", "") == anchor_raw:
            continue
        lbl = _label_of(n)
        neighbor_summary[lbl] = neighbor_summary.get(lbl, 0) + 1

    return ObjectDetailResponse(
        type=slug, label=spec["label"],
        id=str(props.get(spec["id_prop"]) or obj_id),
        name=_resolve_name(spec["label"], props, spec["name_prop"]),
        properties=props,
        subgraph=subgraph,
        neighbor_summary=neighbor_summary,
    )


@router.get("/{slug}/{obj_id}/subgraph")
def object_subgraph(slug: str, obj_id: str, hops: int = 1) -> Dict[str, Any]:
    """Plan 5 — explicit 1-hop subgraph endpoint kept for backward compat
    with the legacy basic-table page that still hits /objects/{type}/{id}/subgraph."""
    detail = object_detail(slug, obj_id)
    return {"subgraph": detail.subgraph, "hops": hops}
