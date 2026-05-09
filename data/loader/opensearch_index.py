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
            'embedding': {'type': 'knn_vector', 'dimension': 1024,
                          'method': {'name':'hnsw', 'engine':'nmslib', 'space_type':'cosinesimil'}},
            'metadata': {'type': 'object', 'enabled': False},
        }
    }
}

def ensure_index():
    cl = client()
    if not cl.indices.exists(index=INDEX):
        cl.indices.create(index=INDEX, body=INDEX_BODY)

def bulk_index(docs: list[dict]):
    """docs: [{'doc_id', 'class_name', 'text', 'embedding', 'metadata'}, ...]"""
    cl = client()
    body = []
    for d in docs:
        body.append({'index': {'_index': INDEX, '_id': d['doc_id']}})
        body.append(d)
    cl.bulk(body=body, refresh=False)
