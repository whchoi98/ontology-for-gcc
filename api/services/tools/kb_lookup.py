"""Tool: kb_lookup — Bedrock Knowledge Base retrieve."""
from __future__ import annotations
from functools import lru_cache

from api.aws_clients import session
from api.config import settings


@lru_cache
def _agent():
    return session().client('bedrock-agent-runtime')


def run(input: dict, *, persona_id: str, session_id: str, cust_id):
    if not settings.bedrock_kb_id:
        return {'snippets': []}
    try:
        resp = _agent().retrieve(
            knowledgeBaseId=settings.bedrock_kb_id,
            retrievalQuery={'text': input.get('query', '')},
            retrievalConfiguration={
                'vectorSearchConfiguration': {
                    'numberOfResults': input.get('top_k', 3),
                },
            },
        )
        return {
            'snippets': [
                r['content']['text']
                for r in resp.get('retrievalResults', [])
                if 'content' in r and 'text' in r['content']
            ],
        }
    except Exception as e:
        return {'snippets': [], 'error': str(e)}
