"""Plan 5 Task 5.1.1 — search + 1-hop subgraph route tests."""
from __future__ import annotations
import os
os.environ.setdefault('DEMO_PUBLIC_MODE', 'true')

from unittest.mock import patch
from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)


def test_search_returns_items() -> None:
    with patch('api.routers.objects.open_cypher',
               return_value={'results': [{'n': {'cust_id': 'c001'}}]}):
        r = client.get('/api/objects/customer/search?q=c001')
        assert r.status_code == 200
        body = r.json()
        assert body['type'] == 'Customer'
        assert body['q'] == 'c001'
        assert len(body['items']) == 1


def test_search_unknown_type_returns_empty() -> None:
    r = client.get('/api/objects/notarealtype/search?q=x')
    assert r.status_code == 200
    assert r.json()['items'] == []


def test_subgraph_returns_nodes_edges_shape() -> None:
    with patch('api.routers.objects.open_cypher', return_value={'results': []}):
        r = client.get('/api/objects/customer/c001/subgraph')
        assert r.status_code == 200
        body = r.json()
        assert 'subgraph' in body
        assert body['subgraph']['nodes'] == []
        assert body['subgraph']['edges'] == []
        assert body['hops'] == 1


def test_subgraph_normalizes_results() -> None:
    fake = {'results': [{
        'n': {'~id': 'n1', '~labels': ['Customer'], '~properties': {'cust_id': 'c001'}},
        'r': {'~id': 'r1', '~type': 'REFUELED', '~start': 'n1', '~end': 'n2'},
        'm': {'~id': 'n2', '~labels': ['FuelTransaction'], '~properties': {'tx_id': 't1'}},
    }]}
    with patch('api.routers.objects.open_cypher', return_value=fake):
        r = client.get('/api/objects/customer/c001/subgraph?hops=1')
        assert r.status_code == 200
        body = r.json()
        nodes = body['subgraph']['nodes']
        edges = body['subgraph']['edges']
        assert len(nodes) == 2
        assert len(edges) == 1
        assert edges[0]['type'] == 'REFUELED'
