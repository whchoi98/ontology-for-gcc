"""Plan 3 Task 3.3.1 — agentcore Memory wrapper tests (no-op when memory_id is empty)."""
from __future__ import annotations

from api.services.agentcore import recall, write_event


def test_recall_returns_empty_when_no_memory_id():
    assert recall('', 'marketing', 's1', 'q') == []


def test_write_event_no_op_when_no_memory_id():
    # Should not raise even with no memory_id wired.
    write_event('', 'marketing', 's1', 'user', 'hi')
