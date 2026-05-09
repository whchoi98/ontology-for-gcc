"""GET /api/objects/<type>?page=N&size=50  →  paginated list
GET /api/objects/<type>/<id>            →  single + 1-hop subgraph
GET /api/objects/<type>/search?q=       →  Plan 5 — text contains search
GET /api/objects/<type>/<id>/subgraph   →  Plan 5 — explicit 1-hop subgraph"""
from __future__ import annotations
from fastapi import APIRouter, HTTPException, Query
from data.schemas import ALL_CLASSES
from api.services.neptune import open_cypher

router = APIRouter(prefix='/api/objects', tags=['objects'])

# 25 클래스 type → label 매핑
_TYPE_REGISTRY = {cls.__name__.lower(): cls.__name__ for cls in ALL_CLASSES}

@router.get('/types')
def list_types():
    return {'types': sorted(_TYPE_REGISTRY.keys()), 'count': len(_TYPE_REGISTRY)}

@router.get('/{type_name}/search')
def search_objects(type_name: str, q: str = Query(...), size: int = 20):
    """Plan 5 — 단순 텍스트 검색 (속성 contains)."""
    label = _TYPE_REGISTRY.get(type_name.lower())
    if not label:
        return {'type': type_name, 'q': q, 'items': []}
    cypher = (
        f'MATCH (n:{label}) '
        'WHERE any(k IN keys(n) WHERE toString(n[k]) CONTAINS $q) '
        'RETURN n LIMIT $size'
    )
    try:
        res = open_cypher(cypher, parameters={'q': q, 'size': size})
        items = res.get('results', [])
    except Exception:
        items = []
    return {'type': label, 'q': q, 'items': items}

@router.get('/{type_name}/{node_id}/subgraph')
def get_object_subgraph(type_name: str, node_id: str, hops: int = 1):
    """Plan 5 — 1-hop subgraph (Cytoscape용 normalize)."""
    label = _TYPE_REGISTRY.get(type_name.lower())
    if not label:
        return {'subgraph': {'nodes': [], 'edges': []}}
    q = (
        f'MATCH (n:{label})-[r]-(m) '
        'WHERE n.id_key = $id OR n.cust_id = $id OR n.opinet_no = $id '
        '   OR n.campaign_cd = $id OR n.tx_id = $id '
        'RETURN n, r, m LIMIT 200'
    )
    try:
        res = open_cypher(q, parameters={'id': node_id})
        rows = res.get('results', [])
    except Exception:
        rows = []
    nodes_out: list = []
    edges_out: list = []
    seen: set = set()
    for row in rows:
        for n in (row.get('n'), row.get('m')):
            if not n:
                continue
            nid = n.get('~id') or n.get('id_key') or n.get('cust_id') or str(id(n))
            if nid in seen:
                continue
            seen.add(nid)
            labels = n.get('~labels') or []
            nodes_out.append({
                'id': nid,
                'label': labels[0] if labels else '',
                'props': n.get('~properties', n),
            })
        rel = row.get('r')
        if rel:
            edges_out.append({
                'id': rel.get('~id', str(id(rel))),
                'source': rel.get('~start', ''),
                'target': rel.get('~end', ''),
                'type': rel.get('~type', ''),
            })
    return {'subgraph': {'nodes': nodes_out, 'edges': edges_out}, 'hops': hops}

@router.get('/{type_name}')
def list_objects(type_name: str, page: int = Query(1, ge=1), size: int = Query(50, le=200)):
    label = _TYPE_REGISTRY.get(type_name.lower())
    if not label:
        raise HTTPException(404, f'unknown type: {type_name}')
    skip = (page - 1) * size
    q = f'MATCH (n:{label}) RETURN n SKIP $skip LIMIT $limit'
    res = open_cypher(q, parameters={'skip': skip, 'limit': size})
    return {'type': label, 'page': page, 'size': size, 'items': res.get('results', [])}

@router.get('/{type_name}/{node_id}')
def get_object(type_name: str, node_id: str):
    label = _TYPE_REGISTRY.get(type_name.lower())
    if not label:
        raise HTTPException(404, f'unknown type: {type_name}')
    # 1-hop subgraph
    q = f'MATCH (n:{label} {{id_key: $id}})-[r]-(m) RETURN n, r, m LIMIT 50'
    res = open_cypher(q, parameters={'id': node_id})
    return {'type': label, 'id': node_id, 'subgraph': res.get('results', [])}
