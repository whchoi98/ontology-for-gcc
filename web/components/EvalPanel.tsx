'use client';
import { useEffect, useState } from 'react';

export default function EvalPanel() {
  const [d, setD] = useState<any>(null);
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
    fetch(`${base}/ops/live/eval`)
      .then((r) => r.json())
      .then(setD)
      .catch(() => setD(null));
  }, []);
  const scenarios: any[] = d?.scenarios || [];
  return (
    <div className='border rounded p-3 bg-white'>
      <h3 className='font-semibold mb-2 text-sm'>
        평가 스코어보드 ({d?.overall_pass_pct ?? 0}% 통과)
      </h3>
      <table className='w-full text-xs'>
        <thead>
          <tr className='border-b'>
            <th className='text-left py-1'>시나리오</th>
            <th className='text-right py-1'>케이스</th>
            <th className='text-right py-1'>통과</th>
          </tr>
        </thead>
        <tbody>
          {scenarios.map((s: any, i: number) => (
            <tr key={i} className='border-b'>
              <td>{s.scenario}</td>
              <td className='text-right'>{s.total}</td>
              <td
                className={`text-right ${
                  s.pass_pct >= 85 ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {s.pass_pct}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {scenarios.length === 0 && (
        <div className='text-xs text-slate-400 mt-1'>
          {d?.note || 'no eval data yet'}
        </div>
      )}
    </div>
  );
}
