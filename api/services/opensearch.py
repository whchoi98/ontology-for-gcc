"""Hybrid search: BM25 (Nori) + KNN (Cohere embed-v4) → RRF fusion (K=60)."""
from __future__ import annotations
from collections import defaultdict
from functools import lru_cache
from typing import List

from opensearchpy import OpenSearch, RequestsHttpConnection, AWSV4SignerAuth

from api.aws_clients import session
from api.config import settings

RRF_K = 60


@lru_cache
def client() -> OpenSearch:
    # AWSV4SignerAuth pulls credentials at sign time (not at construction),
    # so the cached client survives ECS task-role temp-credential rotation
    # (~6h). The prior AWS4Auth path froze creds via get_frozen_credentials()
    # and caused 403 after rotation on long-running Fargate tasks.
    region = settings.AWS_REGION
    auth = AWSV4SignerAuth(session().get_credentials(), region, 'aoss')
    host = settings.OPENSEARCH_ENDPOINT.replace('https://', '').replace('http://', '')
    return OpenSearch(
        hosts=[{'host': host, 'port': 443}],
        http_auth=auth,
        use_ssl=True,
        verify_certs=True,
        connection_class=RequestsHttpConnection,
        timeout=30,
    )


def _bm25(query: str, size: int) -> List[dict]:
    body = {'size': size, 'query': {'match': {'text': query}}}
    return client().search(index=settings.OPENSEARCH_INDEX, body=body)['hits']['hits']


def _knn(embedding: List[float], size: int) -> List[dict]:
    body = {
        'size': size,
        'query': {'knn': {'embedding': {'vector': embedding, 'k': size}}},
    }
    return client().search(index=settings.OPENSEARCH_INDEX, body=body)['hits']['hits']


def hybrid_search(query: str, embedding: List[float], size: int = 20) -> List[dict]:
    """RRF fusion: rank_score = sum(1 / (K + rank_i)) over BM25 and KNN ranks."""
    bm25 = _bm25(query, size)
    knn = _knn(embedding, size)
    scores: dict[str, float] = defaultdict(float)
    by_id: dict[str, dict] = {}
    for rank, hit in enumerate(bm25):
        scores[hit['_id']] += 1.0 / (RRF_K + rank)
        by_id[hit['_id']] = hit
    for rank, hit in enumerate(knn):
        scores[hit['_id']] += 1.0 / (RRF_K + rank)
        by_id[hit['_id']] = hit
    ordered = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    return [by_id[k] for k, _ in ordered[:size]]
