"""Plan 3.1.3 — tests for PERSONA_REGISTRY SSOT."""
from __future__ import annotations
from api.services.persona import PERSONA_REGISTRY, get, system_prompt


def test_5_departments():
    assert len(PERSONA_REGISTRY) == 5
    assert set(PERSONA_REGISTRY.keys()) == {
        'marketing', 'strategy', 'data-ai', 'crm', 'retail-ops',
    }


def test_default_marketing_on_unknown():
    assert get('unknown')['persona_id'] == 'marketing'
    assert get(None)['persona_id'] == 'marketing'
    assert get('marketing')['persona_id'] == 'marketing'


def test_system_prompt_contains_tone():
    p = system_prompt('marketing', 'A')
    assert '마케팅' in p
    assert 'AI Agent' in p
    assert 'A' in p
