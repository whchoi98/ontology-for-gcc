'use client';

const SOURCE_COLOR: Record<string, string> = {
  app: 'bg-blue-100 border-blue-400 text-blue-800',
  transaction: 'bg-emerald-100 border-emerald-400 text-emerald-800',
  term: 'bg-purple-100 border-purple-400 text-purple-800',
  coupon: 'bg-amber-100 border-amber-400 text-amber-800',
};

type Event = {
  source?: string;
  ts?: string;
  event?: string;
  detail?: string;
};

type Transition = {
  ts?: string;
  from?: string;
  to?: string;
};

export default function JourneyTimeline({
  events,
  transitions,
}: {
  events: Event[];
  transitions: Transition[];
}) {
  const transitionTs = new Set(
    (transitions || []).map((t) => t.ts).filter(Boolean) as string[],
  );
  return (
    <div className='border-l-2 border-slate-300 pl-4 space-y-2'>
      {events.length === 0 && (
        <div className='text-slate-400 text-sm'>이벤트 없음</div>
      )}
      {events.map((e, i) => {
        const ts = e.ts ?? '';
        const isTransition = ts ? transitionTs.has(ts) : false;
        return (
          <div key={i} className='relative'>
            <div
              className={`absolute -left-[22px] top-1 w-3 h-3 rounded-full border-2 ${
                isTransition
                  ? 'bg-rose-500 border-rose-700'
                  : 'bg-slate-300 border-slate-500'
              }`}
            />
            <div className='text-xs font-mono text-slate-500'>{ts}</div>
            <div
              className={`inline-block px-2 py-1 rounded border text-xs ${
                SOURCE_COLOR[e.source ?? ''] || 'bg-slate-100'
              }`}
            >
              {e.source}: <span className='font-semibold'>{e.event}</span>
              {e.detail && (
                <span className='ml-2 text-slate-600'>· {e.detail}</span>
              )}
            </div>
            {isTransition && (
              <span className='ml-2 text-xs font-bold text-rose-600'>
                ★ 유종 전환
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
