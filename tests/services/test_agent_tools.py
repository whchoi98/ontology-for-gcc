"""Plan 3 Task 3.4.1 — TOOL_SPECS shape validation."""
from __future__ import annotations

from api.services.agent import TOOL_SPECS


def test_10_tools_with_unique_names():
    names = [t['toolSpec']['name'] for t in TOOL_SPECS]
    assert len(names) == 10
    assert len(set(names)) == 10


def test_each_tool_has_schema():
    for t in TOOL_SPECS:
        spec = t['toolSpec']
        assert 'name' in spec and 'description' in spec
        assert spec['inputSchema']['json']['type'] == 'object'
        assert 'properties' in spec['inputSchema']['json']
