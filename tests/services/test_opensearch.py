"""Plan 3.1.2 — TDD for api/services/opensearch.py (RRF fusion)."""
from __future__ import annotations
from unittest.mock import patch, MagicMock
from api.services.opensearch import hybrid_search, RRF_K  # noqa: F401


def _hits(ids: list[str]) -> dict:
    return {
        'hits': {
            'hits': [
                {'_id': i, '_score': 1.0 / (j + 1), '_source': {'text': i}}
                for j, i in enumerate(ids)
            ]
        }
    }


def test_rrf_fuses_bm25_and_knn():
    cl = MagicMock()
    # BM25 ranks A,B,C. KNN ranks B,D,E. B appears in both → RRF top.
    cl.search.side_effect = [_hits(['A', 'B', 'C']), _hits(['B', 'D', 'E'])]
    with patch('api.services.opensearch.client', return_value=cl):
        out = hybrid_search('query', embedding=[0.0] * 1024, size=5)
        ids = [r['_id'] for r in out]
        assert ids[0] == 'B'
        assert set(ids) == {'A', 'B', 'C', 'D', 'E'}
