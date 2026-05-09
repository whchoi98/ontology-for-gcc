"""AgentCore Code Interpreter Firecracker microVM client.

Plan 3 Task 3.3.2 — `execute()` injects a NanumGothic matplotlib preamble so
Korean labels render correctly, then forwards to `bedrock-agentcore` and
returns ``{output, images: list[bytes(PNG)], error}``.
"""
from __future__ import annotations
import base64
from functools import lru_cache
from typing import Optional

from api.aws_clients import session


@lru_cache
def _client():
    return session().client('bedrock-agentcore')


NANUM_PREAMBLE = """
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
plt.rcParams['font.family'] = 'NanumGothic'
plt.rcParams['axes.unicode_minus'] = False
"""


def execute(
    code: str,
    files: Optional[list] = None,
    timeout_s: int = 60,
) -> dict:
    """Run a Python snippet in the AgentCore sandbox.

    Returns ``{'output': str, 'images': list[bytes(PNG)], 'error': str}``.
    Falls back to ``error`` payload on any exception (network / IAM / sandbox).
    """
    full_code = NANUM_PREAMBLE + '\n' + code
    try:
        resp = _client().execute_code(
            code=full_code,
            files=files or [],
            timeoutSeconds=timeout_s,
        )
        images = [
            base64.b64decode(img['data'])
            for img in resp.get('images', [])
            if 'data' in img
        ]
        return {
            'output': resp.get('stdout', ''),
            'images': images,
            'error': resp.get('stderr', ''),
        }
    except Exception as e:
        return {'output': '', 'images': [], 'error': str(e)}
