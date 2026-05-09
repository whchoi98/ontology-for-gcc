"""Centralized config — env-driven, validated at import."""
from __future__ import annotations
import os
from pydantic import BaseModel


class Settings(BaseModel):
    aws_region: str = os.environ.get("AWS_REGION", "ap-northeast-2")
    neptune_endpoint: str = os.environ.get("NEPTUNE_ENDPOINT", "")
    opensearch_host: str = os.environ.get("OPENSEARCH_HOST", "")
    opensearch_index: str = os.environ.get("OPENSEARCH_INDEX", "gcc-search")
    aurora_secret_arn: str = os.environ.get("AURORA_SECRET_ARN", "")
    bedrock_guardrail_id: str = os.environ.get("BEDROCK_GUARDRAIL_ID", "356xcbgyqcpq")
    bedrock_kb_id: str = os.environ.get("BEDROCK_KB_ID", "")
    # Cross-region inference profile preferred (apac.* available, global.* also OK).
    # Direct model id `anthropic.claude-sonnet-4-6` exists but may require provisioned throughput
    # — apac CRIP routes across APAC fleet for on-demand availability.
    sonnet_model: str = os.environ.get("GCC_SONNET_MODEL_ID", "global.anthropic.claude-sonnet-4-6")
    haiku_model: str = os.environ.get("GCC_HAIKU_MODEL_ID", "global.anthropic.claude-haiku-4-5-20251001-v1:0")
    embed_model: str = os.environ.get("GCC_EMBED_MODEL_ID", "amazon.titan-embed-text-v2:0")
    rerank_model: str = os.environ.get("GCC_RERANK_MODEL_ID", "")  # not available in ap-northeast-2 — RRF-only
    cognito_user_pool_id: str = os.environ.get("COGNITO_USER_POOL_ID", "us-east-1_zQZZJRYer")
    cognito_region: str = "us-east-1"  # Edge stack region
    log_level: str = os.environ.get("LOG_LEVEL", "INFO")

    # ---- Plan 3 uppercase aliases (used by new services bedrock/opensearch/etc.) ----
    @property
    def AWS_REGION(self) -> str:
        return self.aws_region

    @property
    def OPENSEARCH_ENDPOINT(self) -> str:
        return self.opensearch_host

    @property
    def OPENSEARCH_INDEX(self) -> str:
        return self.opensearch_index

    @property
    def BEDROCK_GUARDRAIL_ID(self) -> str:
        return self.bedrock_guardrail_id

    @property
    def BEDROCK_CHAT_MODEL_ID(self) -> str:
        return os.environ.get("BEDROCK_CHAT_MODEL_ID", self.sonnet_model)

    @property
    def BEDROCK_EMBED_MODEL_ID(self) -> str:
        # Plan 3 uses Cohere embed-v4 (1024-dim); fall back to existing GCC default.
        return os.environ.get("BEDROCK_EMBED_MODEL_ID",
                               os.environ.get("GCC_EMBED_MODEL_ID", "cohere.embed-multilingual-v3"))

    @property
    def BEDROCK_RERANKER_INFERENCE_PROFILE_ARN(self) -> str:
        return os.environ.get("BEDROCK_RERANKER_INFERENCE_PROFILE_ARN", self.rerank_model)


settings = Settings()
