"""Plan 5 Task 5.2.1 — 25 클래스 schema + opinet_codes + validation 통합 export."""
from __future__ import annotations
from pathlib import Path
from data.schemas import ALL_CLASSES, ALL_RELATIONS


def schema_summary() -> dict:
    """Pydantic introspection on 25 classes + 31 relations."""
    classes = []
    for c in ALL_CLASSES:
        fields = []
        for fn, info in c.model_fields.items():
            fields.append({
                'name': fn,
                'type': str(info.annotation),
                'required': info.is_required(),
            })
        classes.append({'name': c.__name__, 'fields': fields})
    relations = [{'source': s, 'edge': e, 'target': t} for s, e, t in ALL_RELATIONS]
    return {
        'class_count': len(ALL_CLASSES),
        'relation_count': len(ALL_RELATIONS),
        'classes': classes,
        'relations': relations,
    }


def standards() -> dict:
    """opinet_codes.yaml as JSON; defensive load (yaml may not be importable in all envs)."""
    p = Path('ontology/standards/opinet_codes.yaml')
    if not p.exists():
        return {'note': 'opinet_codes.yaml not found', 'codes': []}
    try:
        import yaml  # type: ignore
        return yaml.safe_load(p.read_text(encoding='utf-8')) or {}
    except Exception as e:
        return {'error': f'failed to load: {e}', 'codes': []}


def validation_report() -> dict:
    """Plan 2 적재가 spec과 일치하는지 self-check.

    Live Neptune count vs expected ranges. Defensive — returns -1 if Neptune unreachable.
    """
    expected = {
        'Customer': (50_000, 60_000),
        'FuelTransaction': (500_000, 600_000),
        'GasStation': (12_000, 32_000),
        'WeatherObservation': (0, 20_000),
        'Campaign': (130, 250),
    }
    out = []
    for label, (mn, mx) in expected.items():
        try:
            from api.services.neptune import open_cypher
            res = open_cypher(f'MATCH (n:{label}) RETURN count(n) AS c')
            n = int(res.get('results', [{}])[0].get('c', 0))
        except Exception:
            n = -1
        ok = (n >= 0) and (mn <= n <= mx)
        out.append({
            'class': label,
            'count': n,
            'expected_min': mn,
            'expected_max': mx,
            'ok': ok,
        })
    return {'checks': out, 'all_ok': all(c['ok'] for c in out)}
