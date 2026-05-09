"""GET /api/objects/<type>?page=N&size=50  →  paginated list
GET /api/objects/<type>/<id>            →  single + 1-hop subgraph"""
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
