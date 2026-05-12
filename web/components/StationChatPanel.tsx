'use client';

/** 권역 경쟁 지도 페이지에 인라인으로 떠 있는 주유소 도우미 chat.
 *  GCC agent 도구 (nearest_stations, neptune_subgraph, semantic_search, customer_lookup)를
 *  자연어로 호출. retail의 LogisticsChatPanel 패턴 차용 + GCC 컨텍스트.
 */
import { useEffect, useRef, useState } from 'react';
import { Sparkles, RotateCcw, Wrench } from 'lucide-react';
import { chatStream } from '@/lib/api-client';
import { MarkdownView } from './MarkdownView';
import { useActivePersona } from '@/lib/persona-context';

// 현재 적재된 데이터로 답변 가능한 추천 질문 — Customer (50K) + FuelTransaction (139K)
// + GasStation (8.5K) + Region (17) 만 사용. FuelPrice / Cluster / Persona edges는
// 아직 미적재이므로 가격 비교 / 클러스터 / 페르소나-기반 질문은 제외.
const SAMPLE_QUERIES = [
  '서울에 있는 GSC 셀프 주유소 5곳',
  '경기도 GSC 주유소 거래량 top 10',
  '서울 시 GSC vs SK vs 현대 매장 수 비교',
  '20대 VIP 고객이 자주 가는 시도 top 5',
  '강남구 인근 5km 주유소 (S0148 기준)',
];

type ChatMessage = {
  role: 'user' | 'assistant';
  text: string;
  toolLogs?: { tool: string; input: unknown }[];
};

export function StationChatPanel() {
  const { active } = useActivePersona();
  const [sessionId, setSessionId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSessionId(`station_${active}_${crypto.randomUUID?.() ?? Date.now().toString(36)}`);
  }, [active]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streaming]);

  function send(text: string) {
    const t = text.trim();
    if (!t || streaming) return;
    setMessages((m) => [...m, { role: 'user', text: t }, { role: 'assistant', text: '', toolLogs: [] }]);
    setInput('');
    setStreaming(true);
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
      } else if (ev.type === 'stop' || ev.type === 'final') {
        setStreaming(false);
      }
    });
  }

  function reset() {
    cancelRef.current?.();
    setMessages([]);
    setSessionId(`station_${active}_${crypto.randomUUID?.() ?? Date.now().toString(36)}`);
  }

  return (
    <div className="flex flex-col h-full min-h-0 rounded-lg border border-ink-700 bg-ink-900">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-ink-700">
        <Wrench className="w-3.5 h-3.5 text-teal-400" />
        <span className="text-xs font-semibold text-ink-100">주유소 도우미</span>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ink-800 border border-ink-700 text-ink-400">
          nearest_stations · neptune_subgraph · semantic_search
        </span>
        {messages.length > 0 && (
          <button onClick={reset} className="ml-auto text-[10px] text-ink-400 hover:text-ink-200 flex items-center gap-1">
            <RotateCcw className="w-3 h-3" /> 새로
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {messages.length === 0 && (
          <>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-teal-300 font-semibold mb-1">
              <Sparkles className="w-3 h-3" /> 추천 질문
            </div>
            <div className="flex flex-col gap-1.5 mb-3">
              {SAMPLE_QUERIES.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  disabled={streaming}
                  className="text-left text-xs px-3 py-2 rounded-md border border-ink-700 bg-ink-800 text-ink-200 hover:border-teal-500/60 hover:text-teal-200 transition disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-ink-500 italic">
              <strong className="text-teal-300/90 font-semibold">nearest_stations</strong>(haversine k-NN) +{' '}
              <strong className="text-teal-300/90 font-semibold">neptune_subgraph</strong>(GasStation/Region 쿼리) +{' '}
              <strong className="text-teal-300/90 font-semibold">semantic_search</strong>(시도/유종 매칭) 도구로
              자연어 질문에 답합니다.
            </p>
          </>
        )}

        {messages.map((m, i) => (
          <div key={i} className={[
            'p-2 rounded-md text-xs leading-relaxed',
            m.role === 'user'
              ? 'bg-teal-500/10 border border-teal-500/30 text-ink-100'
              : 'bg-ink-800 border border-ink-700 text-ink-200',
          ].join(' ')}>
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

      <form onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="flex gap-2 px-3 py-2 border-t border-ink-700">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={streaming}
          placeholder="자연어로 질문 (예: 서울 권역 GSC 셀프 주유소)"
          className="flex-1 bg-ink-800 border border-ink-700 rounded-md px-3 py-1.5 text-xs text-ink-100 outline-none focus:border-teal-500 placeholder:text-ink-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!input.trim() || streaming}
          className="px-3 py-1.5 rounded-md bg-teal-500 hover:bg-teal-400 text-ink-950 text-xs font-semibold disabled:opacity-50"
        >
          {streaming ? '…' : '전송'}
        </button>
      </form>
    </div>
  );
}
