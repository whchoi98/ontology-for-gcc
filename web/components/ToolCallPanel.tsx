'use client';

/** Plan 3 Task 3.4.4 — tool dispatch trace timeline.
 *  Renders tool_call (→) followed by tool_result (←) entries. */
type Call = {
  tool_call?: string;
  tool_result?: string;
  input?: unknown;
  output_summary?: string;
};

export default function ToolCallPanel({ calls }: { calls: Call[] }) {
  return (
    <div className="border rounded p-2 bg-slate-50 h-[480px] overflow-y-auto text-xs space-y-1">
      <div className="font-semibold text-slate-700 mb-2">Tool Trace</div>
      {calls.length === 0 && <div className="text-slate-400">도구 호출 없음</div>}
      {calls.map((c, i) => (
        <div key={i} className="border-l-2 border-blue-400 pl-2">
          {c.tool_call && (
            <div>
              <span className="font-mono text-blue-600">→ {c.tool_call}</span>
              <pre className="text-[10px] text-slate-500">
                {JSON.stringify(c.input, null, 2).slice(0, 150)}
              </pre>
            </div>
          )}
          {c.tool_result && (
            <div>
              <span className="font-mono text-emerald-600">← {c.tool_result}</span>
              <pre className="text-[10px] text-slate-500">
                {(c.output_summary || '').slice(0, 150)}
              </pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
