"""Bedrock Guardrail apply — input scrub + output filter.

Plan 3.1.5 — new ``apply()`` 시그니처 (text, source) → (cleaned_text, list_of_violations).
Legacy ``apply_guardrail()`` retained for backward compat with mfg-template tests.
"""
from __future__ import annotations
from functools import lru_cache
from typing import Literal, Tuple, List

from api.aws_clients import bedrock_runtime, session
from api.config import settings


@lru_cache
def _client():
    return session().client('bedrock-runtime')


def apply(text: str, source: str = 'INPUT') -> Tuple[str, List[str]]:
    """Apply Bedrock Guardrail; returns (cleaned_text, list_of_violations).

    Falls back to (text, []) on missing config or any error.
    ``source`` is one of ``'INPUT'`` | ``'OUTPUT'`` (Bedrock convention).
    """
    if not settings.BEDROCK_GUARDRAIL_ID:
        return text, []
    try:
        resp = _client().apply_guardrail(
            guardrailIdentifier=settings.BEDROCK_GUARDRAIL_ID,
            guardrailVersion='DRAFT',
            source=source,
            content=[{'text': {'text': text, 'qualifiers': []}}],
        )
        action = resp.get('action', 'NONE')
        if action == 'GUARDRAIL_INTERVENED':
            outputs = resp.get('outputs', [])
            cleaned = outputs[0].get('text', '') if outputs else text
            assessments = resp.get('assessments', [])
            violations = [
                t.get('topic', 'unknown')
                for a in assessments
                for t in (a.get('topicPolicy', {}).get('topics', []) or [])
            ]
            return cleaned, violations
    except Exception:
        pass
    return text, []


# ---- Legacy mfg-template compatibility (used by existing test_bedrock_services.py) ----
def apply_guardrail(
    text: str,
    guardrail_id: str = None,
    source: Literal['INPUT', 'OUTPUT'] = 'OUTPUT',
    guardrail_version: str = 'DRAFT',
) -> dict:
    """Legacy signature returning the raw Bedrock response dict."""
    gid = guardrail_id or settings.bedrock_guardrail_id
    return bedrock_runtime().apply_guardrail(
        guardrailIdentifier=gid,
        guardrailVersion=guardrail_version,
        source=source,
        content=[{'text': {'text': text}}],
    )
