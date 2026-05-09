"""Neptune Bulk Loader API 클라이언트."""
from __future__ import annotations
import os, time, requests
from typing import Literal

NEPTUNE_ENDPOINT = os.environ.get('NEPTUNE_ENDPOINT', '')
LOADER_ROLE_ARN = os.environ.get('NEPTUNE_BULK_LOADER_ROLE_ARN', '')

class BulkLoadError(RuntimeError): ...

def submit(s3_uri: str, fmt: Literal['csv','opencypher'] = 'opencypher', region: str = 'ap-northeast-2') -> str:
    """s3_uri 예: s3://ontology-gcc-dev-synthetic-data/nodes/customer/. 반환: loadId."""
    if not (NEPTUNE_ENDPOINT and LOADER_ROLE_ARN):
        raise BulkLoadError('NEPTUNE_ENDPOINT + NEPTUNE_BULK_LOADER_ROLE_ARN env required')
    url = f'https://{NEPTUNE_ENDPOINT}:8182/loader'
    payload = {
        'source': s3_uri, 'format': fmt, 'iamRoleArn': LOADER_ROLE_ARN,
        'region': region, 'failOnError': 'FALSE', 'parallelism': 'HIGH',
        'updateSingleCardinalityProperties': 'TRUE',
    }
    r = requests.post(url, json=payload, timeout=30)
    r.raise_for_status()
    return r.json()['payload']['loadId']

def poll(load_id: str, interval: int = 5, timeout_min: int = 30) -> dict:
    """LOAD_COMPLETED 또는 실패 시 raise."""
    url = f'https://{NEPTUNE_ENDPOINT}:8182/loader/{load_id}'
    deadline = time.time() + timeout_min * 60
    while time.time() < deadline:
        r = requests.get(url, params={'details':'true'}, timeout=20)
        r.raise_for_status()
        status = r.json()['payload']['overallStatus']['status']
        if status == 'LOAD_COMPLETED':
            return r.json()['payload']
        if status.startswith('LOAD_FAILED') or status.startswith('LOAD_CANCELLED'):
            raise BulkLoadError(f'load {load_id} status={status}')
        time.sleep(interval)
    raise BulkLoadError(f'load {load_id} timeout after {timeout_min}min')
