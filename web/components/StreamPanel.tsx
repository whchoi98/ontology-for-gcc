'use client';

/** Plan 3 Task 3.2.3 — SSE event timeline.
 *  Renders phase / delta / log / result / final events with type-coded colors. */

interface Event {
  type: string;
  data: unknown;
}

const TONE: Record<string, string> = {
  phase: 'text-amber-300',
  delta: 'text-emerald-300',
  log: 'text-sky-300',
  result: 'text-purple-300',
  final: 'text-slate-400',
};

export default function StreamPanel({ events }: { events: Event[] }) {
  return (
    <div className="border rounded p-2 bg-slate-900 text-slate-100 font-mono text-xs h-48 overflow-y-auto">
      {events.length === 0 && <div className="text-slate-500">대기 중...</div>}
      {events.map((e, i) => (
        <div key={i} className="flex gap-2">
          <span className={`w-14 ${TONE[e.type] ?? 'text-slate-500'}`}>[{e.type}]</span>
          <span className="truncate">{JSON.stringify(e.data).slice(0, 200)}</span>
        </div>
      ))}
    </div>
  );
}
