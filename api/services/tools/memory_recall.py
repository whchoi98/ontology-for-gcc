"""Tool: memory_recall — long-term namespace 회상."""
from __future__ import annotations
import os

from api.services.agentcore import recall


def run(input: dict, *, persona_id: str, session_id: str, cust_id):
    memory_id = os.environ.get('AGENTCORE_MEMORY_ID', '')
    items = recall(
        memory_id, persona_id, session_id,
        input.get('query', ''), cust_id, input.get('top_k', 5),
    )
    return {'recalled': items}
