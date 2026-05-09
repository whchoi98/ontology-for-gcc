"""Plan 5 Task 5.2.1 — ontology meta route tests."""
from __future__ import annotations
import os
os.environ.setdefault('DEMO_PUBLIC_MODE', 'true')

from unittest.mock import patch
from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)


def test_schema_returns_25_classes() -> None:
    r = client.get('/api/ontology/schema')
    assert r.status_code == 200
    body = r.json()
    assert body['class_count'] == 25
    assert body['relation_count'] >= 30
    names = {c['name'] for c in body['classes']}
    assert 'Customer' in names
    assert 'WeatherObservation' in names


def test_standards_returns_dict() -> None:
    r = client.get('/api/ontology/standards')
    assert r.status_code == 200
    assert isinstance(r.json(), dict)


def test_validation_returns_checks() -> None:
    """Validation endpoint returns the 5-class check matrix.

    With Neptune unreachable in unit tests, each check has count=-1 and ok=False
    (defensive try/except in ontology_meta.validation_report)."""
    r = client.get('/api/ontology/validation')
    assert r.status_code == 200
    body = r.json()
    assert 'checks' in body
    assert isinstance(body['checks'], list)
    assert len(body['checks']) >= 5
    # Each check should expose class/count/expected/ok keys
    for c in body['checks']:
        assert 'class' in c and 'count' in c and 'expected_min' in c and 'ok' in c
