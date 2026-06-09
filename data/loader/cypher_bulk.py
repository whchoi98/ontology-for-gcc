"""Read NDJSON from S3 and bulk-load to Neptune via batched openCypher UNWIND MERGE.

This is a fallback for when Neptune Bulk Loader's CSV format isn't a fit. It uses
SigV4-signed openCypher batch queries to MERGE nodes idempotently. Slower than
Bulk Loader but works on Pydantic-emitted NDJSON without re-shaping.

Env:
  NEPTUNE_ENDPOINT  ontology-gcc-dev-neptune.cluster-...neptune.amazonaws.com
  AWS_REGION        ap-northeast-2
  SYNTHETIC_DATA_BUCKET  ontology-gcc-dev-synthetic-data-061525506239
"""
from __future__ import annotations
import json, os, sys, time
from dataclasses import dataclass, field
from typing import Optional, Callable
import boto3, requests

NEPTUNE_ENDPOINT = os.environ.get('NEPTUNE_ENDPOINT', '')
S3_BUCKET = os.environ.get('SYNTHETIC_DATA_BUCKET', 'ontology-gcc-dev-synthetic-data-061525506239')
REGION = os.environ.get('AWS_REGION', 'ap-northeast-2')

# Map S3 prefix → (Label, primary-key field)
# pk_field MUST match the actual field in NDJSON / Pydantic schema. Mismatch → 0 rows merged.
NODE_MAP = [
    ('nodes/customer/',                'Customer',            'cust_id'),
    ('nodes/transaction/',             'FuelTransaction',     'tx_id'),
    ('nodes/campaign/',                'Campaign',            'campaign_cd'),
    ('nodes/coupon/',                  'Coupon',              'coupon_no'),   # natural key; edges match on coupon_no (ADR-0022)
    ('nodes/coupon_use/',              'CouponUse',           'use_id'),
    ('nodes/offer/',                   'Offer',               'offer_cd'),    # natural key; edges match on offer_cd (ADR-0022)
    ('nodes/term/',                    'Term',                'term_cd'),    # schema field is term_cd, not term_id
    ('nodes/term_agreement/',          'TermAgreement',       'agreement_id'),
    ('nodes/fuel_price/',              'FuelPrice',           'price_id'),   # synthesized composite pk (see _ensure_pk)
    ('nodes/gas_station/',             'GasStation',          'opinet_no'),
    ('nodes/region/',                  'Region',              'region_cd'),
    ('nodes/consumption_index/',       'ConsumptionIndex',    'idx_id'),
    ('nodes/app_event/',               'AppEvent',            'event_id'),
    ('nodes/survey/',                  'Survey',              'response_id'),  # SurveyResponse pk is response_id
    ('nodes/persona/',                 'Persona',             'persona_id'),
    ('nodes/cluster/',                 'Cluster',             'cluster_id'),
    ('nodes/segment/',                 'Segment',             'segment_id'),
    ('nodes/member/',                  'Member',              'member_id'),
    ('nodes/timeslot/',                'TimeSlot',            'slot_id'),    # schema field is slot_id, not timeslot_id
    ('nodes/campaign_sms/',            'CampaignSMS',         'sms_id'),
    ('nodes/campaign_aggregation/',    'CampaignAggregation', 'agg_id'),
    ('nodes/weather/',                 'WeatherObservation',  'weather_id'), # synthesized composite pk (sido-dt-hour)
]


# Module-scoped HTTPS session for connection reuse across batches.
# Neptune (t4g.medium especially) drops connections under burst load — reusing
# a TCP/TLS connection avoids ~100ms handshake per batch and reduces ECONNREFUSED.
_SESSION: Optional[requests.Session] = None


def _get_session() -> requests.Session:
    global _SESSION
    if _SESSION is None:
        s = requests.Session()
        adapter = requests.adapters.HTTPAdapter(pool_connections=4, pool_maxsize=8)
        s.mount('https://', adapter)
        _SESSION = s
    return _SESSION


def _post_cypher(query: str, params: dict, retries: int = 5) -> dict:
    """SigV4-signed POST via botocore (handles port 8182 correctly).

    Uses a module-scoped requests.Session for connection keep-alive (avoids
    reconnect cost for every batch) and exponential backoff up to 5 attempts
    to ride out Neptune transient connection-refused errors.
    """
    from botocore.auth import SigV4Auth
    from botocore.awsrequest import AWSRequest
    from botocore.credentials import Credentials

    url = f'https://{NEPTUNE_ENDPOINT}:8182/openCypher'
    body = json.dumps({'query': query, 'parameters': json.dumps(params)}).encode('utf-8')
    headers_in = {'Content-Type': 'application/json'}
    sess = _get_session()

    last = None
    for attempt in range(retries):
        try:
            frozen = boto3.Session().get_credentials().get_frozen_credentials()
            aws_req = AWSRequest(method='POST', url=url, data=body, headers=headers_in)
            SigV4Auth(
                Credentials(frozen.access_key, frozen.secret_key, frozen.token),
                'neptune-db', REGION,
            ).add_auth(aws_req)
            prep = aws_req.prepare()
            r = sess.post(url, data=body, headers=dict(prep.headers), timeout=120, verify=True)
            if r.status_code >= 300:
                raise RuntimeError(f'openCypher [{r.status_code}]: {r.text[:500]}')
            return r.json()
        except (requests.exceptions.RequestException, RuntimeError) as e:
            last = e
            if attempt < retries - 1:
                # 1, 2, 4, 8, 16 second backoff
                time.sleep(2 ** attempt)
                continue
            raise
    raise last


def _scan_pk_values(obj: dict, fallback_id_keys: tuple = ('id',)) -> str | None:
    """Find the unique id from the object using common pk names."""
    for k in (*fallback_id_keys, 'cust_id', 'tx_id', 'campaign_cd', 'coupon_id',
              'use_id', 'offer_id', 'term_cd', 'term_id', 'agreement_id', 'price_id', 'opinet_no',
              'region_cd', 'idx_id', 'event_id', 'response_id', 'survey_id', 'persona_id', 'cluster_id',
              'segment_id', 'member_id', 'slot_id', 'timeslot_id', 'sms_id', 'agg_id'):
        v = obj.get(k)
        if v is not None and v != '':
            return str(v)
    return None


def _synthesize_fuel_price_pk(obj: dict) -> str | None:
    """FuelPrice has no natural id field — composite key (opinet, dt, grade)."""
    opinet = obj.get('station_opinet_no')
    dt = obj.get('dt')
    grade = obj.get('fuel_grade')
    if opinet and dt and grade:
        return f'{opinet}-{dt}-{grade}'
    return None


def _synthesize_weather_pk(obj: dict) -> str | None:
    """WeatherObservation has no natural id field — composite key (sido, dt, hour)."""
    sido = obj.get('sido_nm')
    dt = obj.get('dt')
    hour = obj.get('hour')
    if sido and dt and hour is not None:
        return f'{sido}-{dt}-{hour}'
    return None


def _flatten_props(obj: dict) -> dict:
    """Drop null + list values (Neptune doesn't accept them as scalar props)."""
    out = {}
    for k, v in obj.items():
        if v is None:
            continue
        if isinstance(v, (list, dict)):
            continue
        out[k] = v
    return out


def load_label(s3, prefix: str, label: str, pk_field: str, batch_size: int = 500, limit: int | None = None) -> int:
    """Stream NDJSON files under <prefix>, MERGE in batches of batch_size."""
    total = 0
    paginator = s3.get_paginator('list_objects_v2')
    keys = []
    for page in paginator.paginate(Bucket=S3_BUCKET, Prefix=prefix):
        for o in page.get('Contents', []) or []:
            if o['Key'].endswith('.ndjson'):
                keys.append(o['Key'])
    if not keys:
        print(f'  [{label}] no NDJSON under s3://{S3_BUCKET}/{prefix}')
        return 0

    batch: list[dict] = []
    for key in keys:
        body = s3.get_object(Bucket=S3_BUCKET, Key=key)['Body'].read().decode('utf-8')
        for line in body.splitlines():
            if not line.strip():
                continue
            obj = json.loads(line)
            # FuelPrice has no natural id — synthesize from composite (opinet, dt, grade)
            if label == 'FuelPrice' and not obj.get(pk_field):
                synth = _synthesize_fuel_price_pk(obj)
                if synth is not None:
                    obj[pk_field] = synth
            # WeatherObservation has no natural id — synthesize from composite (sido, dt, hour)
            if label == 'WeatherObservation' and not obj.get(pk_field):
                synth = _synthesize_weather_pk(obj)
                if synth is not None:
                    obj[pk_field] = synth
            pk_val = obj.get(pk_field) or _scan_pk_values(obj)
            if pk_val is None:
                continue
            props = _flatten_props(obj)
            props[pk_field] = pk_val   # ensure pk_field is present (Cypher MERGE pattern depends on it)
            props['__pk'] = pk_val   # alias used by MERGE
            batch.append(props)

            if len(batch) >= batch_size:
                _flush_batch(label, pk_field, batch)
                total += len(batch)
                if total % 5000 == 0:
                    print(f'  [{label}] merged {total}')
                if limit and total >= limit:
                    return total
                batch = []
    if batch:
        _flush_batch(label, pk_field, batch)
        total += len(batch)
    print(f'  [{label}] merged total={total}')
    return total


def _flush_batch(label: str, pk_field: str, batch: list[dict]) -> None:
    """UNWIND-batched MERGE — much faster than per-row queries."""
    # cypher: UNWIND $rows AS r MERGE (n:Label {pk: r.__pk}) SET n += r
    query = f"UNWIND $rows AS r MERGE (n:{label} {{{pk_field}: r.{pk_field}}}) SET n += r"
    _post_cypher(query, {'rows': batch})


# ─────────────────────────────────────────────────────────────────────────────
# EDGE LOADER — load 31 relationship types per spec §4.2 from NDJSON FK joins.
# ─────────────────────────────────────────────────────────────────────────────

def _hour_to_slot_id(hour: int, weekend: bool = False) -> Optional[str]:
    """Map an hour-of-day to a TimeSlot.slot_id (data/synthetic/timeslot.py)."""
    if weekend:
        return 'weekend'
    if 6 <= hour < 9:
        return 'commute_morning'
    if 11 <= hour < 14:
        return 'lunch'
    if 17 <= hour < 20:
        return 'commute_evening'
    if hour >= 21 or hour < 6:
        return 'late_night'
    return None  # idle hours don't map; skip


def _ts_to_slot_id(ts: str) -> Optional[str]:
    """Parse ISO timestamp '2026-04-01T07:00:00+09:00' → slot_id by hour-of-day.

    Falls back to None on bad input rather than raising — caller skips.
    """
    if not ts or not isinstance(ts, str):
        return None
    # Tolerant parse: just look for 'T' + 2 hour digits
    try:
        i = ts.index('T')
        hour = int(ts[i+1:i+3])
        # Saturday/Sunday detection from datetime would be more correct;
        # we keep it simple and treat all hours uniformly. weekend bucket is
        # left for cases where caller knows day-of-week.
        return _hour_to_slot_id(hour)
    except (ValueError, IndexError):
        return None


@dataclass
class EdgeSpec:
    """Definition of one edge load.

    source_label / target_label  Neptune labels (must match NODE_MAP).
    source_match_field           property on source node to MATCH (Cypher key).
    target_match_field           property on target node to MATCH.
    ndjson_prefix                S3 prefix containing the NDJSON rows that drive the join.
    ndjson_source_field          field in NDJSON row that holds the source-side identifier.
    ndjson_target_field          field in NDJSON row that holds the target-side identifier.
    edge_type                    relationship type (uppercase).
    transform                    optional callable(obj)->dict({'s':..., 't':...})
                                 for non-trivial joins (e.g. derive slot_id from ts).
    """
    edge_type: str
    source_label: str
    source_match_field: str
    target_label: str
    target_match_field: str
    ndjson_prefix: Optional[str]
    ndjson_source_field: Optional[str] = None
    ndjson_target_field: Optional[str] = None
    transform: Optional[Callable] = None
    note: str = ''


# 31 relationship types per data/schemas.py:ALL_RELATIONS.
# Each entry maps to one EdgeSpec OR is skipped (note='SKIP: …').
# Skipped edges either need data not present (no FK in source NDJSON) or
# require nodes that aren't loaded (e.g. PaymentMethod, FuelProduct, Channel).
# Persona/Cluster/Segment association edges are deferred to Plan 5 (require ML
# clustering output to assign Customer.persona_id / cluster_id / segment_id).
EDGE_MAP: list[EdgeSpec] = [
    # Customer → marketing taxonomy (deferred to Plan 5; no FK on Customer)
    EdgeSpec(edge_type='HAS_PERSONA', source_label='Customer', source_match_field='cust_id',
             target_label='Persona', target_match_field='persona_id', ndjson_prefix=None,
             note='SKIP: Customer has no persona_id field; Plan 5 ML clustering required'),
    EdgeSpec(edge_type='BELONGS_TO', source_label='Customer', source_match_field='cust_id',
             target_label='Cluster', target_match_field='cluster_id', ndjson_prefix=None,
             note='SKIP: Customer has no cluster_id field; Plan 5 ML clustering required'),
    EdgeSpec(edge_type='IN_SEGMENT', source_label='Customer', source_match_field='cust_id',
             target_label='Segment', target_match_field='segment_id', ndjson_prefix=None,
             note='SKIP: Customer has no segment_id field; Plan 5 ML clustering required'),

    # Customer ↔ membership/agreement/index/event/survey/transaction
    # Match keys are the *Neptune merge keys* (the pk_field from NODE_MAP) when
    # possible, because Neptune indexes those. Customer→cust_id, Member→member_id
    # (= cust_id value via scan fallback), ConsumptionIndex→idx_id (= cust_id), etc.
    EdgeSpec(edge_type='IS_MEMBER', source_label='Customer', source_match_field='cust_id',
             target_label='Member', target_match_field='member_id',
             ndjson_prefix='nodes/member/', ndjson_source_field='cust_id', ndjson_target_field='cust_id',
             note='Member.member_id == cust_id (scan fallback); Customer.cust_id is the pk'),
    EdgeSpec(edge_type='AGREED_TO', source_label='Customer', source_match_field='cust_id',
             target_label='TermAgreement', target_match_field='agreement_id',
             ndjson_prefix='nodes/term_agreement/', ndjson_source_field='cust_id', ndjson_target_field='agreement_id',
             note='TermAgreement.cust_id; both ends are indexed pk fields'),
    EdgeSpec(edge_type='FOR', source_label='TermAgreement', source_match_field='agreement_id',
             target_label='Term', target_match_field='term_cd',
             ndjson_prefix='nodes/term_agreement/', ndjson_source_field='agreement_id', ndjson_target_field='term_cd',
             note='TermAgreement.term_cd; both ends are indexed pk fields'),
    EdgeSpec(edge_type='HAS_INDEX', source_label='Customer', source_match_field='cust_id',
             target_label='ConsumptionIndex', target_match_field='idx_id',
             ndjson_prefix='nodes/consumption_index/', ndjson_source_field='cust_id', ndjson_target_field='cust_id',
             note='ConsumptionIndex.idx_id == cust_id (scan fallback)'),
    EdgeSpec(edge_type='USED_APP', source_label='Customer', source_match_field='cust_id',
             target_label='AppEvent', target_match_field='event_id',
             ndjson_prefix='nodes/app_event/', ndjson_source_field='cust_id', ndjson_target_field='event_id',
             note='AppEvent.cust_id (drop nulls); both ends indexed pk fields'),
    EdgeSpec(edge_type='ANSWERED', source_label='Customer', source_match_field='cust_id',
             target_label='Survey', target_match_field='response_id',
             ndjson_prefix='nodes/survey/', ndjson_source_field='cust_id', ndjson_target_field='response_id',
             note='SurveyResponse.cust_id (drop ~25,946 anonymous rows)'),
    EdgeSpec(edge_type='REFUELED', source_label='Customer', source_match_field='cust_id',
             target_label='FuelTransaction', target_match_field='tx_id',
             ndjson_prefix='nodes/transaction/', ndjson_source_field='cust_id', ndjson_target_field='tx_id',
             note='FuelTransaction.cust_id — high-volume edge (~500K); both ends indexed'),

    # FuelTransaction outgoing edges
    # AT: tx.store_cd MATCHES gas_station.site_cd (real txs only — synthetic S0xxx
    # store_cds don't have a corresponding real GasStation site_cd). About ~1166/1626
    # real store_cds resolve.
    EdgeSpec(edge_type='AT', source_label='FuelTransaction', source_match_field='tx_id',
             target_label='GasStation', target_match_field='site_cd',
             ndjson_prefix='nodes/transaction/', ndjson_source_field='tx_id', ndjson_target_field='store_cd',
             note='tx.store_cd → GasStation.site_cd (real txs only)'),
    # IN: gas_station.sido_nm → Region.sido_nm where Region.level=sido
    EdgeSpec(edge_type='IN', source_label='GasStation', source_match_field='opinet_no',
             target_label='Region', target_match_field='sido_nm',
             ndjson_prefix='nodes/gas_station/', ndjson_source_field='opinet_no', ndjson_target_field='sido_nm',
             note='GasStation.sido_nm → Region.sido_nm (level=sido)'),

    # FuelTransaction → FuelProduct, PaymentMethod (skipped — nodes not loaded)
    EdgeSpec(edge_type='OF', source_label='FuelTransaction', source_match_field='tx_id',
             target_label='FuelProduct', target_match_field='product_id', ndjson_prefix=None,
             note='SKIP: FuelProduct nodes not loaded (no NDJSON in pipeline)'),
    EdgeSpec(edge_type='VIA', source_label='FuelTransaction', source_match_field='tx_id',
             target_label='PaymentMethod', target_match_field='method_id', ndjson_prefix=None,
             note='SKIP: PaymentMethod nodes not loaded (no NDJSON in pipeline)'),

    # FuelTransaction → TimeSlot (derive slot_id from tx.ts hour-of-day)
    EdgeSpec(edge_type='AT_TIME', source_label='FuelTransaction', source_match_field='tx_id',
             target_label='TimeSlot', target_match_field='slot_id',
             ndjson_prefix='nodes/transaction/',
             transform=lambda obj: (
                 {'s': obj['tx_id'], 't': _ts_to_slot_id(obj.get('ts'))}
                 if obj.get('tx_id') and _ts_to_slot_id(obj.get('ts')) else None
             ),
             note='derive slot_id from tx.ts hour'),

    # FuelTransaction → CouponUse (CouponUse.tx_id; skip nulls)
    EdgeSpec(edge_type='USED', source_label='FuelTransaction', source_match_field='tx_id',
             target_label='CouponUse', target_match_field='use_id',
             ndjson_prefix='nodes/coupon_use/', ndjson_source_field='tx_id', ndjson_target_field='use_id',
             note='CouponUse.tx_id (drop nulls)'),
    # CouponUse → Coupon. Coupon node was MERGEd by coupon_id (scan→campaign_cd),
    # but Coupon nodes still have coupon_no as a regular property. So we MATCH
    # on Coupon.coupon_no = CouponUse.coupon_no.
    EdgeSpec(edge_type='OF_COUPON', source_label='CouponUse', source_match_field='use_id',
             target_label='Coupon', target_match_field='coupon_no',
             ndjson_prefix='nodes/coupon_use/', ndjson_source_field='use_id', ndjson_target_field='coupon_no',
             note='CouponUse.coupon_no → Coupon.coupon_no (NB: edge_type=OF in schema; '
                  'both FuelTransaction-OF-FuelProduct and CouponUse-OF-Coupon share the type. '
                  'We use OF_COUPON internally then map back to OF in Cypher.'),

    # Campaign edges
    EdgeSpec(edge_type='HAS_OFFER', source_label='Campaign', source_match_field='campaign_cd',
             target_label='Offer', target_match_field='offer_cd',
             ndjson_prefix='nodes/offer/', ndjson_source_field='campaign_cd', ndjson_target_field='offer_cd',
             note='Offer.campaign_cd → Campaign; Offer.offer_cd is property (pk merged on offer_id=campaign_cd)'),
    EdgeSpec(edge_type='ISSUES', source_label='Offer', source_match_field='offer_cd',
             target_label='Coupon', target_match_field='coupon_no',
             ndjson_prefix='nodes/coupon/', ndjson_source_field='offer_cd', ndjson_target_field='coupon_no',
             note='Coupon.offer_cd → Offer.offer_cd; Coupon.coupon_no is property'),
    EdgeSpec(edge_type='TARGETS_PERSONA', source_label='Campaign', source_match_field='campaign_cd',
             target_label='Persona', target_match_field='persona_id',
             ndjson_prefix='nodes/campaign/', ndjson_source_field='campaign_cd', ndjson_target_field='target_persona_id',
             note='Campaign.target_persona_id (most are null → skipped)'),
    EdgeSpec(edge_type='TARGETS_CLUSTER', source_label='Campaign', source_match_field='campaign_cd',
             target_label='Cluster', target_match_field='cluster_id', ndjson_prefix=None,
             note='SKIP: no FK on Campaign for target_cluster_id'),
    EdgeSpec(edge_type='TARGETS_SEGMENT', source_label='Campaign', source_match_field='campaign_cd',
             target_label='Segment', target_match_field='segment_id', ndjson_prefix=None,
             note='SKIP: no FK on Campaign for target_segment_id'),
    EdgeSpec(edge_type='SENT_VIA', source_label='Campaign', source_match_field='campaign_cd',
             target_label='Channel', target_match_field='channel_id', ndjson_prefix=None,
             note='SKIP: Channel nodes not loaded (no NDJSON in pipeline)'),

    # Coupon → CouponUse (reverse direction of OF_COUPON above)
    EdgeSpec(edge_type='REDEEMED_AS', source_label='Coupon', source_match_field='coupon_no',
             target_label='CouponUse', target_match_field='use_id',
             ndjson_prefix='nodes/coupon_use/', ndjson_source_field='coupon_no', ndjson_target_field='use_id',
             note='reverse of CouponUse-OF-Coupon'),

    # GasStation → FuelPrice / FuelProduct
    EdgeSpec(edge_type='PRICED_AT', source_label='GasStation', source_match_field='opinet_no',
             target_label='FuelPrice', target_match_field='price_id',
             ndjson_prefix='nodes/fuel_price/',
             transform=lambda obj: (
                 {'s': obj['station_opinet_no'], 't': _synthesize_fuel_price_pk(obj)}
                 if obj.get('station_opinet_no') and _synthesize_fuel_price_pk(obj) else None
             ),
             note='GasStation.opinet_no -> FuelPrice.price_id (synthesized opinet-dt-grade, ADR-0022). '
                  'target_match_field MUST equal the FuelPrice MERGE pk or edges orphan.'),
    EdgeSpec(edge_type='SELLS', source_label='GasStation', source_match_field='opinet_no',
             target_label='FuelProduct', target_match_field='product_id', ndjson_prefix=None,
             note='SKIP: FuelProduct nodes not loaded'),

    # D17 — campaign SMS / aggregation
    EdgeSpec(edge_type='SENT_SMS', source_label='Campaign', source_match_field='campaign_cd',
             target_label='CampaignSMS', target_match_field='sms_id',
             ndjson_prefix='nodes/campaign_sms/', ndjson_source_field='campaign_cd', ndjson_target_field='sms_id',
             note='CampaignSms.campaign_cd; node label is CampaignSMS (NODE_MAP)'),
    EdgeSpec(edge_type='TO', source_label='CampaignSMS', source_match_field='sms_id',
             target_label='Customer', target_match_field='cust_id',
             ndjson_prefix='nodes/campaign_sms/', ndjson_source_field='sms_id', ndjson_target_field='cust_id',
             note='CampaignSms.cust_id'),
    EdgeSpec(edge_type='AGGREGATED_AS', source_label='Campaign', source_match_field='campaign_cd',
             target_label='CampaignAggregation', target_match_field='agg_id',
             ndjson_prefix='nodes/campaign_aggregation/', ndjson_source_field='campaign_cd',
             ndjson_target_field='campaign_cd',
             note='CampaignAggregation.agg_id == campaign_cd (scan fallback); both ends indexed'),

    # D13 — weather
    EdgeSpec(edge_type='OBSERVED_WEATHER', source_label='Region', source_match_field='sido_nm',
             target_label='WeatherObservation', target_match_field='weather_id',
             ndjson_prefix='nodes/weather/',
             transform=lambda obj: (
                 {'s': obj['sido_nm'], 't': f"{obj['sido_nm']}-{obj['dt']}-{obj['hour']}"}
                 if obj.get('sido_nm') and obj.get('dt') and obj.get('hour') is not None else None
             ),
             note='WeatherObservation.sido_nm → Region.sido_nm (level=sido); weather_id synthesized'),
    EdgeSpec(edge_type='AT_TIME_WEATHER', source_label='WeatherObservation', source_match_field='weather_id',
             target_label='TimeSlot', target_match_field='slot_id',
             ndjson_prefix='nodes/weather/',
             transform=lambda obj: (
                 {'s': f"{obj['sido_nm']}-{obj['dt']}-{obj['hour']}", 't': _hour_to_slot_id(obj['hour'])}
                 if obj.get('sido_nm') and obj.get('dt') and obj.get('hour') is not None
                    and _hour_to_slot_id(obj['hour']) else None
             ),
             note='WeatherObservation.hour → TimeSlot.slot_id (NB: edge_type=AT_TIME shared with FuelTx; '
                  'we use AT_TIME_WEATHER internally then map back to AT_TIME)'),
]


def _edge_cypher_type(edge_type: str) -> str:
    """Map internal edge_type to actual Cypher relationship type.

    The schema reuses edge_type='OF' for both FuelTx→FuelProduct and CouponUse→Coupon,
    and 'AT_TIME' for both FuelTx→TimeSlot and WeatherObservation→TimeSlot. We keep
    them disambiguated internally (OF_COUPON / AT_TIME_WEATHER) but emit the spec
    name in Cypher MERGE so traversals match the spec exactly.
    """
    if edge_type == 'OF_COUPON':
        return 'OF'
    if edge_type == 'AT_TIME_WEATHER':
        return 'AT_TIME'
    return edge_type


def _build_edge_query(spec: EdgeSpec) -> str:
    """Cypher for one UNWIND-batched relationship load: MERGE both endpoints + the rel.

    MERGE-MERGE (NOT MATCH-MATCH) on the endpoints — deliberate, ADR-0022:
    - The orphan-stub bug is fixed at the *key* level, not here: NODE_MAP pk is
      aligned with every edge match-field (Offer.offer_cd, Coupon.coupon_no,
      FuelPrice.price_id), enforced by tests/data/test_cypher_bulk_alignment.py.
      With aligned keys MERGE resolves to the existing full node, so no stub.
    - MATCH-MATCH was tried and reverted: on Neptune t4g.medium it OOMs
      (MemoryLimitExceededException) for edges whose BOTH endpoints are large
      labels (TO: CampaignSMS×Customer; REFUELED: Customer×FuelTransaction;
      PRICED_AT: GasStation×FuelPrice). MERGE on a label+pk is index-resolved and
      memory-bounded even for two large labels (it loaded REFUELED ~556K live).
      persona_writeback's MATCH-MATCH survives only because one side (Persona=5)
      is tiny — not a general pattern.
    - Residual: an FK pointing at a genuinely-unloaded node (e.g. synthetic
      store_cd with no real GasStation) still MERGE-creates a thin stub. That is
      pre-existing and acceptable for an analytics graph; key alignment removes
      the systemic case.

    Drops RETURN to minimize response size.
    """
    rel_type = _edge_cypher_type(spec.edge_type)
    return (
        f"UNWIND $pairs AS p "
        f"MERGE (a:{spec.source_label} {{{spec.source_match_field}: p.s}}) "
        f"MERGE (b:{spec.target_label} {{{spec.target_match_field}: p.t}}) "
        f"MERGE (a)-[:{rel_type}]->(b)"
    )


def _flush_edge_batch(spec: EdgeSpec, pairs: list[dict]) -> int:
    """MERGE-MERGE-MERGE one batch of {'s','t'} pairs (see _build_edge_query)."""
    if not pairs:
        return 0
    _post_cypher(_build_edge_query(spec), {'pairs': pairs})
    return len(pairs)


def load_edge(spec: EdgeSpec, *, batch_size: int = 200, limit: Optional[int] = None,
              progress_every: int = 2000) -> int:
    """Stream NDJSON for the given edge spec, MERGE relationships in batches.

    batch_size=200 keeps each Neptune Cypher request under a few seconds even
    for the high-volume REFUELED edge (~500K total pairs ≈ 2500 batches).
    progress_every controls log cadence — defaults to every 2000 pairs.
    """
    if spec.ndjson_prefix is None:
        print(f'  [{spec.edge_type}] SKIP — {spec.note}', flush=True)
        return 0
    print(f'  [{spec.edge_type}] starting (batch_size={batch_size}) prefix={spec.ndjson_prefix}', flush=True)
    s3 = boto3.client('s3')
    paginator = s3.get_paginator('list_objects_v2')
    keys = []
    for page in paginator.paginate(Bucket=S3_BUCKET, Prefix=spec.ndjson_prefix):
        for o in page.get('Contents', []) or []:
            if o['Key'].endswith('.ndjson'):
                keys.append(o['Key'])
    if not keys:
        print(f'  [{spec.edge_type}] no NDJSON under s3://{S3_BUCKET}/{spec.ndjson_prefix}', flush=True)
        return 0

    t_start = time.time()
    total = 0
    last_logged = 0
    batch: list[dict] = []
    errors = 0
    for key in keys:
        body = s3.get_object(Bucket=S3_BUCKET, Key=key)['Body'].read().decode('utf-8')
        for line in body.splitlines():
            if not line.strip():
                continue
            obj = json.loads(line)
            # Decide source/target value
            if spec.transform is not None:
                pair = spec.transform(obj)
                if pair is None:
                    continue
                s_val = pair.get('s')
                t_val = pair.get('t')
            else:
                s_val = obj.get(spec.ndjson_source_field) if spec.ndjson_source_field else None
                t_val = obj.get(spec.ndjson_target_field) if spec.ndjson_target_field else None
            # Skip if either side missing/null/empty
            if s_val is None or s_val == '' or t_val is None or t_val == '':
                continue
            # Cast to str — Neptune properties are strings for these IDs
            batch.append({'s': str(s_val), 't': str(t_val)})

            if len(batch) >= batch_size:
                try:
                    _flush_edge_batch(spec, batch)
                except Exception as e:
                    errors += 1
                    if errors <= 3:
                        print(f'  [{spec.edge_type}] batch flush error #{errors}: {e}; continuing', flush=True)
                total += len(batch)
                if total - last_logged >= progress_every:
                    elapsed = time.time() - t_start
                    rate = total / elapsed if elapsed > 0 else 0
                    print(f'  [{spec.edge_type}] processed {total} ({rate:.0f}/s, errors={errors})', flush=True)
                    last_logged = total
                if limit and total >= limit:
                    print(f'  [{spec.edge_type}] limit {limit} reached', flush=True)
                    return total
                batch = []
    if batch:
        try:
            _flush_edge_batch(spec, batch)
        except Exception as e:
            errors += 1
            print(f'  [{spec.edge_type}] final batch flush error: {e}', flush=True)
        total += len(batch)
    elapsed = time.time() - t_start
    print(f'  [{spec.edge_type}] processed total={total} pairs in {elapsed:.1f}s (errors={errors})', flush=True)
    return total


def _count_edges_by_type() -> dict:
    """Return {rel_type: count} from Neptune."""
    try:
        res = _post_cypher('MATCH ()-[r]->() RETURN type(r) AS t, count(r) AS n', {})
        rows = res.get('results') or []
        return {row['t']: int(row['n']) for row in rows}
    except Exception as e:
        print(f'  count failed: {e}')
        return {}


def load_all_edges(batch_size: int = 200, edge_filter: Optional[set] = None,
                   limit_per_edge: Optional[int] = None,
                   limits: Optional[dict] = None) -> dict:
    """Iterate EDGE_MAP, load each edge type, return per-edge processed-pair counts.

    edge_filter: if set, only load edges whose edge_type is in the filter.
    limit_per_edge: if set, cap each edge's pair count to this value (helpful
        on small Neptune instances; e.g. REFUELED at 500K can take 2+ hours
        on t4g.medium so capping at 100K gives partial coverage in <30min).
    limits: per-edge override dict {edge_type: limit}. Takes priority over
        limit_per_edge.

    Returns a dict {edge_type: pairs_processed}. Also runs a final
    _count_edges_by_type() and prints actual Neptune relationship counts.
    """
    if not NEPTUNE_ENDPOINT:
        print('ERROR: NEPTUNE_ENDPOINT not set', flush=True); sys.exit(2)
    limits = limits or {}
    counts: dict[str, int] = {}
    t_overall = time.time()
    for spec in EDGE_MAP:
        if edge_filter and spec.edge_type not in edge_filter:
            continue
        eff_limit = limits.get(spec.edge_type, limit_per_edge)
        try:
            n = load_edge(spec, batch_size=batch_size, limit=eff_limit)
        except Exception as e:
            print(f'  [{spec.edge_type}] FATAL: {e}', flush=True)
            n = -1
        counts[spec.edge_type] = n
    print(f'\n=== EDGE LOAD SUMMARY (pairs processed) — total wall {time.time()-t_overall:.1f}s ===', flush=True)
    for et, n in counts.items():
        print(f'  {et}: {n}', flush=True)
    actual = _count_edges_by_type()
    if actual:
        print('\n=== ACTUAL Neptune relationship counts (by Cypher type) ===', flush=True)
        for t, n in sorted(actual.items()):
            print(f'  {t}: {n}', flush=True)
        total = sum(actual.values())
        print(f'  TOTAL EDGES: {total}', flush=True)
    return counts


def main():
    if not NEPTUNE_ENDPOINT:
        print('ERROR: NEPTUNE_ENDPOINT not set'); sys.exit(2)
    s3 = boto3.client('s3')
    grand = 0
    for prefix, label, pk in NODE_MAP:
        n = load_label(s3, prefix, label, pk)
        grand += n
    print(f'== TOTAL NODES MERGED: {grand} ==')


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--edges':
        # Per-edge limits: cap high-volume edges so the t4g.medium Neptune
        # finishes in reasonable time. Small edges run unlimited.
        # Tune via env: EDGE_LIMIT_<TYPE>=N (e.g. EDGE_LIMIT_REFUELED=200000).
        default_limits = {
            'REFUELED':         int(os.environ.get('EDGE_LIMIT_REFUELED',         '150000')),
            'AT':               int(os.environ.get('EDGE_LIMIT_AT',               '150000')),
            'AT_TIME':          int(os.environ.get('EDGE_LIMIT_AT_TIME',          '150000')),
            'USED_APP':         int(os.environ.get('EDGE_LIMIT_USED_APP',          '50000')),
            'PRICED_AT':        int(os.environ.get('EDGE_LIMIT_PRICED_AT',        '100000')),
            'SENT_SMS':         int(os.environ.get('EDGE_LIMIT_SENT_SMS',          '50000')),
            'TO':               int(os.environ.get('EDGE_LIMIT_TO',                '50000')),
        }
        load_all_edges(batch_size=int(os.environ.get('EDGE_BATCH_SIZE', '200')),
                       limits=default_limits)
    else:
        main()
