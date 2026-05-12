'use client';

/** /cally — Cally 챗봇 전용 popup window 페이지.
 *  LayoutShell이 이 경로에서는 사이드바·top-bar·플로팅 챗봇을 모두 숨김.
 *  부서 선택기 + 5개 추천 풍선 + 채팅 스레드만 노출 (clean popup UI).
 *
 *  /chat과 동일한 SSE chat 도구 호출 패턴 (10 GCC 도구) 재사용.
 */
import { useEffect, useRef, useState } from 'react';
import { Bot, Send, RotateCcw, Wrench, Sparkles } from 'lucide-react';
import { streamSSE } from '@/lib/api-client';
import { MarkdownView } from '@/components/MarkdownView';
import { useActivePersona } from '@/lib/persona-context';
import type { Persona } from '@/lib/types';

const GSC_BRAND_GRADIENT = 'bg-gradient-to-br from-[#003278] via-[#0050A0] to-[#0067B1]';

const PERSONA_LABEL: Record<Persona, string> = {
  marketing: '마케팅', strategy: '고객전략', 'data-ai': '데이터·AI',
  crm: 'CRM·회원사업', 'retail-ops': '리테일영업',
};

const PERSONA_TONE: Record<Persona, string> = {
  marketing:    'border-blue-500/50    bg-blue-500/15    text-blue-200',
  strategy:     'border-emerald-500/50 bg-emerald-500/15 text-emerald-200',
  'data-ai':    'border-amber-500/50   bg-amber-500/15   text-amber-200',
  crm:          'border-rose-500/50    bg-rose-500/15    text-rose-200',
  'retail-ops': 'border-violet-500/50  bg-violet-500/15  text-violet-200',
};

const SAMPLE_QUERIES_BY_PERSONA: Record<Persona, string[]> = {
  marketing: [
    '안녕 Cally! VIP Black 등급 룩어라이크 50명 추천',
    '쿠폰 1000원 × 30일 캠페인 ROI 시뮬해줘',
    '서울 강남 출퇴근 시간대 전환률 높은 캠페인은?',
    '강수일 SMS 발송 효율과 ROAS 변화 분석',
    '고급휘발유 충성 30대 직장인 대상 캠페인 추천',
  ],
  strategy: [
    '안녕 Cally! 디젤 헤비유저와 휘발유 충성 고객 클러스터 차이',
    '21세 cust_id=12 페르소나 매칭 점수 분석',
    '디젤→premium 전환한 고객 outlier 패턴',
    '계절별 세그먼트 이동 (봄→여름) 패턴',
    'churn 위험 고객 top 100 + retention 캠페인 권고',
  ],
  'data-ai': [
    '안녕 Cally! PM+M 92 RON DIY 블렌딩 의심 고객 탐지',
    '현대카드 소비지수와 주유 빈도 상관 분석',
    '시간대별 주유 이상치 + matplotlib 차트',
    'KMeans 6 클러스터 centroid feature importance',
    '5K 고객 임베딩 t-SNE 2D 시각화',
  ],
  crm: [
    '안녕 Cally! PLCC 보유 고객 결제 매트릭스 + 멤버십 등급별',
    '마케팅 동의 약관 미동의 고객 캠페인 적격 판정',
    'Black 등급 고객의 주 이용 결제수단 분포',
    '신규 가입 90일 회원의 이탈 위험',
    'Gold→Black 등급 상승 후보 고객 top 50',
  ],
  'retail-ops': [
    '안녕 Cally! 서울 권역 GSC vs 경쟁사 매트릭스',
    'S0148 주유소 인근 룩어라이크 고객 50명',
    '셀프 주유소 매출 상위 시군구 5곳',
    '폭염일(28도+) 시도별 셀프 vs 풀서비스 비중',
    '경기 신도시 출퇴근 시간대 거래량 top 주유소',
  ],
};

type Msg = {
  role: 'user' | 'assistant';
  text: string;
  toolLogs?: { tool: string; input: unknown }[];
};

export default function CallyPage() {
  const { active, setActive } = useActivePersona();
  const [sessionId, setSessionId] = useState<string>('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [followups, setFollowups] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSessionId(`cally_${active}_${(globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36))}`);
    setMessages([]);
  }, [active]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streaming]);

  useEffect(() => {
    document.title = `Cally — GS Caltex AI (${PERSONA_LABEL[active]})`;
  }, [active]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || streaming) return;
    setMessages((m) => [...m, { role: 'user', text: t }, { role: 'assistant', text: '', toolLogs: [] }]);
    setDraft('');
    setStreaming(true);
    setFollowups([]);
    let assistantText = '';
    const toolLogs: { tool: string; input: unknown }[] = [];

    try {
      for await (const ev of streamSSE<{
        text?: string; tool_call?: string; input?: unknown;
        phase?: string; guardrail?: string;
        final_text?: string; suggested_followups?: string[];
      }>('/api/chat', {
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
            return [...m.slice(0, -1), { ...last, text: assistantText, toolLogs: [...toolLogs] }];
          });
        } else if ((ev.type === 'log' || ev.type === 'tool_call') && d.tool_call) {
          toolLogs.push({ tool: d.tool_call, input: d.input });
          setMessages((m) => {
            const last = m[m.length - 1];
            if (last?.role !== 'assistant') return m;
            return [...m.slice(0, -1), { ...last, toolLogs: [...toolLogs] }];
          });
        } else if (ev.type === 'result' && Array.isArray(d.suggested_followups)) {
          setFollowups(d.suggested_followups.filter((s): s is string => typeof s === 'string'));
        }
      }
    } finally {
      setStreaming(false);
    }
  }

  function reset() {
    setMessages([]);
    setFollowups([]);
    setSessionId(`cally_${active}_${(globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36))}`);
  }

  return (
    <div className="h-screen flex flex-col bg-ink-950 text-ink-100">
      {/* Header — 사이드바 없는 minimal navy + Cally 정체성 */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-[#0067B1]/30 bg-gradient-to-r from-[#003278]/15 via-[#0050A0]/5 to-transparent shrink-0">
        <div className={`w-10 h-10 rounded-full ${GSC_BRAND_GRADIENT} flex items-center justify-center shadow-md shrink-0`}>
          <Bot className="w-5 h-5 text-white" strokeWidth={2.5} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-ink-50">
            Cally <span className="text-[10px] font-mono text-[#7AB3E5] ml-1">GS Caltex AI</span>
          </div>
          <div className="text-[10px] text-ink-400">
            {PERSONA_LABEL[active]} 부서 톤 · 10 도구 · Sonnet 4.6
          </div>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={reset}
            className="text-[10px] text-ink-400 hover:text-ink-100 flex items-center gap-1 px-2 py-1 rounded hover:bg-ink-800"
            title="새 세션"
          >
            <RotateCcw className="w-3 h-3" /> 새로
          </button>
        )}
      </header>

      {/* 부서 선택기 — 5 부서 토글 (선택 시 5 풍선 갱신) */}
      <div className="px-4 py-3 border-b border-ink-800 shrink-0">
        <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-1.5 font-semibold">
          어떤 부서 시점으로 보시겠어요?
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(PERSONA_LABEL) as Persona[]).map((p) => {
            const isActive = active === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setActive(p)}
                className={[
                  'text-[11px] font-medium px-2.5 py-1 rounded-md border transition',
                  isActive
                    ? PERSONA_TONE[p] + ' font-bold'
                    : 'border-ink-700 bg-ink-800 text-ink-300 hover:border-ink-600',
                ].join(' ')}
              >
                {PERSONA_LABEL[p]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {messages.length === 0 && (
          <>
            <div className="p-3 rounded-lg bg-gradient-to-r from-[#003278]/20 to-[#0067B1]/10 border border-[#0067B1]/30 mb-3">
              <div className="text-sm font-semibold text-[#7AB3E5] mb-1">
                안녕하세요, Cally예요 ⚡
              </div>
              <div className="text-[11px] text-ink-300 leading-relaxed">
                GS Caltex 고객 온톨로지에 대해 자연어로 물어보세요. 50K 고객 · 139K 거래
                · 8.5K 주유소 데이터를 <strong className="text-[#7AB3E5]">{PERSONA_LABEL[active]}</strong> 부서 시점으로 분석해 드립니다.
              </div>
            </div>
            <div className="text-[10px] uppercase tracking-wider text-[#7AB3E5] font-semibold mb-1.5">
              💡 {PERSONA_LABEL[active]} 부서 추천 질문 (5개)
            </div>
            <div className="flex flex-col gap-1.5 mb-3">
              {(SAMPLE_QUERIES_BY_PERSONA[active] ?? []).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => send(q)}
                  disabled={streaming}
                  className="text-left text-xs px-3 py-2 rounded-md border border-ink-700 bg-ink-800 text-ink-200 hover:border-[#0067B1]/60 hover:text-[#7AB3E5] hover:bg-[#003278]/10 transition disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-ink-500 italic leading-relaxed">
              부서를 바꾸면 Cally의 어조와 KPI 우선순위, 추천 질문이 함께 바뀝니다.
            </p>
          </>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={[
              'p-2.5 rounded-md text-xs leading-relaxed',
              m.role === 'user'
                ? 'bg-[#003278]/15 border border-[#0067B1]/30 text-ink-100'
                : 'bg-ink-800 border border-ink-700 text-ink-200',
            ].join(' ')}
          >
            {m.role === 'user' ? (
              <span className="whitespace-pre-wrap">{m.text}</span>
            ) : (
              <MarkdownView text={m.text || (streaming ? '…' : '')} />
            )}
            {m.toolLogs && m.toolLogs.length > 0 && (
              <div className="mt-1.5 pt-1.5 border-t border-ink-700/40 text-[10px] text-ink-500 font-mono flex items-center gap-1">
                <Wrench className="w-3 h-3" />
                tool: {m.toolLogs.map((t) => t.tool).join(' · ')}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 후속 질문 추천 chip — 답변 직후 페르소나 톤 자연어 2-3개. 클릭 → 자동 send. */}
      {followups.length > 0 && !streaming && (
        <div className="px-3 pt-2 pb-1 border-t border-[#0067B1]/10 bg-ink-950 shrink-0">
          <div className="text-[9px] uppercase tracking-wider text-[#7AB3E5]/70 font-semibold mb-1.5 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Cally 추천 후속 질문
          </div>
          <div className="flex flex-wrap gap-1.5">
            {followups.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => send(q)}
                className="text-left text-[11px] px-2.5 py-1 rounded-full border border-[#0067B1]/40 bg-[#003278]/15 text-[#7AB3E5] hover:bg-[#003278]/30 hover:text-ink-50 transition"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={(e) => { e.preventDefault(); send(draft); }}
        className="flex gap-2 px-3 py-3 border-t border-[#0067B1]/20 bg-ink-950 shrink-0"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={streaming}
          placeholder="Cally에게 자연어로 질문하세요"
          className="flex-1 bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-xs text-ink-100 outline-none focus:border-[#0067B1] placeholder:text-ink-500 disabled:opacity-50"
          autoFocus
        />
        <button
          type="submit"
          disabled={!draft.trim() || streaming}
          className={`px-3 py-2 rounded-md ${GSC_BRAND_GRADIENT} hover:opacity-90 text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1 shadow-md`}
        >
          <Send className="w-3.5 h-3.5" />
          {streaming ? '…' : '전송'}
        </button>
      </form>
    </div>
  );
}
