"""Plan 3 Task 3.4.3 — /api/chat SSE multi-turn integration tests."""
from __future__ import annotations
import os

os.environ.setdefault('DEMO_PUBLIC_MODE', 'true')

from unittest.mock import patch
from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)


def _fake_stream():
    yield {'contentBlockDelta': {'delta': {'text': '안녕하세요, 마케터님.'}}}
    yield {'messageStop': {'stopReason': 'end_turn'}}


def test_chat_streams_delta_and_result():
    with patch('api.routers.chat.converse_stream', side_effect=lambda r: _fake_stream()), \
         patch('api.routers.chat.write_event'), \
         patch(
             'api.routers.chat.guardrail_apply',
             side_effect=lambda t, source='INPUT': (t, []),
         ):
        with client.stream(
            'POST',
            '/api/chat',
            json={
                'message': '고급휘발유 업셀링 캠페인 시작하고 싶어',
                'persona_id': 'marketing',
                'session_id': 's1',
            },
        ) as r:
            body = b''.join(r.iter_bytes())
    assert b'"type": "phase"' in body
    assert b'"type": "delta"' in body
    assert b'"type": "result"' in body
    assert b'"type": "final"' in body
