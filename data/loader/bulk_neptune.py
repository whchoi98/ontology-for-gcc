"""Neptune Bulk Loader API 클라이언트 (botocore SigV4 — works with port 8182)."""
from __future__ import annotations
import json, os, time, requests, boto3
from typing import Literal
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest
from botocore.credentials import Credentials

NEPTUNE_ENDPOINT = os.environ.get('NEPTUNE_ENDPOINT', '')
LOADER_ROLE_ARN = os.environ.get('NEPTUNE_BULK_LOADER_ROLE_ARN', '')

class BulkLoadError(RuntimeError): ...


def _signed_request(method: str, url: str, body: bytes | None = None, content_type: str | None = None,
                    timeout: int = 60) -> requests.Response:
    region = os.environ.get('AWS_REGION', 'ap-northeast-2')
    frozen = boto3.Session().get_credentials().get_frozen_credentials()
    headers = {}
    if content_type:
        headers['Content-Type'] = content_type
    aws_req = AWSRequest(method=method, url=url, data=body or b'', headers=headers)
    SigV4Auth(
        Credentials(frozen.access_key, frozen.secret_key, frozen.token),
        'neptune-db', region,
    ).add_auth(aws_req)
    prep = aws_req.prepare()
    h = dict(prep.headers)
    if method == 'POST':
        return requests.post(url, data=body, headers=h, timeout=timeout, verify=True)
    return requests.get(url, headers=h, timeout=timeout, verify=True)


def submit(s3_uri: str, fmt: Literal['csv','opencypher'] = 'opencypher', region: str = 'ap-northeast-2') -> str:
    if not (NEPTUNE_ENDPOINT and LOADER_ROLE_ARN):
        raise BulkLoadError('NEPTUNE_ENDPOINT + NEPTUNE_BULK_LOADER_ROLE_ARN env required')
    url = f'https://{NEPTUNE_ENDPOINT}:8182/loader'
    payload = {
        'source': s3_uri, 'format': fmt, 'iamRoleArn': LOADER_ROLE_ARN,
        'region': region, 'failOnError': 'FALSE', 'parallelism': 'HIGH',
        'updateSingleCardinalityProperties': 'TRUE',
    }
    body = json.dumps(payload).encode('utf-8')
    r = _signed_request('POST', url, body=body, content_type='application/json', timeout=120)
    if r.status_code >= 300:
        raise BulkLoadError(f'submit failed [{r.status_code}]: {r.text}')
    return r.json()['payload']['loadId']


def poll(load_id: str, interval: int = 5, timeout_min: int = 30) -> dict:
    url = f'https://{NEPTUNE_ENDPOINT}:8182/loader/{load_id}?details=true'
    deadline = time.time() + timeout_min * 60
    while time.time() < deadline:
        r = _signed_request('GET', url, timeout=30)
        if r.status_code >= 300:
            raise BulkLoadError(f'poll failed [{r.status_code}]: {r.text}')
        status = r.json()['payload']['overallStatus']['status']
        if status == 'LOAD_COMPLETED':
            return r.json()['payload']
        if status.startswith('LOAD_FAILED') or status.startswith('LOAD_CANCELLED'):
            raise BulkLoadError(f'load {load_id} status={status} details={r.json()}')
        time.sleep(interval)
    raise BulkLoadError(f'load {load_id} timeout after {timeout_min}min')
