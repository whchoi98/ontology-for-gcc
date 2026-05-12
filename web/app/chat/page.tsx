'use client';
import { useEffect, useRef, useState } from 'react';
import { streamSSE } from '@/lib/api-client';
import ChatThread from '@/components/ChatThread';
import ToolCallPanel from '@/components/ToolCallPanel';
import PersonaSwitchGcc from '@/components/PersonaSwitchGcc';
import { ScenarioHeader } from '@/components/ScenarioHeader';
import { useActivePersona } from '@/lib/persona-context';
import type { Persona } from '@/lib/types';

type Sample = { label: string; persona: Persona };
type Msg = {
  role: 'user' | 'assistant';
  text: string;
  toolLogs?: { tool: string; input: unknown }[];
};
type CallEvent = {
  tool_call?: string;
  tool_result?: string;
  input?: unknown;
  output_summary?: string;
};
type Phase = { name: string; detail?: string };

const CHAT_SAMPLES: Sample[] = [
  // 마케팅 — 5개
  { persona: 'marketing',  label: '고급휘발유 충성 30대 직장인 대상 SMS 캠페인 ROI 시뮬해줘' },
  { persona: 'marketing',  label: 'VIP Black 등급 대상 룩어라이크 후보 50명 추출' },
  { persona: 'marketing',  label: '쿠폰 1000원 × 30일 캠페인 baseline 대비 uplift 계산' },
  { persona: 'marketing',  label: '서울 강남 출퇴근 시간대 전환률 높은 캠페인 추천' },
  { persona: 'marketing',  label: '강수일 SMS 발송 효율과 ROAS 변화 분석' },
  // 고객전략 — 5개
  { persona: 'strategy',   label: '디젤 헤비유저와 휘발유 충성 고객 클러스터 차이' },
  { persona: 'strategy',   label: '21세 충성도 분석 — cust_id 12 페르소나 매칭' },
  { persona: 'strategy',   label: '디젤→premium 전환한 고객 outlier 패턴' },
  { persona: 'strategy',   label: '계절별 세그먼트 이동 (봄→여름) 패턴 분석' },
  { persona: 'strategy',   label: 'churn 위험 고객 top 100 + retention 캠페인 권고' },
  // 데이터·AI — 5개
  { persona: 'data-ai',    label: 'PM+M 92 RON DIY 블렌딩 의심 고객 탐지 (PDF 3페이지)' },
  { persona: 'data-ai',    label: '현대카드 소비지수와 주유 빈도 상관 분석' },
  { persona: 'data-ai',    label: '시간대별 주유 이상치 탐지 + matplotlib 차트' },
  { persona: 'data-ai',    label: 'KMeans 6 클러스터 centroid feature importance 해석' },
  { persona: 'data-ai',    label: '5K 고객 임베딩 t-SNE 2D 시각화 + 군집 라벨' },
  // CRM·회원사업 — 5개
  { persona: 'crm',        label: 'PLCC 보유 고객 결제 매트릭스 + 멤버십 등급별' },
  { persona: 'crm',        label: '마케팅 동의 약관 미동의 고객 캠페인 적격 판정' },
  { persona: 'crm',        label: 'Black 등급 고객의 주 이용 결제수단 분포' },
  { persona: 'crm',        label: '신규 가입 90일 회원의 거래 패턴 + 이탈 위험' },
  { persona: 'crm',        label: 'Gold→Black 등급 상승 후보 고객 top 50' },
  // 리테일영업 — 5개
  { persona: 'retail-ops', label: '서울 권역 GSC vs 경쟁사 매트릭스 + 권역 리포트' },
  { persona: 'retail-ops', label: 'S0148 주유소 인근 룩어라이크 고객 50명' },
  { persona: 'retail-ops', label: '셀프 주유소 매출 상위 시군구 5곳' },
  { persona: 'retail-ops', label: '폭염일(28도+) 시도별 셀프 vs 풀서비스 비중' },
  { persona: 'retail-ops', label: '경기 신도시 출퇴근 시간대 거래량 top 주유소' },
];

const PERSONA_TONE: Record<Persona, string> = {
  marketing:    'border-blue-500/50    bg-blue-500/15    text-blue-200',
  strategy:     'border-emerald-500/50 bg-emerald-500/15 text-emerald-200',
  'data-ai':    'border-amber-500/50   bg-amber-500/15   text-amber-200',
  crm:          'border-rose-500/50    bg-rose-500/15    text-rose-200',
  'retail-ops': 'border-violet-500/50  bg-violet-500/15  text-violet-200',
};

const PERSONA_LABEL: Record<Persona, string> = {
  marketing:    '마케팅',
  strategy:     '고객전략',
  'data-ai':    '데이터·AI',
  crm:          'CRM·회원사업',
  'retail-ops': '리테일영업',
};

const PHASE_META: Record<string, { label: string; tone: string }> = {
  guardrail:    { label: '입력 가드레일',   tone: 'border-rose-500/50   bg-rose-500/15   text-rose-200' },
  'guardrail-out': { label: '응답 가드레일', tone: 'border-rose-500/50   bg-rose-500/15   text-rose-200' },
  bedrock:      { label: 'Sonnet 4.6 추론', tone: 'border-orange-500/50 bg-orange-500/15 text-orange-200' },
  memory:       { label: 'AgentCore Memory', tone: 'border-cyan-500/50  bg-cyan-500/15   text-cyan-200' },
  tool_use:     { label: '도구 사용',        tone: 'border-cyan-500/50  bg-cyan-500/15   text-cyan-200' },
};

function phaseToneFor(name: string): { label: string; tone: string } {
  if (PHASE_META[name]) return PHASE_META[name];
  if (name.startsWith('tool:')) {
    return {
      label: name.replace('tool:', '🔧 '),
      tone: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200',
    };
  }
  return { label: name, tone: 'border-slate-500/50 bg-slate-500/15 text-slate-200' };
}

export default function ChatPage() {
  const { active, setActive } = useActivePersona();
  const [sessionId, setSessionId] = useState<string>('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [calls, setCalls] = useState<CallEvent[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [followups, setFollowups] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 부서 변경 시 새 세션 + 화면 초기화 → 추천 풍선말이 다시 표시되어
    // 다른 시점으로의 시작이 명확해진다.
    setSessionId(`gcc_${active}_${(globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36))}`);
    setMessages([]);
    setCalls([]);
    setPhases([]);
    setFollowups([]);
  }, [active]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streaming]);

  function lastAssistant(): Msg | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && messages[i].text.trim()) return messages[i];
    }
    return null;
  }

  function escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function downloadMarkdown() {
    const last = lastAssistant();
    if (!last) return;
    const userMsg = messages.slice(0, -1).reverse().find((m) => m.role === 'user');
    const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const md = [
      `# Cally 분석 — ${PERSONA_LABEL[active]} 부서`,
      ``,
      `> 생성: ${ts} · 페르소나: ${PERSONA_LABEL[active]} (${active}) · 모델: Sonnet 4.6`,
      ``,
      ...(userMsg ? [`## 질문`, ``, userMsg.text, ``] : []),
      `## 답변`,
      ``,
      last.text,
      ``,
      ...(last.toolLogs && last.toolLogs.length > 0
        ? [`---`, `**호출된 도구**: ${last.toolLogs.map((t) => `\`${t.tool}\``).join(' · ')}`, ``]
        : []),
    ].join('\n');
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cally-${active}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function printPdf() {
    const last = lastAssistant();
    if (!last) return;
    const userMsg = messages.slice(0, -1).reverse().find((m) => m.role === 'user');
    const ts = new Date().toLocaleString('ko-KR');
    const tools = (last.toolLogs ?? [])
      .map((t) => `<code>${escapeHtml(t.tool)}</code>`)
      .join(' &middot; ');
    const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<title>Cally 분석 - ${escapeHtml(PERSONA_LABEL[active])}</title>
<style>
  body { font-family: -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif; max-width: 720px; margin: 32px auto; padding: 0 24px; color: #1a1a1a; line-height: 1.6; }
  h1 { color: #003278; border-bottom: 2px solid #0067B1; padding-bottom: 8px; }
  h2 { color: #003278; margin-top: 24px; }
  .meta { color: #666; font-size: 11px; margin-bottom: 24px; }
  .q { background: #f5f5f5; padding: 12px 16px; border-left: 3px solid #0067B1; border-radius: 4px; white-space: pre-wrap; }
  .a { white-space: pre-wrap; }
  .tools { font-size: 11px; color: #666; border-top: 1px solid #ddd; padding-top: 12px; margin-top: 24px; }
  code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-size: 90%; }
  @media print { body { margin: 0; } }
</style></head><body>
<h1>Cally 분석 - ${escapeHtml(PERSONA_LABEL[active])} 부서</h1>
<div class="meta">생성: ${escapeHtml(ts)} &middot; 페르소나: ${escapeHtml(PERSONA_LABEL[active])} (${escapeHtml(active)}) &middot; 모델: Sonnet 4.6</div>
${userMsg ? `<h2>질문</h2><div class="q">${escapeHtml(userMsg.text)}</div>` : ''}
<h2>답변</h2><div class="a">${escapeHtml(last.text)}</div>
${tools ? `<div class="tools">호출된 도구: ${tools}</div>` : ''}
<script>window.addEventListener('load', () => setTimeout(() => window.print(), 250));</script>
</body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank', 'width=900,height=1200');
    if (!w) {
      URL.revokeObjectURL(url);
      return;
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function send(text: string) {
    const t = text.trim();
    if (!t || streaming) return;
    setMessages((m) => [...m, { role: 'user', text: t }, { role: 'assistant', text: '', toolLogs: [] }]);
    setDraft('');
    setStreaming(true);
    setCalls([]);
    setPhases([]);
    setFollowups([]);

    let assistantText = '';
    const sessionToolLogs: { tool: string; input: unknown }[] = [];
    type ChatData = {
      text?: string;
      tool_call?: string;
      tool_result?: string;
      input?: unknown;
      output_summary?: string;
      guardrail?: string;
      violations?: string[];
      phase?: string;
      final_text?: string;
      suggested_followups?: string[];
    };
    try {
      for await (const ev of streamSSE<ChatData>('/api/chat', {
        message: t,
        persona_id: active,
        session_id: sessionId,
        history: messages.map((m) => ({ role: m.role, content: [{ text: m.text }] })),
      })) {
        const d = ev.data || {};
        if (ev.type === 'delta' && d.text) {
          assistantText += d.text;
          setMessages((m) => {
            const last = m[m.length - 1];
            if (last?.role !== 'assistant') return m;
            return [...m.slice(0, -1), { ...last, text: assistantText, toolLogs: [...sessionToolLogs] }];
          });
        } else if (ev.type === 'log' || ev.type === 'tool_call' || ev.type === 'tool_result') {
          if (d.tool_call) {
            const call: CallEvent = { tool_call: d.tool_call, input: d.input };
            sessionToolLogs.push({ tool: d.tool_call, input: d.input });
            setCalls((c) => [...c, call]);
            setPhases((p) => [...p, { name: `tool:${d.tool_call}` }]);
          }
          if (d.tool_result) {
            setCalls((c) => {
              const last = c[c.length - 1];
              if (last && last.tool_call && !last.tool_result) {
                return [...c.slice(0, -1), { ...last, tool_result: d.tool_result, output_summary: d.output_summary }];
              }
              return [...c, { tool_result: d.tool_result, output_summary: d.output_summary }];
            });
          }
        } else if (ev.type === 'guardrail') {
          const phaseName = String(d.guardrail ?? '') === 'output' ? 'guardrail-out' : 'guardrail';
          setPhases((p) => [...p, { name: phaseName, detail: (d.violations ?? []).join(',').slice(0, 60) }]);
        } else if (ev.type === 'phase') {
          const name = String(d.phase ?? '');
          if (name === 'thinking' || name === 'bedrock') setPhases((p) => [...p, { name: 'bedrock' }]);
          else if (name === 'memory') setPhases((p) => [...p, { name: 'memory' }]);
          else if (name) setPhases((p) => [...p, { name }]);
        } else if (ev.type === 'result' && Array.isArray(d.suggested_followups)) {
          setFollowups(d.suggested_followups.filter((s): s is string => typeof s === 'string'));
        }
      }
    } finally {
      setStreaming(false);
    }
  }

  const filteredSamples = CHAT_SAMPLES.filter((s) => s.persona === active);

  return (
    <div className="min-h-screen flex flex-col">
      <ScenarioHeader
        scenario="B"
        title="페르소나 챗봇"
        tech="Bedrock Sonnet 4.6 + AgentCore Memory + Bedrock Guardrails 4토픽 + 10 도구 호출 → SSE"
      />

      <div className="flex-1 mx-auto w-full max-w-7xl px-6 py-6 grid lg:grid-cols-[1fr_360px] gap-6">
        <section className="flex flex-col h-[calc(100vh-160px)]">
          <div className="mb-4">
            <h1 className="text-2xl font-bold text-ink-50 mb-1.5">B. 마케터 대화 에이전트</h1>
            <p className="text-sm text-ink-300 leading-relaxed">
              부서 페르소나가 적용된 시스템 프롬프트로 Bedrock Sonnet 4.6과 대화합니다. AgentCore Memory가
              세션과 사용자 단·장기 기억을 유지하고, 가드레일 4토픽(폭력·증오·성·misinfo)이 입출력을 검사하며,
              에이전트는 필요에 따라 <span className="text-accent-300 font-semibold">10가지 도구</span>
              (semantic_search · neptune_query · campaign_simulator · behavior_change_detect · weather_join 등)를
              호출해 데이터에 기반한 답변을 만듭니다. 우측 패널에서 도구 호출이 실시간으로 표시됩니다.
            </p>
          </div>

          {/* 부서 토글 */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">
              부서 페르소나
            </span>
            <PersonaSwitchGcc value={active} onChange={(v) => setActive(v as Persona)} />
          </div>

          {/* 입력 */}
          <form onSubmit={(e) => { e.preventDefault(); void send(draft); }} className="flex gap-2 mb-3">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={streaming}
              placeholder={`${PERSONA_LABEL[active]} 페르소나로 질문하기...`}
              className="flex-1 rounded-lg border border-ink-700 bg-ink-900 px-4 py-2 text-sm text-ink-100 outline-none focus:ring-2 focus:ring-accent-500 placeholder:text-ink-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!draft.trim() || streaming}
              className="px-5 py-2 rounded-lg bg-accent-500 text-ink-950 font-semibold disabled:bg-ink-700 disabled:text-ink-400 hover:bg-accent-400 transition"
            >
              {streaming ? '응답 중…' : '전송'}
            </button>
          </form>

          {/* 파이프라인 phase chips */}
          {(streaming || phases.length > 0) && (
            <div className="mb-4 rounded-lg border border-ink-700 bg-ink-900 p-3">
              <div className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold mb-2 flex items-center gap-2">
                <span className={`inline-block w-1.5 h-1.5 rounded-full bg-orange-500 ${streaming ? 'animate-pulse' : ''}`} />
                에이전트 진행 중 — {phases.length}단계
              </div>
              <ol className="flex flex-wrap items-center gap-2">
                {phases.map((p, i) => {
                  const meta = phaseToneFor(p.name);
                  return (
                    <li
                      key={i}
                      className={`flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded border ${meta.tone}`}
                    >
                      <span className="text-[9px] opacity-60">{i + 1}.</span>
                      <span className="font-semibold">{meta.label}</span>
                      {p.detail && <span className="opacity-70">— {p.detail}</span>}
                    </li>
                  );
                })}
                {streaming && (
                  <li className="text-[11px] font-mono px-2 py-1 rounded border border-ink-700 bg-ink-800/50 text-ink-400 animate-pulse">
                    다음 단계…
                  </li>
                )}
              </ol>
            </div>
          )}

          {/* 부서별 추천 질문 (empty state) */}
          {messages.length === 0 && (
            <div className="mb-4">
              <div className="text-xs uppercase tracking-wider text-ink-400 font-semibold mb-2">
                {PERSONA_LABEL[active]} 부서 추천 질문 — 클릭하면 바로 전송됩니다
              </div>
              <div className="grid sm:grid-cols-1 xl:grid-cols-1 gap-2">
                {filteredSamples.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    disabled={streaming}
                    onClick={() => { setActive(s.persona); void send(s.label); }}
                    className="group flex items-start gap-2 text-left px-3 py-2.5 rounded-lg border border-ink-700 bg-ink-900 hover:border-accent-500/60 hover:bg-ink-800 transition disabled:opacity-50"
                  >
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${PERSONA_TONE[s.persona]}`}>
                      {PERSONA_LABEL[s.persona]}
                    </span>
                    <span className="text-sm text-ink-200 leading-snug group-hover:text-accent-200">
                      {s.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 채팅 thread */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <ChatThread messages={messages} streaming={streaming} />
          </div>

          {/* 답변 저장 (MD / PDF) — 마지막 assistant 응답 기준 */}
          {!streaming && lastAssistant() && (
            <div className="mt-3 flex items-center justify-end gap-2">
              <span className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
                마지막 답변 저장
              </span>
              <button
                type="button"
                onClick={downloadMarkdown}
                className="px-3 py-1.5 rounded-md border border-ink-700 bg-ink-800 text-ink-200 hover:border-accent-500/60 hover:text-accent-200 transition text-xs inline-flex items-center gap-1.5"
                title="Markdown 다운로드"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16"/></svg>
                MD
              </button>
              <button
                type="button"
                onClick={printPdf}
                className="px-3 py-1.5 rounded-md border border-ink-700 bg-ink-800 text-ink-200 hover:border-accent-500/60 hover:text-accent-200 transition text-xs inline-flex items-center gap-1.5"
                title="PDF 출력 (브라우저 인쇄에서 PDF로 저장)"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 14H5m14 0v4a2 2 0 01-2 2H7a2 2 0 01-2-2v-4m14 0V8a2 2 0 00-2-2H7a2 2 0 00-2 2v6m4-4h6m-6 4h6"/></svg>
                PDF
              </button>
            </div>
          )}

          {/* 후속 질문 추천 chip — 답변 직후, 페르소나 톤 자연어 2-3개. */}
          {followups.length > 0 && !streaming && messages.length > 0 && (
            <div className="mt-3 mb-1 rounded-lg border border-[#0067B1]/30 bg-[#003278]/10 p-3">
              <div className="text-[10px] uppercase tracking-wider text-[#7AB3E5] font-semibold mb-2 flex items-center gap-1">
                ✨ Cally 추천 후속 질문 — 클릭하면 바로 전송
              </div>
              <div className="flex flex-wrap gap-2">
                {followups.map((q) => (
                  <button
                    key={q}
                    type="button"
                    disabled={streaming}
                    onClick={() => void send(q)}
                    className="text-left text-xs px-3 py-1.5 rounded-full border border-[#0067B1]/50 bg-[#003278]/20 text-[#7AB3E5] hover:bg-[#003278]/40 hover:text-ink-50 transition disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* 우측 도구 호출 패널 */}
        <ToolCallPanel calls={calls} />
      </div>

      {/* 하단 동작 설명 */}
      <div className="mx-auto w-full max-w-7xl px-6 pb-8">
        <div className="p-5 rounded-lg border border-ink-700 bg-ink-900/60">
          <h3 className="text-sm font-semibold text-ink-100 mb-2 flex items-center gap-2">
            <span className="text-accent-400">⚙</span> 이 시나리오는 무엇을 하나요?
          </h3>
          <p className="text-xs text-ink-300 leading-relaxed">
            <strong className="text-ink-200">대화형 에이전트</strong>는 부서 페르소나의 KPI·어조로 시스템 프롬프트를 구성한
            Bedrock Sonnet 4.6 모델이, AgentCore Memory에서 세션·사용자 기억을 불러오고, 입력 가드레일 통과 후
            필요한 데이터 도구(semantic_search · neptune_query · campaign_simulator · cluster_run · lookalike_expand ·
            behavior_change_detect · weather_join · price_lookup · attribution_calc · ops_metrics_push)를 자율 호출해
            응답을 생성합니다. 응답에도 가드레일이 적용되고, 도구 호출 이력은 우측 트레이스 패널에 시간순으로 기록됩니다.
            우상단 페르소나를 바꾸면 동일 질문에 대한 답변 시점과 추천 질문이 부서 KPI에 맞춰 바뀝니다.
          </p>
        </div>
      </div>
    </div>
  );
}
