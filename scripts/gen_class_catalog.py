"""data/schemas.py의 25 클래스를 ontology/classes/*.yaml로 export."""
from pathlib import Path
import yaml
from data.schemas import ALL_CLASSES, ALL_RELATIONS

OUT = Path('ontology/classes')
OUT.mkdir(parents=True, exist_ok=True)

DOMAIN_GROUPS = {
    'customer': ['Customer', 'Persona', 'Cluster', 'Segment', 'Member'],
    'behavior': ['FuelTransaction', 'AppEvent', 'SurveyResponse', 'CouponUse', 'PaymentMethod'],
    'marketing': ['Campaign', 'Coupon', 'Offer', 'Channel', 'CampaignSms', 'CampaignAggregation'],
    'operations': ['FuelProduct', 'GasStation', 'FuelPrice', 'Region'],
    'compliance_external': ['Term', 'TermAgreement', 'ConsumptionIndex', 'WeatherObservation'],
    'time': ['TimeSlot'],
}
group_of = {c: g for g, names in DOMAIN_GROUPS.items() for c in names}

for cls in ALL_CLASSES:
    name = cls.__name__
    fields = []
    for fname, info in cls.model_fields.items():
        ftype = str(info.annotation).replace('typing.', '').replace('<class ', '').replace("'>", '').replace("'", '')
        fields.append({'name': fname, 'type': ftype, 'required': info.is_required()})
    rels = [{'edge': e, 'target': t} for s, e, t in ALL_RELATIONS if s == name]
    doc = {
        'class': name,
        'group': group_of.get(name, 'misc'),
        'description': (cls.__doc__ or '').strip() or f'{name} 도메인 클래스',
        'fields': fields,
        'relations_out': rels,
    }
    (OUT / f'{name}.yaml').write_text(yaml.safe_dump(doc, allow_unicode=True, sort_keys=False), encoding='utf-8')

# Edges
edges_doc = {'edges': [{'source': s, 'edge': e, 'target': t} for s, e, t in ALL_RELATIONS]}
Path('ontology/relations/edges.yaml').write_text(
    yaml.safe_dump(edges_doc, allow_unicode=True, sort_keys=False), encoding='utf-8')

print(f'wrote {len(ALL_CLASSES)} class yamls + edges.yaml')
