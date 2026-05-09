"""Plan 3 Task 3.4.2 — dispatch trace buffer + unknown tool fallback."""
from __future__ import annotations
from unittest.mock import patch

from api.services.agent import dispatch, _TRACE_BUF


def test_dispatch_unknown_tool():
    out = dispatch('nope', {}, persona_id='marketing', session_id='s', cust_id=None)
    assert 'error' in out


def test_dispatch_logs_to_trace_buffer():
    _TRACE_BUF.clear()
    with patch(
        'api.services.tools.semantic_search.run',
        return_value={'ok': True},
    ):
        dispatch(
            'semantic_search', {'query': 'x'},
            persona_id='marketing', session_id='s', cust_id=None,
        )
    assert len(_TRACE_BUF) == 1
    assert _TRACE_BUF[0]['tool'] == 'semantic_search'
