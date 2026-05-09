'use client';
import { useEffect, useState } from 'react';

export default function TracePanel() {
  const [d, setD] = useState<any>(null);
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
    const fetchOnce = () =>
      fetch(`${base}/ops/live/trace`)
        .then((r) => r.json())
        .then(setD)
        .catch(() => {});
    fetchOnce();
    const t = setInterval(fetchOnce, 3000);
    return () => clearInterval(t);
  }, []);
  const trace: any[] = d?.trace || [];
  return (
    <div className='border rounded p-3 bg-white'>
      <h3 className='font-semibold mb-2 text-sm'>도구 호출 트레이스 ({trace.length})</h3>
      <ul className='text-xs space-y-1 max-h-72 overflow-y-auto'>
        {trace.map((t: any, i: number) => (
          <li key={i} className='border-b py-1 flex gap-2 items-center'>
            <span className='font-mono text-blue-600'>{t.tool}</span>
            <span className='text-slate-500'>{t.ms}ms</span>
            <span className='truncate text-slate-600'>
              {JSON.stringify(t.input).slice(0, 60)}
            </span>
          </li>
        ))}
        {trace.length === 0 && (
          <li className='text-slate-400'>트레이스 없음 (대화 시작 시 누적)</li>
        )}
      </ul>
    </div>
  );
}
