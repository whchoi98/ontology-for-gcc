'use client';
import { useEffect, useState } from 'react';

export default function IngestPanel() {
  const [d, setD] = useState<any>(null);
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
    fetch(`${base}/ops/live/ingest`).then((r) => r.json()).then(setD).catch(() => setD(null));
  }, []);
  return (
    <div className='border rounded p-3 bg-white'>
      <h3 className='font-semibold mb-2 text-sm'>적재 카운트 (Neptune)</h3>
      <table className='w-full text-xs'>
        <tbody>
          {d?.counts?.map((c: any, i: number) => (
            <tr key={i} className='border-b'>
              <td className='py-1'>{c.class}</td>
              <td className='text-right py-1 font-mono'>
                {typeof c.count === 'number' ? c.count.toLocaleString() : c.count}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!d && <div className='text-xs text-slate-400'>loading…</div>}
    </div>
  );
}
