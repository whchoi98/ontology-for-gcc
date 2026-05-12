'use client';

import { MarkdownView } from './MarkdownView';

/** chat thread bubble list — 다크 테마. user는 accent, assistant는 ink-800. */
type Msg = {
  role: 'user' | 'assistant';
  text: string;
  toolLogs?: { tool: string; input: unknown }[];
};

export default function ChatThread({
  messages,
  streaming = false,
}: {
  messages: Msg[];
  streaming?: boolean;
}) {
  return (
    <div className="space-y-4 pr-2">
      {messages.length === 0 && (
        <div className="text-xs text-ink-500 italic px-3 py-8 text-center border border-dashed border-ink-700 rounded-lg">
          질문을 입력하거나 위 추천을 클릭하면 대화가 여기에 표시됩니다.
        </div>
      )}
      {messages.map((m, i) => (
        <div
          key={i}
          className={`p-3 rounded-lg ${
            m.role === 'user'
              ? 'bg-accent-500/10 border border-accent-500/30 ml-12'
              : 'bg-ink-800 border border-ink-700 mr-12'
          }`}
        >
          <div className="text-xs font-semibold mb-1 text-ink-400">
            {m.role === 'user' ? '사용자' : '에이전트'}
          </div>
          {m.role === 'user' ? (
            <p className="text-sm whitespace-pre-wrap leading-relaxed text-ink-100">{m.text}</p>
          ) : (
            <MarkdownView text={m.text || (streaming ? '…' : '')} />
          )}
          {m.toolLogs && m.toolLogs.length > 0 && (
            <div className="mt-2 pt-2 border-t border-ink-700/50 text-[10px] text-ink-500 font-mono">
              도구 호출 {m.toolLogs.length}건: {m.toolLogs.map((t) => t.tool).join(' · ')}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
