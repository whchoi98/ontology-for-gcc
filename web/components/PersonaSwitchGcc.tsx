'use client';

/** 5 부서 persona toggle — 다크 테마 + 부서별 톤 색상.
 *  PERSONA_REGISTRY (api/services/persona.py) SSOT와 일치. */

const PERSONAS: { id: string; name: string; emoji: string; tone: string }[] = [
  { id: 'marketing',  name: '마케팅',         emoji: '📢', tone: 'border-blue-500/50    bg-blue-500/15    text-blue-200' },
  { id: 'strategy',   name: '고객전략',       emoji: '🎯', tone: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200' },
  { id: 'data-ai',    name: '데이터·AI',     emoji: '🧪', tone: 'border-amber-500/50   bg-amber-500/15   text-amber-200' },
  { id: 'crm',        name: 'CRM·회원사업', emoji: '💳', tone: 'border-rose-500/50    bg-rose-500/15    text-rose-200' },
  { id: 'retail-ops', name: '리테일영업',    emoji: '⛽', tone: 'border-violet-500/50  bg-violet-500/15  text-violet-200' },
];

export default function PersonaSwitchGcc({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PERSONAS.map((p) => {
        const active = value === p.id;
        return (
          <button
            key={p.id}
            onClick={() => onChange(p.id)}
            className={[
              'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border font-medium transition',
              active
                ? p.tone + ' shadow-sm'
                : 'border-ink-700 bg-ink-800 text-ink-300 hover:bg-ink-700 hover:text-ink-100',
            ].join(' ')}
          >
            <span className="text-sm leading-none">{p.emoji}</span>
            <span>{p.name}</span>
          </button>
        );
      })}
    </div>
  );
}
