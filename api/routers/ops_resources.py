"""GET /api/ops/resources — 프로젝트 자원의 현재 상태 (관리자 가시성).

awsops 패턴 차용 — Neptune / OpenSearch Serverless / ECS / CloudFront / S3 /
Cognito / Bedrock의 핵심 상태를 한 호출로 반환. 페이지 새로고침으로 라이브
모니터링.
"""
from __future__ import annotations
import logging
import os
from typing import Any

from fastapi import APIRouter

from api.aws_clients import session

log = logging.getLogger("gcc.ops.resources")
router = APIRouter(prefix='/api/ops', tags=['ops_resources'])


def _safe(fn, default=None):
    """boto3 호출 wrapper — 실패 시 default + log warning. 자원이 없거나 권한
    부족해도 페이지 전체가 깨지지 않도록.
    """
    try:
        return fn()
    except Exception as e:
        log.warning("resource probe failed: %s", e)
        return default


def _neptune_status() -> dict:
    s = session()
    cluster_id = 'ontology-gcc-dev-neptune'
    instance_id = 'ontology-gcc-dev-neptune-1'

    def cluster():
        c = s.client('neptune')
        r = c.describe_db_clusters(DBClusterIdentifier=cluster_id)
        return r['DBClusters'][0]

    def instance():
        c = s.client('neptune')
        r = c.describe_db_instances(DBInstanceIdentifier=instance_id)
        return r['DBInstances'][0]

    def memory():
        # 최근 5분 FreeableMemory 평균 (B)
        from datetime import datetime, timedelta, timezone
        cw = s.client('cloudwatch')
        end = datetime.now(timezone.utc)
        start = end - timedelta(minutes=10)
        r = cw.get_metric_statistics(
            Namespace='AWS/Neptune', MetricName='FreeableMemory',
            Dimensions=[{'Name': 'DBInstanceIdentifier', 'Value': instance_id}],
            StartTime=start, EndTime=end, Period=300, Statistics=['Average'],
        )
        dps = sorted(r.get('Datapoints', []), key=lambda d: d['Timestamp'])
        return dps[-1]['Average'] if dps else None

    cl = _safe(cluster) or {}
    inst = _safe(instance) or {}
    mem = _safe(memory)
    return {
        'service': 'Amazon Neptune',
        'kind': 'database',
        'status': cl.get('Status'),
        'engine': cl.get('Engine'),
        'engine_version': cl.get('EngineVersion'),
        'endpoint': cl.get('Endpoint'),
        'instance_class': inst.get('DBInstanceClass'),
        'free_memory_gb': round(mem / (1024 ** 3), 2) if mem else None,
        'iam_auth': cl.get('IAMDatabaseAuthenticationEnabled'),
    }


def _opensearch_status() -> dict:
    s = session()
    name = 'ontology-gcc-dev'

    def coll():
        c = s.client('opensearchserverless')
        r = c.list_collections()
        for it in r.get('collectionSummaries', []):
            if it.get('name') == name:
                return it
        return None

    def index_count():
        from opensearchpy import OpenSearch, RequestsHttpConnection
        from requests_aws4auth import AWS4Auth
        endpoint = os.environ.get('OPENSEARCH_ENDPOINT', '').replace('https://', '')
        index = os.environ.get('OPENSEARCH_INDEX', 'ontology-gcc-dev-kb-index')
        if not endpoint:
            return None
        creds = s.get_credentials().get_frozen_credentials()
        auth = AWS4Auth(creds.access_key, creds.secret_key, 'ap-northeast-2', 'aoss', session_token=creds.token)
        cl = OpenSearch(
            hosts=[{'host': endpoint, 'port': 443}],
            http_auth=auth, use_ssl=True, verify_certs=True,
            connection_class=RequestsHttpConnection, timeout=10,
        )
        if not cl.indices.exists(index=index):
            return 0
        r = cl.count(index=index)
        return int(r.get('count', 0))

    c = _safe(coll) or {}
    docs = _safe(index_count)
    return {
        'service': 'OpenSearch Serverless',
        'kind': 'search',
        'status': c.get('status'),
        'collection': c.get('name'),
        'collection_id': c.get('id'),
        'collection_type': 'VECTORSEARCH',
        'index': os.environ.get('OPENSEARCH_INDEX', 'ontology-gcc-dev-kb-index'),
        'doc_count': docs,
    }


def _ecs_status() -> dict:
    s = session()
    cluster = 'ontology-gcc-dev-cluster'

    def services():
        c = s.client('ecs')
        r = c.describe_services(cluster=cluster, services=['ontology-gcc-dev-api', 'ontology-gcc-dev-web'])
        out = []
        for svc in r.get('services', []):
            dep = (svc.get('deployments') or [{}])[0]
            out.append({
                'name': svc.get('serviceName'),
                'desired': svc.get('desiredCount'),
                'running': svc.get('runningCount'),
                'rollout_state': dep.get('rolloutState'),
                'task_definition': (dep.get('taskDefinition') or '').rsplit(':', 1)[-1],
                'updated_at': str(dep.get('updatedAt') or '')[:19],
            })
        return out

    return {
        'service': 'ECS Fargate',
        'kind': 'compute',
        'cluster': cluster,
        'services': _safe(services) or [],
    }


def _cloudfront_status() -> dict:
    import boto3
    # CloudFront는 글로벌 서비스이지만 API endpoint는 us-east-1.
    cf = boto3.client('cloudfront', region_name='us-east-1')

    def dist():
        c = cf
        r = c.list_distributions()
        items = (r.get('DistributionList') or {}).get('Items', [])
        for d in items:
            if d.get('DomainName') == 'd2vtgoziwcvh15.cloudfront.net':
                return d
        return None

    d = _safe(dist) or {}
    return {
        'service': 'CloudFront + Lambda@Edge',
        'kind': 'edge',
        'status': d.get('Status'),
        'domain_name': d.get('DomainName'),
        'aliases': (d.get('Aliases') or {}).get('Items') or [],
        'enabled': d.get('Enabled'),
        'price_class': d.get('PriceClass'),
    }


def _s3_status() -> dict:
    s = session()
    buckets = [
        ('ontology-gcc-dev-raw-docs-061525506239', 'raw_docs'),
        ('ontology-gcc-dev-uploads-061525506239', 'uploads'),
        ('ontology-gcc-dev-synthetic-data-061525506239', 'synthetic'),
    ]

    def per_bucket(name: str):
        c = s.client('cloudwatch')
        from datetime import datetime, timedelta, timezone
        end = datetime.now(timezone.utc)
        start = end - timedelta(days=2)
        size = c.get_metric_statistics(
            Namespace='AWS/S3', MetricName='BucketSizeBytes',
            Dimensions=[{'Name': 'BucketName', 'Value': name}, {'Name': 'StorageType', 'Value': 'StandardStorage'}],
            StartTime=start, EndTime=end, Period=86400, Statistics=['Average'],
        )
        objs = c.get_metric_statistics(
            Namespace='AWS/S3', MetricName='NumberOfObjects',
            Dimensions=[{'Name': 'BucketName', 'Value': name}, {'Name': 'StorageType', 'Value': 'AllStorageTypes'}],
            StartTime=start, EndTime=end, Period=86400, Statistics=['Average'],
        )
        size_gb = (size['Datapoints'][-1]['Average'] / (1024 ** 3)) if size.get('Datapoints') else None
        n_obj = int(objs['Datapoints'][-1]['Average']) if objs.get('Datapoints') else None
        return {'size_gb': round(size_gb, 2) if size_gb is not None else None, 'objects': n_obj}

    out = []
    for name, role in buckets:
        m = _safe(lambda n=name: per_bucket(n), default={'size_gb': None, 'objects': None})
        out.append({'role': role, 'name': name, **m})
    return {
        'service': 'Amazon S3',
        'kind': 'storage',
        'buckets': out,
    }


def _cognito_status() -> dict:
    import boto3
    # Cognito User Pool도 Edge stack이 us-east-1에 만들었으므로 동일 region 명시.
    cog = boto3.client('cognito-idp', region_name='us-east-1')

    def pool():
        c = cog
        r = c.list_user_pools(MaxResults=60)
        for p in r.get('UserPools', []):
            if 'gcc' in (p.get('Name') or '').lower() or p.get('Name') == 'ontology-gcc-dev-userpool':
                return p
        return None

    def count_users(pool_id: str):
        c = cog
        r = c.list_users(UserPoolId=pool_id, Limit=60)
        return len(r.get('Users', []))

    p = _safe(pool) or {}
    u = _safe(lambda: count_users(p['Id'])) if p.get('Id') else None
    return {
        'service': 'Cognito User Pool',
        'kind': 'auth',
        'pool_id': p.get('Id'),
        'pool_name': p.get('Name'),
        'user_count': u,
    }


def _bedrock_status() -> dict:
    return {
        'service': 'Amazon Bedrock',
        'kind': 'ai',
        'chat_model': os.environ.get('BEDROCK_CHAT_MODEL_ID', 'global.anthropic.claude-sonnet-4-6'),
        'embed_model': os.environ.get('BEDROCK_EMBED_MODEL_ID', 'global.cohere.embed-v4:0'),
        'guardrail_id': os.environ.get('BEDROCK_GUARDRAIL_ID'),
    }


@router.get('/resources')
def resources() -> dict[str, Any]:
    """7개 자원 그룹 (compute · database · search · edge · storage · auth · ai)
    의 현재 상태를 한 페이로드로 반환. 30~60초 캐싱은 클라이언트 측 책임.
    """
    return {
        'compute': _ecs_status(),
        'database': _neptune_status(),
        'search': _opensearch_status(),
        'edge': _cloudfront_status(),
        'storage': _s3_status(),
        'auth': _cognito_status(),
        'ai': _bedrock_status(),
    }
