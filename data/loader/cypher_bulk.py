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
    ('nodes/coupon/',                  'Coupon',              'coupon_id'),
    ('nodes/coupon_use/',              'CouponUse',           'use_id'),
    ('nodes/offer/',                   'Offer',               'offer_id'),
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
]


def _post_cypher(query: str, params: dict, retries: int = 3) -> dict:
    """SigV4-signed POST via botocore (handles port 8182 correctly)."""
    from botocore.auth import SigV4Auth
    from botocore.awsrequest import AWSRequest
    from botocore.credentials import Credentials

    url = f'https://{NEPTUNE_ENDPOINT}:8182/openCypher'
    body = json.dumps({'query': query, 'parameters': json.dumps(params)}).encode('utf-8')
    headers_in = {'Content-Type': 'application/json'}

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
            r = requests.post(url, data=body, headers=dict(prep.headers), timeout=120, verify=True)
            if r.status_code >= 300:
                raise RuntimeError(f'openCypher [{r.status_code}]: {r.text[:500]}')
            return r.json()
        except (requests.exceptions.RequestException, RuntimeError) as e:
            last = e
            if attempt < retries - 1:
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
    main()
