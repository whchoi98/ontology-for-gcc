"""Customer 50K Neptune → OpenSearch (Cohere v4 embed) bulk indexing.

기존 description corpus와 동일 인덱스 사용, metadata.kind='customer'로 구분.
lookalike_expand는 kind==customer로 filter한 KNN으로 진짜 cust_id를 반환.

ECS run-task에서 한 번 실행 (옵션: RECREATE_CUSTOMERS=true → 기존 customer doc 삭제 후 재색인).
"""
from __future__ import annotations
import json
import logging
import os
import time
from typing import Iterable

from data.loader.opensearch_index import client, INDEX, ensure_index

log = logging.getLogger("gcc.opensearch.customer")

BATCH = 96  # Cohere embed-v4 max texts per request


def _customer_text(c: dict) -> str:
    """Customer 노드 → 임베딩용 description text."""
    parts = [f"고객 cust_id={c.get('cust_id', '')}"]
    if c.get('age_val'):
        parts.append(f"{c['age_val']}세")
    if c.get('gender_cd'):
        g = {'M': '남성', 'F': '여성'}.get(c['gender_cd'], c['gender_cd'])
        parts.append(g)
    if c.get('sido_nm'):
        parts.append(f"{c['sido_nm']} 거주")
    if c.get('sgg_nm'):
        parts.append(f"{c['sgg_nm']}")
    if c.get('member_grade'):
        parts.append(f"{c['member_grade']} 등급")
    if c.get('vip_yn') == 'Y':
        parts.append('VIP')
    if c.get('plcc_yn') == 'Y':
        parts.append('PLCC 보유')
    occ = {
        'OFC': '사무직', 'SVC': '서비스직', 'TCH': '전문직',
        'STD': '학생', 'OTH': '기타',
    }.get(c.get('occupation_cd', ''), '')
    if occ:
        parts.append(occ)
    if c.get('data_depth'):
        parts.append(f"data_depth={c['data_depth']}")
    return ', '.join(parts)


def _fetch_customers(skip: int, limit: int) -> list[dict]:
    """Neptune에서 Customer batch fetch."""
    from api.services.neptune import open_cypher
    q = """MATCH (c:Customer)
           RETURN c.cust_id AS cust_id, c.age_val AS age_val,
                  c.gender_cd AS gender_cd, c.sido_nm AS sido_nm,
                  c.sgg_nm AS sgg_nm, c.member_grade AS member_grade,
                  c.vip_yn AS vip_yn, c.plcc_yn AS plcc_yn,
                  c.occupation_cd AS occupation_cd,
                  c.data_depth AS data_depth
           ORDER BY c.cust_id
           SKIP $skip LIMIT $limit"""
    res = open_cypher(query=q, parameters={'skip': skip, 'limit': limit})
    return res.get('results', [])


def _embed_batch(texts: list[str]) -> list[list[float]]:
    from api.services.bedrock import embed
    return embed(texts)


def _bulk_index(docs: Iterable[dict]) -> int:
    cl = client()
    body: list = []
    n = 0
    for d in docs:
        body.append({'index': {'_index': INDEX}})
        body.append(d)
        n += 1
    if body:
        cl.bulk(body=body)
    return n


def _delete_customer_docs() -> None:
    """metadata.kind=customer doc 일괄 삭제. delete_by_query 사용."""
    cl = client()
    try:
        cl.delete_by_query(
            index=INDEX,
            body={'query': {'term': {'metadata.kind': 'customer'}}},
            refresh=True,
        )
        log.info("deleted existing customer docs")
    except Exception as e:
        log.warning("delete_by_query failed (skipping): %s", e)


def run(recreate: bool = False) -> dict:
    """전체 Customer 인덱싱. recreate=True → 기존 customer doc 삭제 후 새로."""
    ensure_index()  # idempotent — 인덱스가 이미 있으면 그대로
    if recreate:
        _delete_customer_docs()

    total_indexed = 0
    skip = 0
    while True:
        rows = _fetch_customers(skip, BATCH)
        if not rows:
            break
        texts = [_customer_text(r) for r in rows]
        try:
            vecs = _embed_batch(texts)
        except Exception as e:
            log.exception("embed batch failed at skip=%d: %s", skip, e)
            time.sleep(5)
            skip += BATCH
            continue
        if not vecs or len(vecs) != len(rows):
            log.warning("embed returned %d vectors for %d rows at skip=%d",
                        len(vecs) if vecs else 0, len(rows), skip)
            skip += BATCH
            continue
        docs = []
        for r, t, v in zip(rows, texts, vecs):
            docs.append({
                'doc_id': f"customer:{r.get('cust_id')}",
                'class_name': 'Customer',
                'text': t,
                'embedding': v,
                'metadata': {
                    'kind': 'customer',
                    'cust_id': str(r.get('cust_id', '')),
                    'age': r.get('age_val'),
                    'gender': r.get('gender_cd'),
                    'sido': r.get('sido_nm'),
                    'grade': r.get('member_grade'),
                    'vip': r.get('vip_yn'),
                    'plcc': r.get('plcc_yn'),
                    'occupation': r.get('occupation_cd'),
                    'depth': r.get('data_depth'),
                },
            })
        n = _bulk_index(docs)
        total_indexed += n
        if total_indexed % 480 == 0 or n < BATCH:
            log.info("indexed %d customers", total_indexed)
        skip += BATCH
        time.sleep(0.2)  # gentle rate limit

    log.info("DONE — total %d customers indexed", total_indexed)
    return {'indexed': total_indexed, 'recreated': recreate}


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO,
                        format='%(asctime)s %(levelname)s %(message)s')
    result = run(recreate=os.environ.get('RECREATE_CUSTOMERS', '').lower() == 'true')
    print(json.dumps(result, ensure_ascii=False))
