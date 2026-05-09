"""Plan 5 Task 5.6.1 — opinet 공개 API → FuelPrice (source='real') 시계열 보강.

Plan 2의 합성 1년치를 실 데이터로 교체하기 위한 옵셔널 ETL.
실 사용 시 한국석유공사(opinet) API 키가 필요하며, endpoint URL은 공개 문서 기준으로
변경될 수 있으므로 사용 전 확인할 것.

API key는 AWS Secrets Manager `ontology-gcc-dev/opinet-api-key`에 저장.
"""
from __future__ import annotations
import datetime
import os
from typing import Iterator, Optional

OPINET_BASE = 'https://www.opinet.co.kr/api'
SECRET_ID = 'ontology-gcc-dev/opinet-api-key'


def _api_key() -> str:
    """Secrets Manager → opinet API key. Raises if not configured."""
    import boto3  # type: ignore
    sm = boto3.client('secretsmanager')
    return sm.get_secret_value(SecretId=SECRET_ID)['SecretString'].strip()


def fetch_avg_by_sido(date_str: str, key: Optional[str] = None) -> Iterator[dict]:
    """opinet 일별 시도 평균 가격 (단순화된 endpoint 가정).

    Yields plain dicts compatible with FuelPrice schema. Use FuelPrice(**item) downstream.
    """
    import requests  # type: ignore
    from data.schemas import FuelPrice
    k = key or _api_key()
    url = f'{OPINET_BASE}/avgSidoPrice.do?code={k}&out=json&date={date_str}'
    try:
        r = requests.get(url, timeout=20)
        r.raise_for_status()
        items = r.json().get('RESULT', {}).get('OIL', [])
    except Exception:
        return
    for it in items:
        sido = it.get('SIDONM', '')
        grade = it.get('PRODNM', '')
        try:
            amt = int(float(it.get('PRICE', 0)))
        except (ValueError, TypeError):
            continue
        # 시도 단위 가상 station: opinet_no = f'sido-{sido}'
        yield FuelPrice(
            station_opinet_no=f'sido-{sido}',
            fuel_grade=grade,
            dt=date_str.replace('-', ''),
            amount=amt,
            source='real',
        ).model_dump()


def run(start_date: str, days: int = 365, bucket: Optional[str] = None) -> int:
    """Fetch [start_date, start_date+days) and write daily NDJSON to S3.

    Returns total rows written. Defensive — single bad date doesn't abort the run.
    """
    import boto3  # type: ignore
    s3 = boto3.client('s3')
    bucket_name = bucket or os.environ.get(
        'SYNTHETIC_DATA_BUCKET', 'ontology-gcc-dev-synthetic-data-x'
    )
    cur = datetime.datetime.strptime(start_date, '%Y-%m-%d')
    written = 0
    key = _api_key()
    for _ in range(days):
        date_s = cur.strftime('%Y-%m-%d')
        rows = list(fetch_avg_by_sido(date_s, key=key))
        if rows:
            import json
            ndjson = '\n'.join(json.dumps(r, ensure_ascii=False) for r in rows)
            s3.put_object(
                Bucket=bucket_name,
                Key=f'nodes/fuel_price_real_yearly/{date_s}.ndjson',
                Body=ndjson.encode('utf-8'),
            )
            written += len(rows)
        cur += datetime.timedelta(days=1)
    return written


if __name__ == '__main__':
    import sys
    start = sys.argv[1] if len(sys.argv) > 1 else '2025-05-01'
    days = int(sys.argv[2]) if len(sys.argv) > 2 else 365
    print(f'wrote {run(start, days)} opinet prices to S3')
