"""Plan 3.1.1 — TDD for api/services/bedrock.py."""
from __future__ import annotations
from unittest.mock import patch, MagicMock
from api.services.bedrock import converse, embed, rerank, ConverseRequest


def test_converse_basic():
    fake = {'output': {'message': {'role': 'assistant', 'content': [{'text': 'hi'}]}}}
    with patch('api.services.bedrock._client') as mc:
        mc.return_value.converse.return_value = fake
        out = converse(ConverseRequest(
            system='You are an analyst.',
            messages=[{'role': 'user', 'content': [{'text': 'hello'}]}],
        ))
        assert out['output']['message']['content'][0]['text'] == 'hi'


def test_embed_returns_1024_vector():
    payload = b'{"embeddings": [{"float": [' + b','.join([b'0.0'] * 1024) + b']}]}'
    with patch('api.services.bedrock._client') as mc:
        mc.return_value.invoke_model.return_value = {
            'body': MagicMock(read=lambda: payload),
        }
        v = embed(['hello'])
        assert len(v) == 1 and len(v[0]) == 1024


def test_rerank_falls_back_to_input_order_on_error():
    docs = [{'text': 'a'}, {'text': 'b'}, {'text': 'c'}]
    with patch('api.services.bedrock._client') as mc:
        mc.return_value.invoke_model.side_effect = Exception('rerank down')
        out = rerank('query', docs)
        assert [d['text'] for d in out] == ['a', 'b', 'c']
