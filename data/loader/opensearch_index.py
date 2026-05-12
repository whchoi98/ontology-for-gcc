"""OpenSearch Serverless hybrid (Nori BM25 + Cohere KNN)."""
from __future__ import annotations
import os
from opensearchpy import OpenSearch, RequestsHttpConnection
from boto3 import Session
from requests_aws4auth import AWS4Auth

INDEX = os.environ.get('OPENSEARCH_INDEX', 'ontology-gcc-dev-kb-index')
ENDPOINT = os.environ.get('OPENSEARCH_ENDPOINT', '')

def client() -> OpenSearch:
    region = os.environ.get('AWS_REGION', 'ap-northeast-2')
    creds = Session().get_credentials()
    auth = AWS4Auth(creds.access_key, creds.secret_key, region, 'aoss', session_token=creds.token)
    return OpenSearch(
        hosts=[{'host': ENDPOINT.replace('https://',''), 'port': 443}],
        http_auth=auth, use_ssl=True, verify_certs=True,
        connection_class=RequestsHttpConnection, timeout=30,
    )

INDEX_BODY = {
    'settings': {
        'index.knn': True,
        'analysis': {'analyzer': {'nori_korean': {'type': 'nori'}}},
    },
    'mappings': {
        'properties': {
            'doc_id': {'type': 'keyword'},
            'class_name': {'type': 'keyword'},
            'text': {'type': 'text', 'analyzer': 'nori_korean'},
            # Cohere embed-v4 응답 차원은 1536 (multimodal-ready). 인덱스도 동일.
            'embedding': {'type': 'knn_vector', 'dimension': 1536,
                          'method': {'name':'hnsw', 'engine':'nmslib', 'space_type':'cosinesimil'}},
            'metadata': {'type': 'object', 'enabled': False},
        }
    }
}

def ensure_index(recreate: bool = False):
    """기본은 idempotent. recreate=True면 기존 인덱스 삭제 후 새로 만들어 mapping mismatch 해결."""
    cl = client()
    if recreate and cl.indices.exists(index=INDEX):
        cl.indices.delete(index=INDEX)
    if not cl.indices.exists(index=INDEX):
        cl.indices.create(index=INDEX, body=INDEX_BODY)

def bulk_index(docs: list[dict]):
    """docs: [{'doc_id', 'class_name', 'text', 'embedding', 'metadata'}, ...].

    OpenSearch Serverless는 명시적 _id를 지원하지 않으므로 doc_id는 source
    필드로만 보관하고 OpenSearch가 _id를 자동 할당하도록 둔다.
    """
    cl = client()
    body = []
    for d in docs:
        body.append({'index': {'_index': INDEX}})
        body.append(d)
    cl.bulk(body=body)
