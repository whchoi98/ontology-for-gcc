"""data_depth × persona × scenario → cohort 풀 결정."""
from __future__ import annotations
from typing import Iterable

ALL_DEPTHS = ['deep-history', 'coupon-only', 'sales-only', 'lookalike-syn']

# (persona, scenario) → list of acceptable data_depth
RULES: dict[tuple[str,str], list[str]] = {
    ('marketing', 'K'): ['deep-history', 'sales-only'],
    ('marketing', 'M'): ['deep-history'],
    ('marketing', 'F'): ['*'],
    ('strategy',  'K'): ['deep-history', 'sales-only'],
    ('data-ai',   'F'): ['*'],
    ('data-ai',   'E'): ['*'],
    # default: all depths
}

def select(persona_id: str, scenario_code: str) -> list[str]:
    rule = RULES.get((persona_id, scenario_code), ['*'])
    return ALL_DEPTHS if '*' in rule else rule
