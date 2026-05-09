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

if __name__ == '__main__':
    import sys
    start = sys.argv[1] if len(sys.argv) > 1 else datetime.date.today().strftime('%Y%m%d')
    days = int(sys.argv[2]) if len(sys.argv) > 2 else 7
    print(f'wrote {run(start, days)} weather observations')
