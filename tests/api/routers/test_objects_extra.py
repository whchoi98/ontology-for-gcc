"""Plan 5 Task 5.1.1 — search + 1-hop subgraph route tests.

응답 계약:
- 라우터는 URL slug (lowercase: 'customer') 를 `type` 으로, 클래스 라벨
  ('Customer') 을 `label` 로 반환.
- Unknown slug 는 HTTPException 404 (조용한 empty 가 아니라 명시적 에러).
- Subgraph 의 edges 는 cytoscape.js 형식 `{"data": {id, source, target, type, ...}}`.
"""
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
        assert body['type'] == 'customer'    # URL slug (lowercase)
        assert body['label'] == 'Customer'   # Neptune class label (PascalCase)
        assert body['q'] == 'c001'
        assert len(body['items']) == 1


def test_search_unknown_type_returns_404() -> None:
    """Unknown slug 는 HTTPException 404 (조용한 200+empty 가 아니라 명시 에러)."""
    r = client.get('/api/objects/notarealtype/search?q=x')
    assert r.status_code == 404
    assert 'unknown object type' in r.json().get('detail', '').lower()


def test_subgraph_returns_nodes_edges_shape() -> None:
    """Anchor 만 있고 neighbors 가 없는 케이스 — 2-pass query 패턴.

    라우터는 anchor 와 neighbors 를 별도 openCypher 쿼리로 가져옴
    (silent-drop regression 회피). side_effect 로 두 응답 시퀀스 mock.
    """
    anchor_resp = {'results': [
        {'n': {'~id': 'n1', '~labels': ['Customer'],
               '~properties': {'cust_id': 'c001'}}},
    ]}
    neighbors_resp = {'results': []}   # neighbor 없음
    with patch('api.routers.objects.open_cypher',
               side_effect=[anchor_resp, neighbors_resp]):
        r = client.get('/api/objects/customer/c001/subgraph')
        assert r.status_code == 200
        body = r.json()
        assert 'subgraph' in body
        assert body['subgraph']['edges'] == []
        assert len(body['subgraph']['nodes']) >= 1   # anchor 포함
        assert body['hops'] == 1


def test_subgraph_normalizes_results() -> None:
    """Edge 는 cytoscape.js 형식: {"data": {id, source, target, type, ...}}."""
    anchor_resp = {'results': [
        {'n': {'~id': 'n1', '~labels': ['Customer'],
               '~properties': {'cust_id': 'c001'}}},
    ]}
    # neighbors 쿼리는 (m, r) 쌍 반환 — 라우터의 두 번째 query 패턴 미러
    neighbors_resp = {'results': [{
        'm': {'~id': 'n2', '~labels': ['FuelTransaction'],
              '~properties': {'tx_id': 't1'}},
        'r': {'~id': 'r1', '~type': 'REFUELED', '~start': 'n1', '~end': 'n2'},
    }]}
    with patch('api.routers.objects.open_cypher',
               side_effect=[anchor_resp, neighbors_resp]):
        r = client.get('/api/objects/customer/c001/subgraph?hops=1')
        assert r.status_code == 200
        body = r.json()
        nodes = body['subgraph']['nodes']
        edges = body['subgraph']['edges']
        assert len(nodes) == 2
        assert len(edges) == 1
        assert edges[0]['data']['type'] == 'REFUELED'
        assert edges[0]['data']['source'] == 'c001'   # _domain_id 가 cust_id 매핑
        assert edges[0]['data']['target'] == 't1'
