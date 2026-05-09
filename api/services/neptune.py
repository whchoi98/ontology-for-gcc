"""Neptune openCypher 호출 래퍼. Plan 3에서 본격 구현."""
from __future__ import annotations
import os
import requests

ENDPOINT = os.environ.get('NEPTUNE_ENDPOINT', '')

def open_cypher(query: str, parameters: dict | None = None) -> dict:
    """parameters는 항상 keyword로 전달 (CLAUDE.md 컨벤션)."""
    if not ENDPOINT:
        return {'results': []}   # PoC stub
    url = f'https://{ENDPOINT}:8182/openCypher'
    payload = {'query': query, 'parameters': str(parameters or {})}
    r = requests.post(url, data=payload, timeout=30)
    r.raise_for_status()
    return r.json()
