"""Plan 3 Task 3.2.1 — search_pipeline composes embed → hybrid → rerank → subgraph."""
from __future__ import annotations
from unittest.mock import patch

from api.services.search_pipeline import search


def test_pipeline_calls_embed_then_hybrid_then_rerank():
    with patch('api.services.search_pipeline.embed', return_value=[[0.0] * 1024]) as me, \
         patch(
             'api.services.search_pipeline.hybrid_search',
             return_value=[
                 {'_id': 'A', '_source': {'text': 'a', 'class_name': 'X'}},
                 {'_id': 'B', '_source': {'text': 'b', 'class_name': 'Y'}},
             ],
         ) as mh, \
         patch(
             'api.services.search_pipeline.rerank',
             side_effect=lambda q, ds, top_k=10: ds[:top_k],
         ) as mr, \
         patch(
             'api.services.search_pipeline.open_cypher',
             return_value={'results': []},
         ):
        out = search(query='고급휘발유 충성', persona_id='marketing', size=10)
    me.assert_called_once_with(['고급휘발유 충성'])
    mh.assert_called_once()
    mr.assert_called_once()
    assert len(out['results']) == 2
    assert out['persona_id'] == 'marketing'
    assert out['subgraph'] == {'nodes': [], 'edges': []}
