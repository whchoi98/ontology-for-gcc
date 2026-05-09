"""Neptune openCypher with SigV4 signing — Plan 3 replacement for 2.6 stub.

Uses ``botocore.auth.SigV4Auth`` for proper SigV4 signing of the JSON body
(matches the bulk loader pattern in data/loader/cypher_bulk.py which works
with IAM-auth enabled Neptune clusters).

Always pass parameters as keyword (CLAUDE.md convention).
``open_cypher(query=..., parameters=...)`` returns the raw Neptune response dict.
"""
from __future__ import annotations
import json
import os
from functools import lru_cache
from typing import Optional

import boto3
import requests


@lru_cache
def _session() -> boto3.Session:
    return boto3.Session()


NEPTUNE_ENDPOINT = os.environ.get('NEPTUNE_ENDPOINT', '')
REGION = os.environ.get('AWS_REGION', 'ap-northeast-2')


def open_cypher(
    query: str,
    parameters: Optional[dict] = None,
    timeout: int = 30,
) -> dict:
    """Execute openCypher query against Neptune.

    Returns ``{'results': []}`` when ``NEPTUNE_ENDPOINT`` is unset (demo/test mode).
    """
    if not NEPTUNE_ENDPOINT:
        return {'results': []}

    from botocore.auth import SigV4Auth
    from botocore.awsrequest import AWSRequest
    from botocore.credentials import Credentials

    url = f'https://{NEPTUNE_ENDPOINT}:8182/openCypher'
    body = json.dumps({
        'query': query,
        'parameters': json.dumps(parameters or {}),
    }).encode('utf-8')
    headers_in = {'Content-Type': 'application/json'}

    frozen = _session().get_credentials().get_frozen_credentials()
    aws_req = AWSRequest(method='POST', url=url, data=body, headers=headers_in)
    SigV4Auth(
        Credentials(frozen.access_key, frozen.secret_key, frozen.token),
        'neptune-db',
        REGION,
    ).add_auth(aws_req)
    prep = aws_req.prepare()
    r = requests.post(url, data=body, headers=dict(prep.headers), timeout=timeout, verify=True)
    r.raise_for_status()
    return r.json()
