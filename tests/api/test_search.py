"""Plan 3 Task 3.2.2 — /api/search + /api/search/stream router tests."""
from __future__ import annotations
import os

os.environ.setdefault('DEMO_PUBLIC_MODE', 'true')

from unittest.mock import patch
from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)


def test_search_post_returns_results():
    fake = {
        'query': 'q',
        'persona_id': 'marketing',
        'results': [{'id': 'X', 'text': 'x'}],
        'subgraph': {'nodes': [], 'edges': []},
    }
    with patch('api.routers.search.search', return_value=fake):
        r = client.post(
            '/api/search',
            json={'query': '고급휘발유 충성', 'persona_id': 'marketing'},
        )
    assert r.status_code == 200
    assert r.json()['results'][0]['id'] == 'X'


def test_search_stream_yields_phases():
    fake = {
        'query': 'q',
        'persona_id': 'marketing',
        'results': [{'id': 'X'}],
        'subgraph': {'nodes': [], 'edges': []},
    }
    with patch('api.routers.search.search', return_value=fake):
        with client.stream(
            'POST',
            '/api/search/stream',
            json={'query': 'x', 'persona_id': 'marketing'},
        ) as r:
            body = b''.join(r.iter_bytes())
    assert b'"type": "phase"' in body
    assert b'"type": "result"' in body
    assert b'"type": "final"' in body
