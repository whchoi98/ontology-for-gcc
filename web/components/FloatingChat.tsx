'use client';

/** 전역 플로팅 챗봇 — 우하단 fixed 버튼 클릭 시 우측 드로어로 열림.
 *  GS Caltex 브랜드 톤 (navy) + 가상 캐릭터 "캘리 (Cally)" 명명 — Cal(tex) + ly.
 *  현재 active persona context 자동 사용. /chat 페이지와 동일한 chatStream
 *  도구 호출 패턴 (10 GCC 도구) 재사용. 모든 페이지에서 노출.
 *
 *  네이밍: "캘리" — Cal(tex) + ly. M&M본부 5 부서 페르소나 어조에 따라 답변
 *  스타일이 바뀜. 영문 라벨 "Cally · GS Caltex AI Concierge".
 */
import { useEffect, useRef, useState } from 'react';
import { Bot, X, RotateCcw, Sparkles, Send } from 'lucide-react';
import { chatStream } from '@/lib/api-client';
import { MarkdownView } from './MarkdownView';
import { useActivePersona } from '@/lib/persona-context';
import type { Persona } from '@/lib/types';

const PERSONA_LABEL: Record<Persona, string> = {
  marketing: '마케팅', strategy: '고객전략', 'data-ai': '데이터·AI',
  crm: 'CRM·회원사업', 'retail-ops': '리테일영업',
};

// 부서 페르소나별 5개 추천 자연어 질문 — 챗봇 열릴 때 active persona 기준 노출.
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

// GS Caltex 브랜드 톤 — "GS" 로고 폰트 색 (corporate navy / deep blue)
// - #003278 : "GS" 글자 컬러 (GS Group corporate navy)
// - #0050A0 : 중간 톤
// - #0067B1 : 강조 라이트 블루
// 적색 (Caltex 별)은 sub로만 사용하고 메인은 GS 폰트 톤으로 통일.
const GSC_BRAND_GRADIENT = 'bg-gradient-to-br from-[#003278] via-[#0050A0] to-[#0067B1]';

type ChatMessage = {
  role: 'user' | 'assistant';
  text: string;
  toolLogs?: { tool: string; input: unknown }[];
};

export default function FloatingChat() {
  const { active } = useActivePersona();
  const [open, setOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);   // Chrome popup 우회 — iframe modal
  const [sessionId, setSessionId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [followups, setFollowups] = useState<string[]>([]);
  const cancelRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSessionId(`float_${active}_${crypto.randomUUID?.() ?? Date.now().toString(36)}`);
  }, [active]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streaming]);

  // ESC to close (drawer 또는 modal)
  useEffect(() => {
    if (!open && !modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, modalOpen]);

  function send(text: string) {
    const t = text.trim();
    if (!t || streaming) return;
    setMessages((m) => [...m, { role: 'user', text: t }, { role: 'assistant', text: '', toolLogs: [] }]);
    setInput('');
    setStreaming(true);
    setFollowups([]);
    let assistantText = '';
    const toolLogs: { tool: string; input: unknown }[] = [];

    cancelRef.current = chatStream(t, sessionId, active, (event) => {
      const ev = event as { type: string; [k: string]: unknown };
      const data = (ev.data as Record<string, unknown>) ?? {};
      if (ev.type === 'delta' && typeof data.text === 'string') {
        assistantText += data.text;
        setMessages((m) => {
          const last = m[m.length - 1];
          if (last?.role !== 'assistant') return m;
          return [...m.slice(0, -1), { ...last, text: assistantText, toolLogs: [...toolLogs] }];
        });
      } else if (ev.type === 'log' || ev.type === 'tool_call') {
        const tc = data.tool_call;
        if (typeof tc === 'string') {
          toolLogs.push({ tool: tc, input: data.input });
          setMessages((m) => {
            const last = m[m.length - 1];
            if (last?.role !== 'assistant') return m;
            return [...m.slice(0, -1), { ...last, toolLogs: [...toolLogs] }];
          });
        }
      } else if (ev.type === 'result') {
        const sf = data.suggested_followups;
        if (Array.isArray(sf)) {
          setFollowups(sf.filter((s): s is string => typeof s === 'string'));
        }
      } else if (ev.type === 'stop' || ev.type === 'final') {
        setStreaming(false);
      }
    });
  }

  function reset() {
    cancelRef.current?.();
    setMessages([]);
    setFollowups([]);
    setSessionId(`float_${active}_${crypto.randomUUID?.() ?? Date.now().toString(36)}`);
  }

  function openCallyWindow() {
    // UA 분기: Chrome 은 Site Engagement Score 가 낮으면 features 충족해도
    // popup→tab fallback. 따라서 Chrome 에서는 in-page iframe modal 로 우회.
    // Firefox/Safari 는 features 명시만으로 popup window 보장.
    if (typeof window === 'undefined') return;
    const ua = navigator.userAgent;
    const isChrome = /Chrome/.test(ua) && !/Edg|OPR|Brave/.test(ua);
    if (isChrome) {
      setModalOpen(true);
      return;
    }
    const url = `${window.location.origin}/cally`;
    const features = 'popup=true,width=480,height=760,resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=no,status=no';
    const popup = window.open(url, '_blank', features);
    if (!popup || popup.closed) {
      // popup 차단 fallback — modal 로 전환
      setModalOpen(true);
      return;
    }
    try { popup.focus(); } catch { /* cross-origin focus */ }
  }

  return (
    <>
      {/* 우하단 플로팅 버튼 — GS 폰트 navy + 클릭 시 새 창에 /chat 열림 */}
      <button
        type="button"
        onClick={openCallyWindow}
        className={`fixed bottom-20 right-6 z-40 w-16 h-16 rounded-full ${GSC_BRAND_GRADIENT} text-white shadow-2xl shadow-blue-900/50 flex items-center justify-center transition-transform hover:scale-110 active:scale-95 ring-2 ring-white/20`}
        title={`Cally — GS Caltex AI 컨시어지 (새 창에서 열림 · ${PERSONA_LABEL[active]} 부서 톤)`}
      >
        <Bot className="w-7 h-7" strokeWidth={2.5} />
        <span className="absolute -top-1 -right-1 text-[9px] font-bold bg-white text-[#003278] rounded-full w-6 h-6 flex items-center justify-center border-2 border-[#003278] shadow-md">
          AI
        </span>
        <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[10px] font-bold text-white bg-[#003278] px-2 py-0.5 rounded-md whitespace-nowrap shadow-md">
          Cally
        </span>
      </button>

      {/* 드로어 (우측 슬라이드) */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm animate-in fade-in"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full sm:w-[440px] h-full bg-ink-900 border-l border-ink-700 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header — GS 폰트 navy + Cally 아이덴티티 */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#0067B1]/30 bg-gradient-to-r from-[#003278]/15 via-[#0050A0]/5 to-transparent">
              <div className={`w-9 h-9 rounded-full ${GSC_BRAND_GRADIENT} flex items-center justify-center shadow-md shrink-0`}>
                <Bot className="w-5 h-5 text-white" strokeWidth={2.5} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-ink-50 truncate">
                  Cally <span className="text-[10px] font-mono text-[#7AB3E5] ml-1">GS Caltex AI</span>
                </div>
                <div className="text-[10px] text-ink-400 truncate">
                  {PERSONA_LABEL[active]} 톤 · 10 도구 · Sonnet 4.6
                </div>
              </div>
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={reset}
                  className="text-[10px] text-ink-400 hover:text-ink-200 flex items-center gap-1 px-2 py-1 rounded hover:bg-ink-800"
                  title="새 세션"
                >
                  <RotateCcw className="w-3 h-3" /> 새로
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded hover:bg-ink-800 text-ink-400 hover:text-ink-200"
                title="닫기 (ESC)"
              >
                <X className="w-4 h-4" />
              </button>
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
                      · 8.5K 주유소 데이터를 부서 페르소나 시점으로 분석해 드립니다.
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[#7AB3E5] font-semibold mb-1.5">
                    <Sparkles className="w-3 h-3" /> Cally가 추천하는 질문
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
                    좌측 상단 부서 페르소나를 바꾸면 Cally의 어조와 KPI 우선순위도 같이 바뀝니다.
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
                    <div className="mt-1.5 pt-1.5 border-t border-ink-700/40 text-[10px] text-ink-500 font-mono">
                      tool: {m.toolLogs.map((t) => t.tool).join(' · ')}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* 후속 질문 추천 chip — 답변 직후 페르소나 톤 자연어 2-3개. */}
            {followups.length > 0 && !streaming && (
              <div className="px-3 pt-2 pb-1 border-t border-[#0067B1]/10 bg-ink-950">
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

            {/* Input — Cally 톤 (GS navy) */}
            <form
              onSubmit={(e) => { e.preventDefault(); send(input); }}
              className="flex gap-2 px-3 py-3 border-t border-[#0067B1]/20 bg-ink-950"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={streaming}
                placeholder="Cally에게 자연어로 질문하세요"
                className="flex-1 bg-ink-800 border border-ink-700 rounded-md px-3 py-2 text-xs text-ink-100 outline-none focus:border-[#0067B1] placeholder:text-ink-500 disabled:opacity-50"
                autoFocus
              />
              <button
                type="submit"
                disabled={!input.trim() || streaming}
                className={`px-3 py-2 rounded-md ${GSC_BRAND_GRADIENT} hover:opacity-90 text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1 shadow-md`}
              >
                <Send className="w-3.5 h-3.5" />
                {streaming ? '…' : '전송'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Chrome 분기 — iframe-based in-page popup. Site Engagement Score
          정책으로 window.open popup 이 새 탭 fallback 되는 Chrome 사용자에게
          시각적으로 같은 별도 창 경험 제공. iframe 은 같은 origin /cally 라
          Cognito 쿠키 + SSE 모두 자동 동작. */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="relative w-[480px] h-[760px] max-h-[90vh] bg-ink-900 border border-[#0067B1]/40 rounded-lg shadow-2xl shadow-blue-900/60 overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-[#0067B1]/30 bg-gradient-to-r from-[#003278]/30 to-[#0050A0]/15 shrink-0">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-[#7AB3E5]" strokeWidth={2.5} />
                <span className="text-xs font-bold text-ink-50">
                  Cally <span className="text-[9px] font-mono text-[#7AB3E5]">GS Caltex AI</span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 rounded hover:bg-ink-800 text-ink-400 hover:text-ink-200"
                title="닫기 (ESC)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <iframe
              src="/cally"
              title="Cally 챗봇"
              className="flex-1 w-full border-0 bg-ink-950"
            />
          </div>
        </div>
      )}
    </>
  );
}
