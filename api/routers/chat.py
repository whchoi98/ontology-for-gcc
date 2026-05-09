"""POST /api/chat — Converse 다회차 + 10 도구 + Memory + Guardrail (SSE).

Plan 3 Task 3.4.3 — replaces the legacy mfg-template chat router.
"""
from __future__ import annotations
import json
import os
from typing import Optional

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.services.bedrock import converse_stream, ConverseRequest
from api.services.persona import system_prompt
from api.services.agent import TOOL_SPECS, dispatch, get_trace_buf
from api.services.agentcore import write_event
from api.services.guardrails import apply as guardrail_apply
from api.services.sse import stream_phases

router = APIRouter(prefix='/api', tags=['chat'])


class ChatRequest(BaseModel):
    message: str
    persona_id: Optional[str] = 'marketing'
    session_id: str = 'default'
    cust_id: Optional[str] = None
    history: list = []  # 이전 turn (Bedrock messages 형식)


def _memory_id() -> str:
    return os.environ.get('AGENTCORE_MEMORY_ID', '')


@router.post('/chat')
async def chat(req: ChatRequest):
    async def gen():
        # 1) input guardrail
        cleaned, violations = guardrail_apply(req.message, source='INPUT')
        if violations:
            yield ('log', {'guardrail': 'INPUT', 'violations': violations})

        # 2) memory write (user turn)
        write_event(
            _memory_id(), req.persona_id or 'marketing',
            req.session_id, 'user', cleaned, req.cust_id,
        )

        sys_prompt = system_prompt(req.persona_id, 'B')
        messages = list(req.history) + [
            {'role': 'user', 'content': [{'text': cleaned}]},
        ]

        yield ('phase', {'name': 'turn_start', 'persona': req.persona_id})

        # 3) Converse loop with tool use (max 6 iterations)
        max_iters = 6
        assistant_chunks: list = []
        it = 0
        for it in range(max_iters):
            req_b = ConverseRequest(
                system=sys_prompt, messages=messages, tool_specs=TOOL_SPECS,
            )
            tool_calls_buffer: list = []
            assistant_chunks = []
            stop_reason: Optional[str] = None

            try:
                stream = converse_stream(req_b)
            except Exception as e:
                yield ('log', {'bedrock_error': str(e)[:200]})
                break

            for ev in stream:
                if 'contentBlockStart' in ev:
                    block = ev['contentBlockStart']
                    start = block.get('start') or {}
                    if 'toolUse' in start:
                        tu = start['toolUse']
                        tool_calls_buffer.append({
                            'name': tu.get('name', ''),
                            'toolUseId': tu.get('toolUseId', ''),
                            'input': '',
                        })
                elif 'contentBlockDelta' in ev:
                    delta = ev['contentBlockDelta'].get('delta') or {}
                    if 'text' in delta:
                        assistant_chunks.append(delta['text'])
                        yield ('delta', {'text': delta['text']})
                    elif 'toolUse' in delta and tool_calls_buffer:
                        tool_calls_buffer[-1]['input'] += delta['toolUse'].get('input', '')
                elif 'messageStop' in ev:
                    stop_reason = ev['messageStop'].get('stopReason')

            if assistant_chunks:
                messages.append({
                    'role': 'assistant',
                    'content': [{'text': ''.join(assistant_chunks)}],
                })

            if not tool_calls_buffer or stop_reason == 'end_turn':
                break

            # 4) tool dispatch
            tool_results: list = []
            for tc in tool_calls_buffer:
                try:
                    input_dict = json.loads(tc['input']) if tc['input'] else {}
                except json.JSONDecodeError:
                    input_dict = {}
                yield ('log', {'tool_call': tc['name'], 'input': input_dict})
                output = dispatch(
                    tc['name'], input_dict,
                    req.persona_id or 'marketing', req.session_id, req.cust_id,
                )
                yield ('log', {
                    'tool_result': tc['name'],
                    'output_summary': str(output)[:200],
                })
                tool_results.append({
                    'toolUseId': tc['toolUseId'],
                    'content': [{'json': output}],
                })
            messages.append({
                'role': 'user',
                'content': [{'toolResult': tr} for tr in tool_results],
            })

        # 5) output guardrail + memory write (assistant)
        final_text = ''.join(assistant_chunks)
        clean_out, viol = guardrail_apply(final_text, source='OUTPUT')
        if viol:
            yield ('log', {'guardrail': 'OUTPUT', 'violations': viol})
        write_event(
            _memory_id(), req.persona_id or 'marketing',
            req.session_id, 'assistant', clean_out, req.cust_id,
        )

        yield ('result', {
            'final_text': clean_out,
            'iterations': it + 1,
            'trace': get_trace_buf()[-10:],
        })

    return StreamingResponse(stream_phases(gen()), media_type='text/event-stream')
