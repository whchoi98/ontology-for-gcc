'use client';

/** Tool dispatch trace — 다크 테마. tool_call (→) / tool_result (←) 시간순. */
type Call = {
  tool_call?: string;
  tool_result?: string;
  input?: unknown;
  output_summary?: string;
};

export default function ToolCallPanel({ calls }: { calls: Call[] }) {
  return (
    <aside className="border-l border-ink-700 pl-4">
      <h2 className="text-sm font-semibold text-ink-100 mb-3 flex items-center gap-2">
        <span>도구 호출 로그</span>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ink-800 border border-ink-700 text-ink-400">
          {calls.length}건
        </span>
      </h2>
      {calls.length === 0 && (
        <p className="text-xs text-ink-500 italic">아직 도구 호출이 없습니다.</p>
      )}
      <ul className="space-y-2">
        {calls.map((c, i) => (
          <li key={i} className="p-2 rounded border border-ink-700 bg-ink-900">
            {c.tool_call && (
              <div>
                <div className="font-mono text-xs text-accent-300">→ {c.tool_call}</div>
                {c.input !== undefined && (
                  <pre className="text-[10px] text-ink-400 overflow-x-auto whitespace-pre-wrap break-all mt-1">
                    {JSON.stringify(c.input, null, 2).slice(0, 200)}
                  </pre>
                )}
              </div>
            )}
            {c.tool_result && (
              <div className={c.tool_call ? 'mt-1' : ''}>
                <div className="font-mono text-xs text-emerald-300">← {c.tool_result}</div>
                {c.output_summary && (
                  <pre className="text-[10px] text-ink-400 overflow-x-auto whitespace-pre-wrap break-all mt-1">
                    {String(c.output_summary).slice(0, 200)}
                  </pre>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
