"""Tool: lookalike_expand — embedding similarity expansion of seed customers.

응답에 expanded(cust_id list) + expanded_profiles(cust_id + 핵심 속성)을 함께 반환해
프론트가 "고객-3 (47세 여성, 경남, Gold)" 같은 식별 라벨을 만들 수 있도록 한다.
PoC는 비식별 데이터이므로 실명 없음 — 속성 조합으로 대체.
"""
from __future__ import annotations

from api.services.bedrock import embed
from api.services.opensearch import client
from api.services.neptune import open_cypher
from api.config import settings


def _enrich_profiles(cust_ids: list[str]) -> list[dict]:
    """cust_id 리스트에 핵심 식별 속성을 붙여 [{cust_id, age, gender, sido, grade, vip}] 반환."""
    if not cust_ids:
        return []
    q = """UNWIND $ids AS id
           MATCH (c:Customer {cust_id: id})
           RETURN c.cust_id AS cust_id, c.age_val AS age, c.gender_cd AS gender,
                  c.sido_nm AS sido, c.member_grade AS grade, c.vip_yn AS vip,
                  c.occupation_cd AS occupation, c.data_depth AS depth"""
    try:
        res = open_cypher(query=q, parameters={'ids': cust_ids})
        return res.get('results', [])
    except Exception:
        return []


def run(input: dict, *, persona_id: str, session_id: str, cust_id):
    seed = input.get('seed_cust_ids') or []
    top_pct = input.get('top_pct', 0.20)
    if not seed:
        return {'expanded': [], 'count': 0, 'expanded_profiles': []}
    seed_text = ' '.join(seed)
    try:
        vec = embed([seed_text])[0]
    except Exception as e:
        return {'expanded': [], 'count': 0, 'error': str(e), 'expanded_profiles': []}
    try:
        cl = client()
        # KNN + filter — Customer 인덱스 doc만 매칭 (description doc 제외).
        # OpenSearch Serverless는 KNN에 query filter를 함께 보낼 수 있다.
        # metadata 필드는 인덱스 mapping에서 enabled=False라 query filter 불가.
        # 대신 top-level class_name (keyword) 으로 Customer doc만 매칭한다.
        body = {
            'size': max(int(50000 * top_pct), 100),
            'query': {
                'bool': {
                    'must': [{'knn': {'embedding': {'vector': vec, 'k': 1000}}}],
                    'filter': [{'term': {'class_name': 'Customer'}}],
                }
            },
        }
        hits = cl.search(index=settings.opensearch_index, body=body)['hits']['hits']
    except Exception as e:
        return {'expanded': [], 'count': 0, 'error': str(e), 'expanded_profiles': []}
    seed_set = set(seed)
    # _source.metadata.cust_id에서 실 cust_id 추출 (Customer 인덱스 색인 시 저장).
    expanded: list[str] = []
    for h in hits:
        src = h.get('_source', {})
        meta = src.get('metadata') or {}
        cid = str(meta.get('cust_id') or '').strip()
        if cid and cid not in seed_set:
            expanded.append(cid)
    # 상위 50개만 Neptune enrich (네 메타와 합쳐 풍부한 라벨 만들기).
    profiles = _enrich_profiles(expanded[:50])
    return {
        'expanded': expanded[:1000],
        'count': len(expanded),
        'expanded_profiles': profiles,
    }
