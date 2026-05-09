'use client';
import { useEffect, useState } from 'react';

export default function GuardrailPanel() {
  const [d, setD] = useState<any>(null);
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
    const t = setInterval(() => {
      fetch(`${base}/ops/live/guardrail`)
        .then((r) => r.json())
        .then(setD)
        .catch(() => {});
    }, 5000);
    fetch(`${base}/ops/live/guardrail`)
      .then((r) => r.json())
      .then(setD)
      .catch(() => setD(null));
    return () => clearInterval(t);
  }, []);
  const items: any[] = d?.guardrail || [];
  return (
    <div className='border rounded p-3 bg-white'>
      <h3 className='font-semibold mb-2 text-sm'>
        가드레일 위반 ({items.length})
      </h3>
      <ul className='text-xs space-y-1 max-h-72 overflow-y-auto'>
        {items.map((g: any, i: number) => (
          <li key={i} className='border-b py-1'>
            <span
              className={`text-xs px-1 rounded mr-1 ${
                g.source === 'INPUT' ? 'bg-amber-100' : 'bg-rose-100'
              }`}
            >
              {g.source}
            </span>
            <span className='font-mono'>{(g.violations || []).join(', ')}</span>
            <div className='text-slate-500 truncate'>{g.snippet}</div>
          </li>
        ))}
        {items.length === 0 && (
          <li className='text-slate-400'>위반 누적 없음</li>
        )}
      </ul>
    </div>
  );
}
