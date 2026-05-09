"""Tool: semantic_search — wraps Scenario A search_pipeline."""
from __future__ import annotations

from api.services.search_pipeline import search


def run(input: dict, *, persona_id: str, session_id: str, cust_id):
    return search(input.get('query', ''), persona_id, input.get('size', 10))
