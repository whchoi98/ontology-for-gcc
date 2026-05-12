"""기상청 ETL: 17 시도 × N일 → S3 cache → WeatherObservation NDJSON."""
from __future__ import annotations
import json, os, datetime
from pathlib import Path
import boto3
from data.external.kma_weather import KmaForecastClient, items_to_observations, SIDO_GRID
from data.schemas import WeatherObservation

S3_BUCKET = os.environ.get('SYNTHETIC_DATA_BUCKET', 'ontology-gcc-dev-synthetic-data-x')

def run(start_date: str, days: int = 30, base_time: str = '0500') -> int:
    s3 = boto3.client('s3')
    client = KmaForecastClient()
    written = 0
    cur = datetime.datetime.strptime(start_date, '%Y%m%d')
    for d in range(days):
        date_s = cur.strftime('%Y%m%d')
        for sido in SIDO_GRID.keys():
            cache_key = f'weather/{date_s}/{sido}.json'
            try:
                s3.head_object(Bucket=S3_BUCKET, Key=cache_key)
                continue   # cache hit
            except Exception:
                pass
            items = client.fetch_short_forecast(sido, date_s, base_time)
            s3.put_object(Bucket=S3_BUCKET, Key=cache_key,
                          Body=json.dumps(items, ensure_ascii=False).encode('utf-8'))
            obs = items_to_observations(sido, items)
            ndjson = '\n'.join(o.model_dump_json() for o in obs)
            s3.put_object(Bucket=S3_BUCKET, Key=f'nodes/weather/{date_s}-{sido}.ndjson',
                          Body=ndjson.encode('utf-8'))
            written += len(obs)
        cur += datetime.timedelta(days=1)
    return written

def reprocess_from_cache() -> int:
    """Re-parse all cached KMA raw JSON in s3://.../weather/ with the
    current `items_to_observations`. Overwrites `nodes/weather/*.ndjson`
    without hitting the KMA API. Use after fixing a parser bug to refresh
    the loader-facing NDJSON files.
    """
    s3 = boto3.client('s3')
    paginator = s3.get_paginator('list_objects_v2')
    rewritten = 0
    for page in paginator.paginate(Bucket=S3_BUCKET, Prefix='weather/'):
        for obj in page.get('Contents', []) or []:
            key = obj['Key']
            # weather/YYYYMMDD/SIDO.json
            parts = key.split('/')
            if len(parts) != 3 or not parts[2].endswith('.json'):
                continue
            date_s = parts[1]
            sido = parts[2].rsplit('.', 1)[0]
            try:
                raw = s3.get_object(Bucket=S3_BUCKET, Key=key)['Body'].read()
                items = json.loads(raw)
            except Exception as e:
                print(f'  ! {key}: read failed — {e}')
                continue
            obs = items_to_observations(sido, items)
            ndjson = '\n'.join(o.model_dump_json() for o in obs)
            out_key = f'nodes/weather/{date_s}-{sido}.ndjson'
            s3.put_object(Bucket=S3_BUCKET, Key=out_key, Body=ndjson.encode('utf-8'))
            rewritten += len(obs)
            print(f'  {key} → {out_key} ({len(obs)} obs)')
    return rewritten


if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == '--reprocess':
        n = reprocess_from_cache()
        print(f'rewrote {n} weather observations from S3 cache')
    else:
        start = sys.argv[1] if len(sys.argv) > 1 else datetime.date.today().strftime('%Y%m%d')
        days = int(sys.argv[2]) if len(sys.argv) > 2 else 7
        print(f'wrote {run(start, days)} weather observations')
