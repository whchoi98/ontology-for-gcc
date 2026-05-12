"""Bedrock Sonnet 4.6 Converse + Cohere embed-v4 + Cohere rerank-v3.

Plan 3 common service — used by search_pipeline, agent, and chat router.
Use ``from api.aws_clients import session`` for region pinning.
"""
from __future__ import annotations
import json
from functools import lru_cache
from typing import Any, List, Optional
from pydantic import BaseModel
from api.aws_clients import session
from api.config import settings


@lru_cache
def _client():
    return session().client('bedrock-runtime')


class ConverseRequest(BaseModel):
    system: str
    messages: List[dict]
    tool_specs: Optional[List[dict]] = None
    model_id: Optional[str] = None
    temperature: float = 0.5
    # 한국어 권고/차트 분석 + 후속 단계까지 포함하면 2K로는 자주 잘림. Sonnet 4.6은
    # 64K까지 지원하므로 안전하게 8K로 상향. 짧은 응답은 어차피 그 이전에 자연 종료.
    max_tokens: int = 8192


def _kwargs(req: ConverseRequest) -> dict[str, Any]:
    kwargs: dict[str, Any] = {
        'modelId': req.model_id or settings.BEDROCK_CHAT_MODEL_ID,
        'system': [{'text': req.system}],
        'messages': req.messages,
        'inferenceConfig': {'temperature': req.temperature, 'maxTokens': req.max_tokens},
    }
    if req.tool_specs:
        kwargs['toolConfig'] = {'tools': req.tool_specs}
    return kwargs


def converse(req: ConverseRequest) -> dict:
    """Single-shot Bedrock Converse — returns response dict."""
    return _client().converse(**_kwargs(req))


def converse_stream(req: ConverseRequest):
    """Generator yielding Bedrock streaming events (delta/tool-use)."""
    resp = _client().converse_stream(**_kwargs(req))
    for event in resp['stream']:
        yield event


def embed(texts: list[str]) -> list[list[float]]:
    """Cohere embed-v4 (1024-dim). Returns list of float vectors.

    Response shape varies between Cohere versions and inference profiles —
    handle dict before list to avoid KeyError(0) on dict-style payloads.
    """
    body = json.dumps({'texts': texts, 'input_type': 'search_document'})
    resp = _client().invoke_model(modelId=settings.BEDROCK_EMBED_MODEL_ID, body=body)
    payload = json.loads(resp['body'].read())
    embeddings = payload.get('embeddings', [])
    # Cohere v4 dict shape: {'float': [[...], [...]]}
    if isinstance(embeddings, dict):
        return embeddings.get('float', embeddings.get('embeddings', []))
    # Cohere v3 list-of-dicts: [{'float': [...]}, ...]
    if isinstance(embeddings, list) and embeddings and isinstance(embeddings[0], dict) and 'float' in embeddings[0]:
        return [e['float'] for e in embeddings]
    # Plain list of lists
    if isinstance(embeddings, list):
        return embeddings
    return []


def rerank(query: str, docs: list[dict], top_k: int = 10) -> list[dict]:
    """Cohere rerank-v3 cross-region inference profile.

    Falls back to input order on any error (preserves RRF order from upstream).
    """
    if not docs:
        return []
    try:
        body = json.dumps({
            'query': query,
            'documents': [d.get('text', '') for d in docs],
            'top_n': min(top_k, len(docs)),
        })
        resp = _client().invoke_model(
            modelId=settings.BEDROCK_RERANKER_INFERENCE_PROFILE_ARN,
            body=body,
        )
        scores = json.loads(resp['body'].read())['results']
        ordered = sorted(scores, key=lambda r: r['relevance_score'], reverse=True)
        return [docs[r['index']] for r in ordered]
    except Exception:
        return docs[:top_k]
