"""Cally 후속 질문 추천 — 직전 응답 + 페르소나에서 자연어 follow-up 3개 생성.

SSE result 이벤트의 `suggested_followups` 필드로 클라이언트에 전달.
실패 시 빈 리스트 반환 (graceful degrade — UI는 후속 chip 미렌더).
"""
from __future__ import annotations
import logging

from api.services.bedrock import ConverseRequest, converse

log = logging.getLogger("gcc.followups")

PERSONA_TONE = {
    'marketing':   '마케팅 부서 — 캠페인 ROI, 타겟팅, SMS 발송 효율, 전환률',
    'strategy':    '고객전략 부서 — 클러스터링, 페르소나 매칭, 행동 변화, retention',
    'data-ai':     '데이터·AI 부서 — 인사이트, 외부 신호 결합, 이상 탐지, 시각화',
    'crm':         'CRM·회원사업 부서 — 결제, 멤버십 등급, 컴플라이언스, 개인화',
    'retail-ops':  '리테일영업 부서 — 권역 경쟁 주유소, 룩어라이크, 검색 동선',
}

_SYSTEM = """당신은 GS Caltex M&M본부 사용자의 후속 자연어 질문 3개를 추천한다.

규칙:
- 한국어 자연어. 짧고 구체적 (각 30자 이내 권장).
- 직전 답변을 더 깊게 파거나, 액션으로 이어지거나, 다른 차원으로 확장.
- 사용자 페르소나의 KPI·관심사를 반영.
- 줄당 1개 질문, 불릿/번호/인용부호 없이.
- 정확히 3줄. 다른 설명 없음."""


def generate(assistant_text: str, persona_id: str, last_user_msg: str) -> list[str]:
    if not assistant_text.strip() or not last_user_msg.strip():
        return []

    tone = PERSONA_TONE.get(persona_id, PERSONA_TONE['marketing'])
    snippet = assistant_text.strip()[:1200]

    user = (
        f"사용자 부서 페르소나: {tone}\n\n"
        f"직전 사용자 질문: {last_user_msg.strip()[:300]}\n\n"
        f"직전 어시스턴트 답변:\n{snippet}\n\n"
        f"이 답변을 받은 사용자가 자연스럽게 던질 후속 질문 3개를 제안하세요."
    )

    try:
        req = ConverseRequest(
            system=_SYSTEM,
            messages=[{'role': 'user', 'content': [{'text': user}]}],
            temperature=0.7,
            max_tokens=300,
        )
        resp = converse(req)
        text = resp['output']['message']['content'][0]['text']
    except Exception as e:
        log.warning("followups generation failed: %s: %s", type(e).__name__, e)
        return []

    raw_lines = [l.strip(' -•*0123456789.).\t"\'`') for l in text.split('\n')]
    lines = [l for l in raw_lines if 5 <= len(l) <= 120]
    return lines[:3]
