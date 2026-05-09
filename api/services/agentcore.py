"""AgentCore Memory client — short-term (session) + long-term (user) namespaces.

Plan 3 Task 3.3.1 — wraps `bedrock-agentcore-control` for write_event /
retrieve_records. Both functions are graceful no-ops when AGENTCORE_MEMORY_ID
is unset (demo / test mode).
"""
from __future__ import annotations
from functools import lru_cache
from typing import Optional

from api.aws_clients import session


@lru_cache
def _client():
    return session().client('bedrock-agentcore-control')


def _ns_short(persona_id: str, session_id: str) -> str:
    return f'/short/{persona_id}/{session_id}'


def _ns_long(persona_id: str, cust_id: Optional[str]) -> str:
    return f'/long/{persona_id}/{cust_id or "anon"}'


def write_event(
    memory_id: str,
    persona_id: str,
    session_id: str,
    role: str,
    content: str,
    cust_id: Optional[str] = None,
) -> None:
    """Append a single conversational event to the actor's memory store."""
    if not memory_id:
        return
    try:
        _client().create_event(
            memoryId=memory_id,
            actorId=cust_id or 'anon',
            sessionId=session_id,
            payload=[
                {'conversational': {'role': role, 'content': {'text': content}}},
            ],
        )
    except Exception:
        # demo-mode tolerance — don't break chat if Memory store is missing.
        pass


def recall(
    memory_id: str,
    persona_id: str,
    session_id: str,
    query: str,
    cust_id: Optional[str] = None,
    limit: int = 5,
) -> list:
    """Semantic search over the actor's long-term namespace."""
    if not memory_id:
        return []
    try:
        resp = _client().retrieve_records(
            memoryId=memory_id,
            namespace=_ns_long(persona_id, cust_id),
            searchCriteria={'searchQuery': query, 'topK': limit},
        )
        return [r.get('content', {}) for r in resp.get('memoryRecords', [])]
    except Exception:
        return []
