"""SSE event helper — type/data 어휘 retail 호환.

Frontend의 streamSSE<T>가 generic하게 소비.
Event types: 'phase' | 'delta' | 'log' | 'final' | 'result'.
"""
from __future__ import annotations
import json
import logging
from typing import Any, AsyncIterator

log = logging.getLogger("gcc.sse")

EventType = str  # 'phase' | 'delta' | 'log' | 'final' | 'result'


def sse_event(type_: EventType, data: Any) -> str:
    """Format a single SSE message line as ``data: {json}\\n\\n``."""
    payload = json.dumps({'type': type_, 'data': data}, ensure_ascii=False)
    return f'data: {payload}\n\n'


async def stream_phases(phases: AsyncIterator) -> AsyncIterator[str]:
    """Wrap an async iterator of (type, data) tuples into SSE byte stream.

    Always emits a terminal ``final`` event (ok=True on success, ok=False on error).
    Stack trace is logged to CloudWatch so root cause is visible to operators.
    """
    try:
        async for ev in phases:
            yield sse_event(*ev)
        yield sse_event('final', {'ok': True})
    except Exception as e:
        log.exception("stream_phases failed: %s: %s", type(e).__name__, e)
        msg = str(e) or repr(e) or type(e).__name__
        yield sse_event('final', {'ok': False, 'error': msg, 'error_type': type(e).__name__})
