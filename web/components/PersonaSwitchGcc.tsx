'use client';

/** Plan 3 Task 3.4.4 — 5 부서 persona toggle (matches PERSONA_REGISTRY SSOT).
 *  Distinct from the legacy mfg-template `PersonaSwitch.tsx` which uses 5 Hi-Tech roles. */

const PERSONAS: [string, string][] = [
  ['marketing', '마케팅'],
  ['strategy', '고객전략'],
  ['data-ai', '데이터·AI'],
  ['crm', 'CRM·회원사업'],
  ['retail-ops', '리테일영업'],
];

export default function PersonaSwitchGcc({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-1">
      {PERSONAS.map(([id, name]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`text-xs px-3 py-1 rounded border ${
            value === id
              ? 'bg-blue-600 text-white border-blue-700'
              : 'bg-white text-slate-700 border-slate-300'
          }`}
        >
          {name}
        </button>
      ))}
    </div>
  );
}
