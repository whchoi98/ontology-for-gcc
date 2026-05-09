"""Neptune openCypher with SigV4 signing — Plan 3 replacement for 2.6 stub.

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
from requests_aws4auth import AWS4Auth


@lru_cache
def _session() -> boto3.Session:
    return boto3.Session()


NEPTUNE_ENDPOINT = os.environ.get('NEPTUNE_ENDPOINT', '')
REGION = os.environ.get('AWS_REGION', 'ap-northeast-2')


def _auth() -> AWS4Auth:
    creds = _session().get_credentials().get_frozen_credentials()
    return AWS4Auth(
        creds.access_key,
        creds.secret_key,
        REGION,
        'neptune-db',
        session_token=creds.token,
    )


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
    url = f'https://{NEPTUNE_ENDPOINT}:8182/openCypher'
    data = {'query': query, 'parameters': json.dumps(parameters or {})}
    r = requests.post(url, data=data, auth=_auth(), timeout=timeout)
    r.raise_for_status()
    return r.json()
