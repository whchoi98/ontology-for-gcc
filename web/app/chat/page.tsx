'use client';
import { useState } from 'react';
import { streamSSE } from '@/lib/api-client';
import ChatThread from '@/components/ChatThread';
import ToolCallPanel from '@/components/ToolCallPanel';
import PersonaSwitchGcc from '@/components/PersonaSwitchGcc';

/** Plan 3 Task 3.4.4 — 시나리오 B chat agent UI.
 *  Two-column layout: thread (left) + tool trace (right).
 *  Streams /api/chat SSE: delta → text bubbles, log → tool trace. */
type Msg = { role: 'user' | 'assistant'; text: string };
type CallEvent = {
  tool_call?: string;
  tool_result?: string;
  input?: unknown;
  output_summary?: string;
};
type ChatData = {
  text?: string;
  tool_call?: string;
  tool_result?: string;
  input?: unknown;
  output_summary?: string;
  guardrail?: string;
  violations?: string[];
};

export default function ChatPage() {
  const [persona, setPersona] = useState('marketing');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [calls, setCalls] = useState<CallEvent[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);

  async function send() {
    if (!draft.trim() || loading) return;
    const userMsg = draft.trim();
    setMessages((m) => [...m, { role: 'user', text: userMsg }]);
    setDraft('');
    setLoading(true);
    let assistantText = '';
    setMessages((m) => [...m, { role: 'assistant', text: '' }]);
    for await (const ev of streamSSE<ChatData>('/api/chat', {
      message: userMsg,
      persona_id: persona,
      session_id: 'web-1',
      history: messages.map((m) => ({ role: m.role, content: [{ text: m.text }] })),
    })) {
      const d = ev.data || {};
      if (ev.type === 'delta' && d.text) {
        assistantText += d.text;
        setMessages((m) => {
          const cp = [...m];
          cp[cp.length - 1] = { role: 'assistant', text: assistantText };
          return cp;
        });
      } else if (ev.type === 'log') {
        setCalls((c) => [...c, d as CallEvent]);
      }
    }
    setLoading(false);
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">B. 마케터 대화 에이전트</h1>
      <div className="flex items-center gap-3 mb-4">
        <PersonaSwitchGcc value={persona} onChange={setPersona} />
        <span className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">
          real
        </span>
        <span className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700 border border-amber-200">
          synthetic
        </span>
        <span className="text-xs px-2 py-1 rounded bg-sky-100 text-sky-700 border border-sky-200">
          external
        </span>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <ChatThread messages={messages} />
          <div className="mt-2 flex gap-2">
            <input
              className="flex-1 border rounded px-3 py-2"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="고급휘발유 업셀링 캠페인을 실행할거야..."
            />
            <button
              onClick={send}
              disabled={loading}
              className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
            >
              {loading ? '...' : '전송'}
            </button>
          </div>
        </div>
        <ToolCallPanel calls={calls} />
      </div>
    </div>
  );
}
